import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FITNESS_RECOVERY_PER_DAY, FULL_FITNESS, REGULATION_MINUTES, YOUTH_OBJECTIVE_STARTS } from "../engine/balance";
import { fitnessAfter } from "../engine/fitness";
import { formationPositions } from "../engine/formations";
import { selectRestedLineup, type YouthStarter } from "../engine/lineup";
import { firstMatchdayDate, WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";
import type { ManagedLineup } from "./lineup";
import type { MatchdaySummary } from "./matchday";
import type { getStandings as getStandingsFunction } from "./standings";

// Plays the first matchday of a throwaway save with the demo seed, then deletes it. The whole-season version
// lives in matchday.slow.test.ts. Runs against DATABASE_URL and is skipped without it; modules are imported
// lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("playNextMatchday, first matchday", () => {
  let db: typeof prismaClient | undefined;
  let getStandings: typeof getStandingsFunction | undefined;
  let saveId = "";
  let summary: MatchdaySummary | null = null;
  // The managed club's weakest outfield player, saved up front in a 4-4-2: the automatic lineup never picks him.
  let pickedKey = "";
  // Suspended before the matchday: the managed club's best outfield player after a red card, an AI club's best player
  // after five league yellows. Both would have started.
  let suspendedKeys: string[] = [];

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    const [{ prisma }, support, { playNextMatchday }, standings, { saveManagedLineup }] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./standings"),
      import("./lineup"),
    ]);
    db = prisma;
    getStandings = standings.getStandings;
    saveId = await support.createDemoTwin("Test première journée");
    const weakest = await prisma.playerSave.findFirstOrThrow({
      where: { saveId, clubSave: { isManaged: true }, position: { not: "GK" } },
      orderBy: [{ overall: "asc" }, { playerKey: "asc" }],
      select: { playerKey: true },
    });
    pickedKey = weakest.playerKey;
    await saveManagedLineup(saveId, {
      formation: "4-4-2",
      // A starting instruction other than Équilibré: kept with the match.
      lineup: { starters: [{ slot: 9, playerKey: pickedKey }], benchOrder: [], instruction: "DEFEND" },
    });
    const best = (isManaged: boolean) =>
      prisma.playerSave.findFirstOrThrow({
        where: { saveId, clubSave: { isManaged }, position: { not: "GK" } },
        orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
        select: { id: true, playerKey: true },
      });
    const [managedBest, aiBest] = [await best(true), await best(false)];
    await prisma.playerSave.update({ where: { id: managedBest.id }, data: { suspendedMatches: 1 } });
    await prisma.playerSave.update({ where: { id: aiBest.id }, data: { suspendedLeagueMatches: 1 } });
    suspendedKeys = [managedBest.playerKey, aiBest.playerKey];
    summary = await playNextMatchday(saveId);
  }, 120_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 60_000);

  it("plays every fixture of the first date, and only those", async () => {
    const db = database();
    const firstMatchday = firstMatchdayDate(WORLD_START_YEAR);
    const [playedThatDay, unplayedThatDay, playedElsewhere] = await Promise.all([
      db.fixture.count({ where: { saveId, scheduledAt: firstMatchday, played: true } }),
      db.fixture.count({ where: { saveId, scheduledAt: firstMatchday, played: false } }),
      db.fixture.count({ where: { saveId, scheduledAt: { not: firstMatchday }, played: true } }),
    ]);

    expect(summary?.date.toISOString()).toBe(firstMatchday.toISOString());
    expect(playedThatDay).toBe(48);
    expect(summary?.fixtures).toBe(48);
    expect([unplayedThatDay, playedElsewhere]).toEqual([0, 0]);
  });

  it("plays the managed club's saved lineup: saving it took the line-up from the assistant", async () => {
    const stats = await database().playerSeasonStats.findFirst({
      where: { saveId, playerSave: { playerKey: pickedKey } },
      select: { appearances: true, minutes: true },
    });
    const save = await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { lineupByAssistant: true } });

    expect(stats?.appearances).toBe(1);
    expect(stats?.minutes).toBeGreaterThan(0);
    expect(save.lineupByAssistant).toBe(false);
  });

  it("records each goal, an event of the managed club's match or in another fixture's goal times, and counts them in the season stats", async () => {
    const db = database();
    const [fixtures, goalEvents, played, stats] = await Promise.all([
      db.fixture.aggregate({ where: { saveId, played: true }, _sum: { homeGoals: true, awayGoals: true } }),
      db.matchEvent.count({ where: { type: "GOAL", fixture: { saveId } } }),
      db.fixture.findMany({
        where: { saveId, played: true },
        select: { goalTimes: true, homeClubSave: { select: { isManaged: true } }, awayClubSave: { select: { isManaged: true } } },
      }),
      db.playerSeasonStats.aggregate({ where: { saveId }, _sum: { goals: true } }),
    ]);
    const goals = (fixtures._sum.homeGoals ?? 0) + (fixtures._sum.awayGoals ?? 0);
    const managed = played.find((fixture) => fixture.homeClubSave.isManaged || fixture.awayClubSave.isManaged);
    const goalTimes = played.reduce((sum, fixture) => sum + fixture.goalTimes.length, 0);

    expect(summary?.goals).toBe(goals);
    expect(managed?.goalTimes).toEqual([]);
    expect(goalEvents + goalTimes).toBe(goals);
    // Only the managed club's match keeps its goals as events.
    expect(await db.matchEvent.count({ where: { type: "GOAL", fixture: { saveId, homeClubSave: { isManaged: false }, awayClubSave: { isManaged: false } } } })).toBe(0);
    expect(stats._sum.goals).toBe(goals);
  });

  it("keeps the managed club's instructions with its match, from its starting one, and no other club's", async () => {
    const fixtures = await database().fixture.findMany({
      where: { saveId, played: true },
      select: { instructions: true, homeClubSave: { select: { isManaged: true } }, awayClubSave: { select: { isManaged: true } } },
    });
    const managed = fixtures.filter((fixture) => fixture.homeClubSave.isManaged || fixture.awayClubSave.isManaged);
    const { instructionsOf } = await import("./calendar");

    expect(managed).toHaveLength(1);
    const spans = instructionsOf(managed[0].instructions);
    expect(spans[0]).toEqual({ from: 0, instruction: "DEFEND", source: "START" });
    expect(spans.every((span, index) => index === 0 || span.from > spans[index - 1].from)).toBe(true);
    expect(fixtures.filter((fixture) => fixture.instructions !== null)).toHaveLength(1);
  });

  it("stores each goal on the side that scored it", async () => {
    const fixtures = await database().fixture.findMany({
      where: { saveId, played: true },
      select: { id: true, homeGoals: true, awayGoals: true, goalTimes: true, events: { where: { type: "GOAL" }, select: { side: true } } },
    });
    const { decodeGoalTimes } = await import("../engine/match");
    const sides = (fixture: (typeof fixtures)[number]) => [
      ...fixture.events.map((event) => (event.side === "HOME" ? "home" : "away")),
      ...decodeGoalTimes(fixture.goalTimes).map((goal) => goal.side),
    ];
    const mismatches = fixtures.filter(
      (fixture) =>
        sides(fixture).filter((side) => side === "home").length !== fixture.homeGoals ||
        sides(fixture).filter((side) => side === "away").length !== fixture.awayGoals,
    );

    expect(fixtures).toHaveLength(48);
    expect(mismatches.map((fixture) => fixture.id)).toEqual([]);
  });

  it("moves currentDate to the matchday and gives every club one played match", async () => {
    const db = database();
    if (getStandings === undefined) {
      throw new Error("Standings module not loaded");
    }
    const [save, seasons] = await Promise.all([
      db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
      db.season.findMany({ where: { saveId }, select: { id: true, competition: { select: { _count: { select: { clubs: true } } } } } }),
    ]);

    expect(save.currentDate.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    for (const season of seasons) {
      const table = await getStandings(saveId, season.id);
      expect(table).toHaveLength(season.competition._count.clubs);
      expect(table.every((row) => row.played === 1)).toBe(true);
    }
  });

  it("leaves every outfield player who played the whole match the fitness it cost him, and the others theirs", async () => {
    const players = await database().playerSave.findMany({
      where: { saveId, clubSaveId: { not: null } },
      select: { position: true, fitness: true, stats: { select: { minutes: true } } },
    });
    const whole = players.filter((player) => player.position !== "GK" && player.stats[0]?.minutes === REGULATION_MINUTES);
    const idle = players.filter((player) => player.stats.length === 0);

    expect(whole.length).toBeGreaterThan(400);
    expect(new Set(whole.map((player) => player.fitness))).toEqual(new Set([fitnessAfter(FULL_FITNESS, "CM", REGULATION_MINUTES)]));
    expect(idle.every((player) => player.fitness === FULL_FITNESS)).toBe(true);
  });

  it("keeps a suspended player out of his club's match, the managed club's and an AI club's, and counts it served", async () => {
    const players = await database().playerSave.findMany({
      where: { saveId, playerKey: { in: suspendedKeys } },
      select: { suspendedMatches: true, suspendedLeagueMatches: true, stats: { select: { appearances: true } } },
    });

    expect(players).toHaveLength(2);
    expect(players.every((player) => player.stats.length === 0)).toBe(true);
    expect(players.every((player) => player.suspendedMatches === 0 && player.suspendedLeagueMatches === 0)).toBe(true);
  });

  it("counts each player's cards: a booking towards the league's five, a red card for the club's next official match", async () => {
    const players = await database().playerSave.findMany({
      where: { saveId, stats: { some: {} } },
      select: { leagueYellows: true, cupYellows: true, suspendedMatches: true, stats: { select: { yellowCards: true, redCards: true } } },
    });
    const sentOff = players.filter((player) => player.stats[0].redCards > 0);
    const booked = players.filter((player) => player.stats[0].redCards === 0 && player.stats[0].yellowCards > 0);

    expect(booked.length).toBeGreaterThan(50);
    expect(booked.every((player) => player.leagueYellows === player.stats[0].yellowCards && player.cupYellows === 0)).toBe(true);
    expect(sentOff.every((player) => player.suspendedMatches === 1 && player.leagueYellows === 0)).toBe(true);
    expect(players.filter((player) => player.stats[0].redCards === 0).every((player) => player.suspendedMatches === 0)).toBe(true);
  }, 30_000);

  it("gives every player of the save his days of rest before the next date, up to full fitness, and rewrites only the rows that change", async () => {
    const db = database();
    const freeAgent = await db.playerSave.findFirstOrThrow({ where: { saveId, clubSaveId: null }, select: { id: true } });
    await db.playerSave.update({ where: { id: freeAgent.id }, data: { fitness: 40 } });
    // A player of a club that plays, out injured: his days of rest come in memory, kept by his match's write.
    const injured = await db.playerSave.findFirstOrThrow({
      where: { saveId, clubSave: { isManaged: true }, playerKey: { notIn: [pickedKey, ...suspendedKeys] } },
      orderBy: { playerKey: "asc" },
      select: { id: true },
    });
    await db.playerSave.update({ where: { id: injured.id }, data: { fitness: 40, injuredUntil: new Date(Date.UTC(2027, 0, 1)) } });
    // Each row's version (xmin) and what a matchday may change of it.
    const rows = () =>
      db.$queryRaw<{ id: string; version: string; values: string }[]>`
        SELECT "id", xmin::text AS version,
               concat_ws(',', "form", "fitness", "injuredUntil", "leagueYellows", "cupYellows", "suspendedMatches",
                         "suspendedLeagueMatches", "suspendedCupMatches") AS values
        FROM "PlayerSave" WHERE "saveId" = ${saveId}`;
    const before = new Map((await rows()).map((row) => [row.id, row]));
    const { playNextMatchday } = await import("./matchday");
    const next = await playNextMatchday(saveId);
    const after = await rows();
    const days = Math.round(((next?.date.getTime() ?? 0) - Date.UTC(2026, 7, 15)) / 86_400_000);
    const rested = await db.playerSave.findMany({ where: { saveId, id: { in: [freeAgent.id, injured.id] } }, select: { id: true, fitness: true } });

    expect(days).toBe(7);
    expect(rested.map((player) => player.fitness)).toEqual([40, 40].map((fitness) => Math.min(FULL_FITNESS, fitness + FITNESS_RECOVERY_PER_DAY * days)));
    // No row is written again unless it changes; most of the save's rows are left alone.
    const rewritten = after.filter((row) => row.version !== before.get(row.id)?.version);
    expect(rewritten.filter((row) => row.values === before.get(row.id)?.values).map((row) => row.id)).toEqual([]);
    expect(rewritten.length).toBeLessThan(after.length / 2);
  }, 120_000);
});

// The managed club's eleven made by its assistant (docs/design/simplification.md § 3), a new career's way, on a twin of
// the demo save whose first match comes the next day: its formation and starting instruction picked without taking the
// line-up, its best goalkeeper tired, the Jeunesse objective chosen and a young player one point below a starter at his
// position, the only one young enough.
describe.skipIf(process.env.DATABASE_URL === undefined)("playNextMatchday, the assistant's eleven", () => {
  let db: typeof prismaClient | undefined;
  let lineups: typeof import("./lineup") | undefined;
  let saveId = "";
  let managed = { id: "", seasonId: "" };
  let fielded: ManagedLineup | undefined; // getManagedLineup before the match
  let youth: YouthStarter | null | undefined; // the line-up editor's, before the match
  let summary: MatchdaySummary | null = null;
  let tiredKeeper = "";
  let young = ""; // the young player's key
  let replaced = ""; // the starter at his position he is one point below

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const loaded = (): typeof import("./lineup") => {
    if (lineups === undefined) {
      throw new Error("Modules not loaded");
    }
    return lineups;
  };

  beforeAll(async () => {
    const [{ prisma }, support, { playNextMatchday }, lineupModule] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./lineup"),
    ]);
    db = prisma;
    lineups = lineupModule;
    saveId = await support.createDemoTwin("Test onze de l'adjoint");
    // One day of rest before the match: a tired player is still tired at its kick-off.
    await prisma.save.update({ where: { id: saveId }, data: { currentDate: new Date(Date.UTC(WORLD_START_YEAR, 7, 14)) } });
    const club = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, competitionId: true } });
    const season = await prisma.season.findFirstOrThrow({
      where: { saveId, competitionId: club.competitionId, startYear: WORLD_START_YEAR },
      select: { id: true },
    });
    managed = { id: club.id, seasonId: season.id };
    await lineupModule.saveLineupPlan(saveId, { formation: "4-4-2", instruction: "ATTACK" });

    // Its best goalkeeper at 60, 65 at kick-off: the assistant rests him for the next one.
    const [keeper] = await prisma.playerSave.findMany({
      where: { saveId, clubSaveId: club.id, position: "GK" },
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      take: 1,
      select: { id: true, playerKey: true },
    });
    tiredKeeper = keeper.playerKey;
    await prisma.playerSave.update({ where: { id: keeper.id }, data: { fitness: 60 } });

    // The Jeunesse objective, the season's chosen one.
    await prisma.seasonObjective.updateMany({ where: { saveId, seasonId: season.id, imposed: false }, data: { chosen: false } });
    await prisma.seasonObjective.upsert({
      where: { seasonId_kind: { seasonId: season.id, kind: "YOUTH" } },
      create: { saveId, seasonId: season.id, kind: "YOUTH", imposed: false, chosen: true, target: YOUTH_OBJECTIVE_STARTS },
      update: { chosen: true },
    });

    // A reserve of a position the rested eleven plays, one point below its weakest starter there, the only player of the
    // squad young enough: the club's best young player, for the assistant.
    const { players } = await lineupModule.getLineupEditor(saveId);
    const rested = selectRestedLineup(players, formationPositions("4-4-2"));
    const starting = new Set(rested.starters.map(({ player }) => player.id));
    const pick = [...rested.starters]
      .filter(({ player, slot }) => player.position === slot && slot !== "GK")
      .sort((a, b) => a.player.overall - b.player.overall || (a.player.id < b.player.id ? -1 : 1))
      .map(({ player }) => ({ starter: player, reserve: players.find((other) => !starting.has(other.id) && other.position === player.position) }))
      .find(({ reserve }) => reserve !== undefined);
    if (pick?.reserve === undefined) {
      throw new Error("No reserve at a position of the eleven");
    }
    young = pick.reserve.id;
    replaced = pick.starter.id;
    await prisma.playerSave.updateMany({
      where: { saveId, clubSaveId: club.id, playerKey: { not: young } },
      data: { birthDate: new Date(Date.UTC(1995, 0, 1)) },
    });
    await prisma.playerSave.updateMany({
      where: { saveId, clubSaveId: club.id, playerKey: young },
      data: { birthDate: new Date(Date.UTC(2007, 0, 1)), overall: pick.starter.overall - 1 },
    });

    const editor = await lineupModule.getLineupEditor(saveId);
    youth = editor.youth;
    fielded = await lineupModule.getManagedLineup(saveId);
    summary = await playNextMatchday(saveId);
  }, 120_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 60_000);

  it("keeps the line-up the assistant's when its formation and starting instruction are picked", async () => {
    const [save, club] = await Promise.all([
      database().save.findUniqueOrThrow({ where: { id: saveId }, select: { lineupByAssistant: true } }),
      database().clubSave.findFirstOrThrow({ where: { id: managed.id, saveId }, select: { formation: true, lineup: true } }),
    ]);

    expect(save.lineupByAssistant).toBe(true);
    expect(club).toEqual({ formation: "4-4-2", lineup: { starters: [], benchOrder: [], instruction: "ATTACK" } });
  });

  it("shows on the screens the very eleven the match plays: the tired goalkeeper rested, the young player in", async () => {
    const stats = await database().playerSeasonStats.findMany({
      where: { saveId, seasonId: managed.seasonId, starts: 1, playerSave: { clubSaveId: managed.id } },
      select: { playerSave: { select: { playerKey: true } } },
    });
    const starters = fielded?.lineup.starters.map(({ player }) => player.id) ?? [];

    expect(youth).toEqual({ id: young, leagueStarts: 0 });
    expect(fielded).toMatchObject({ formation: "4-4-2", byAssistant: true, missingStarters: [] });
    expect(fielded?.lineup.instruction).toBe("ATTACK");
    expect(starters).toHaveLength(11);
    expect(starters).toContain(young);
    expect(starters).not.toContain(replaced);
    expect(starters).not.toContain(tiredKeeper);
    expect(stats.map(({ playerSave }) => playerSave.playerKey).sort()).toEqual([...starters].sort());
    // His own eleven: nobody picked in place of a saved starter.
    expect(summary?.managed?.autoFilledSlots).toBe(0);
  });

  it("starts the match with the starting instruction picked", async () => {
    const { instructionsOf } = await import("./calendar");
    const fixture = await database().fixture.findFirstOrThrow({
      where: { saveId, played: true, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
      select: { instructions: true },
    });

    expect(instructionsOf(fixture.instructions)[0]).toEqual({ from: 0, instruction: "ATTACK", source: "START" });
  });

  it("starts the young player until his 15th league start, and for the Jeunesse objective only", async () => {
    const { getLineupEditor, getManagedLineup } = loaded();
    const db = database();
    const row = await db.playerSeasonStats.findFirstOrThrow({
      where: { saveId, seasonId: managed.seasonId, playerSave: { clubSaveId: managed.id, playerKey: young } },
      select: { id: true, starts: true },
    });
    expect(row.starts).toBe(1);
    expect((await getLineupEditor(saveId)).youth).toEqual({ id: young, leagueStarts: 1 });

    await db.playerSeasonStats.update({ where: { id: row.id }, data: { starts: YOUTH_OBJECTIVE_STARTS } });
    expect((await getLineupEditor(saveId)).youth).toEqual({ id: young, leagueStarts: YOUTH_OBJECTIVE_STARTS });
    const done = await getManagedLineup(saveId);
    expect(done.lineup.starters.map(({ player }) => player.id)).not.toContain(young);

    // Another objective the season's: no Jeunesse.
    await db.seasonObjective.updateMany({ where: { saveId, seasonId: managed.seasonId, kind: "YOUTH" }, data: { chosen: false } });
    await db.seasonObjective.upsert({
      where: { seasonId_kind: { seasonId: managed.seasonId, kind: "SOLIDITY" } },
      create: { saveId, seasonId: managed.seasonId, kind: "SOLIDITY", imposed: false, chosen: true, target: 40 },
      update: { chosen: true },
    });
    expect((await getLineupEditor(saveId)).youth).toBeNull();
  });
});
