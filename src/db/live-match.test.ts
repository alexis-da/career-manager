import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HALF_TIME_MINUTE, MAX_SUBSTITUTIONS } from "../engine/balance";
import { automaticHalfTimeChoice, HalfTimeChoiceError, type HalfTimeChoice } from "../engine/match";
import { firstMatchdayDate, WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

// Three throwaway twins of the demo save play their first matchday: one stops the managed club's match at
// half-time and resumes it without a change, one plays it straight through, one resumes it with a substitution
// and a switch to 4-4-2. Runs against DATABASE_URL and is skipped without it; modules are imported lazily
// because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a managed match paused at half-time", () => {
  let db: typeof prismaClient | undefined;
  let modules:
    | {
        matchday: typeof import("./matchday");
        live: typeof import("./live-match");
        liveState: typeof import("./live-state");
        simulation: typeof import("./simulation");
        season: typeof import("./season");
      }
    | undefined;
  const saves = { paused: "", straight: "", changed: "" };

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const loaded = () => {
    if (modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return modules;
  };

  const managedFixture = (saveId: string) =>
    database().fixture.findFirstOrThrow({
      where: { saveId, scheduledAt: firstMatchdayDate(WORLD_START_YEAR), OR: [{ homeClubSave: { isManaged: true } }, { awayClubSave: { isManaged: true } }] },
      select: {
        id: true,
        status: true,
        played: true,
        homeGoals: true,
        awayGoals: true,
        homeHalfTimeGoals: true,
        awayHalfTimeGoals: true,
        liveState: true,
        events: {
          orderBy: [{ minute: "asc" }, { id: "asc" }],
          select: { minute: true, type: true, side: true, playerSave: { select: { playerKey: true } }, relatedPlayerSave: { select: { playerKey: true } } },
        },
      },
    });

  const eventKeys = (fixture: Awaited<ReturnType<typeof managedFixture>>) =>
    fixture.events.map((event) => [event.minute, event.type, event.side, event.playerSave?.playerKey, event.relatedPlayerSave?.playerKey]);

  const liveFixtureIdOf = async (saveId: string) =>
    (await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true } })).liveFixtureId;

  /** The half-time state stored for a save's paused match. */
  const storedHalfTime = async (saveId: string) => {
    const fixture = await managedFixture(saveId);
    return loaded().liveState.parseLiveState(fixture.id, fixture.liveState);
  };

  beforeAll(async () => {
    const [{ prisma }, support, matchday, live, liveState, simulation, season] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./live-match"),
      import("./live-state"),
      import("./simulation"),
      import("./season"),
    ]);
    db = prisma;
    modules = { matchday, live, liveState, simulation, season };
    [saves.paused, saves.straight, saves.changed] = await Promise.all([
      support.createDemoTwin("Test mi-temps"),
      support.createDemoTwin("Test sans pause"),
      support.createDemoTwin("Test changements"),
    ]);
    await Promise.all([
      matchday.playNextMatchday(saves.paused, { pauseManagedMatch: true }),
      matchday.playNextMatchday(saves.straight),
      matchday.playNextMatchday(saves.changed, { pauseManagedMatch: true }),
    ]);
  }, 300_000);

  afterAll(async () => {
    for (const saveId of Object.values(saves)) {
      if (saveId !== "") {
        await db?.save.delete({ where: { id: saveId } });
      }
    }
    await db?.$disconnect();
  }, 120_000);

  it("stops the managed club's match at half-time and plays every other match of the day in full", async () => {
    const db = database();
    const fixture = await managedFixture(saves.paused);
    const [others, save] = await Promise.all([
      db.fixture.groupBy({
        by: ["status"],
        where: { saveId: saves.paused, scheduledAt: firstMatchdayDate(WORLD_START_YEAR), id: { not: fixture.id } },
        _count: true,
      }),
      db.save.findUniqueOrThrow({ where: { id: saves.paused }, select: { liveFixtureId: true, currentDate: true } }),
    ]);

    expect(fixture).toMatchObject({ status: "HALF_TIME", played: false, homeGoals: null, awayGoals: null });
    expect(fixture.homeHalfTimeGoals).not.toBeNull();
    expect(fixture.liveState).not.toBeNull();
    expect(fixture.events.every((event) => event.minute <= HALF_TIME_MINUTE)).toBe(true);
    expect(fixture.events.filter((event) => event.type === "GOAL").length).toBe(
      (fixture.homeHalfTimeGoals ?? 0) + (fixture.awayHalfTimeGoals ?? 0),
    );
    expect(others).toEqual([{ status: "PLAYED", _count: 47 }]);
    expect(save.liveFixtureId).toBe(fixture.id);
    expect(save.currentDate.toISOString()).toBe(firstMatchdayDate(WORLD_START_YEAR).toISOString());
  });

  it("refuses to play on, simulate or change season while the match waits", async () => {
    const { matchday, simulation, season } = loaded();
    const nextYear = new Date(Date.UTC(WORLD_START_YEAR + 1, 5, 30));

    await expect(matchday.playNextMatchday(saves.paused, { pauseManagedMatch: true })).rejects.toBeInstanceOf(matchday.MatchInProgressError);
    await expect(matchday.playNextMatchday(saves.paused)).rejects.toBeInstanceOf(matchday.MatchInProgressError);
    await expect(simulation.simulateMatchdays(saves.paused, nextYear)).rejects.toBeInstanceOf(matchday.MatchInProgressError);
    expect(await simulation.planSimulation(saves.paused, { kind: "season-end" })).toMatchObject({ matchInProgress: true, matchdays: 0 });
    await expect(season.advanceToNextSeason(saves.paused)).rejects.toBeInstanceOf(matchday.MatchInProgressError);
    expect(await liveFixtureIdOf(saves.paused)).not.toBeNull();
  });

  it("refuses an invalid half-time choice and writes nothing", async () => {
    const { managedSide, state } = await storedHalfTime(saves.paused);
    const team = state[managedSide];
    const automatic = automaticHalfTimeChoice(state, managedSide);
    const starters = team.pitch.filter((entry) => entry.status === "ON");
    const tooMany: HalfTimeChoice = {
      ...automatic,
      substitutions: team.bench.slice(0, MAX_SUBSTITUTIONS + 1).map((player, index) => ({ in: player.id, out: starters[index].player.id })),
    };

    await expect(loaded().live.resumeLiveMatch(saves.paused, tooMany)).rejects.toBeInstanceOf(HalfTimeChoiceError);
    expect((await managedFixture(saves.paused)).status).toBe("HALF_TIME");
  });

  it("resumed without a change, gives the same match as one played without a pause", async () => {
    const resumed = await loaded().live.resumeLiveMatch(saves.paused, null);
    const [paused, straight] = await Promise.all([managedFixture(saves.paused), managedFixture(saves.straight)]);

    expect(resumed.fixtureId).toBe(paused.id);
    expect(paused).toMatchObject({ status: "PLAYED", played: true, liveState: null });
    expect(await liveFixtureIdOf(saves.paused)).toBeNull();
    expect([paused.homeGoals, paused.awayGoals, paused.homeHalfTimeGoals, paused.awayHalfTimeGoals]).toEqual([
      straight.homeGoals,
      straight.awayGoals,
      straight.homeHalfTimeGoals,
      straight.awayHalfTimeGoals,
    ]);
    expect(eventKeys(paused)).toEqual(eventKeys(straight));
    expect(straight.status).toBe("PLAYED");
    expect(await liveFixtureIdOf(saves.straight)).toBeNull();
  });

  it("keeps the same season stats, form and injuries as a match played without a pause", async () => {
    const db = database();
    const snapshot = async (saveId: string) => {
      const [stats, players] = await Promise.all([
        db.playerSeasonStats.findMany({
          where: { saveId },
          select: { appearances: true, minutes: true, goals: true, assists: true, yellowCards: true, redCards: true, playerSave: { select: { playerKey: true } } },
          orderBy: { playerSave: { playerKey: "asc" } },
        }),
        db.playerSave.findMany({ where: { saveId }, select: { playerKey: true, form: true, injuredUntil: true }, orderBy: { playerKey: "asc" } }),
      ]);
      return { stats, players };
    };

    expect(await snapshot(saves.paused)).toEqual(await snapshot(saves.straight));
  });

  it("plays the second half with the manager's substitution and formation, the substitution dated 46'", async () => {
    const { managedSide, state } = await storedHalfTime(saves.changed);
    const automatic = automaticHalfTimeChoice(state, managedSide);
    const team = state[managedSide];
    const comingOn = new Set(automatic.substitutions.map((substitution) => substitution.in));
    const leaving = automatic.starters.find((starter) => starter.slot === 9) ?? automatic.starters[automatic.starters.length - 1];
    const substitute = team.bench.find((player) => player.position !== "GK" && !comingOn.has(player.id));
    if (substitute === undefined) {
      throw new Error("No substitute left");
    }
    const choice: HalfTimeChoice = {
      formation: "4-4-2",
      starters: automatic.starters.map((starter) => (starter === leaving ? { ...starter, playerKey: substitute.id } : starter)),
      substitutions: [...automatic.substitutions, { in: substitute.id, out: leaving.playerKey }],
    };

    await loaded().live.resumeLiveMatch(saves.changed, choice);
    const fixture = await managedFixture(saves.changed);
    const managedEvent = managedSide === "home" ? "HOME" : "AWAY";

    expect(fixture.status).toBe("PLAYED");
    expect(fixture.events).toContainEqual({
      minute: HALF_TIME_MINUTE + 1,
      type: "SUBSTITUTION",
      side: managedEvent,
      playerSave: { playerKey: substitute.id },
      relatedPlayerSave: { playerKey: leaving.playerKey },
    });
    const stats = await database().playerSeasonStats.findFirstOrThrow({
      where: { saveId: saves.changed, playerSave: { saveId: saves.changed, playerKey: leaving.playerKey } },
      select: { minutes: true },
    });
    expect(stats.minutes).toBe(HALF_TIME_MINUTE);
    // The half-time formation is for this match only: the saved one does not change.
    const club = await database().clubSave.findFirstOrThrow({ where: { saveId: saves.changed, isManaged: true }, select: { formation: true } });
    expect(club.formation).toBe("4-3-3");
  });

  it("never pauses in the quick simulation", async () => {
    const { simulation } = loaded();
    const batch = await simulation.simulateMatchdays(saves.straight, new Date(Date.UTC(WORLD_START_YEAR + 1, 5, 30)), 1);

    expect(batch.played).toBe(1);
    expect(batch.matches.every((match) => match.played)).toBe(true);
    expect(await liveFixtureIdOf(saves.straight)).toBeNull();
    expect(await database().fixture.count({ where: { saveId: saves.straight, status: "HALF_TIME" } })).toBe(0);
  });
});
