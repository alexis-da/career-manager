import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  europeDates,
  europeReputationBonus,
  EUROPE_FINAL_ROUND,
  EUROPE_STAGES,
  type EuropeEntrant,
} from "../engine/europe";
import { budgetCoefficient, type ObjectiveOutcome } from "../engine/objectives";
import { reputationAfterSeason, reputationTarget } from "../engine/reputation";
import { computeStandings } from "../engine/standings";
import { competitionTier } from "../engine/tiers";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

const FIRST_YEAR = WORLD_START_YEAR;
const DAY_MS = 86_400_000;
const DAY = (date: Date): string => date.toISOString().slice(0, 10);

type Db = typeof prismaClient;

/** Each first division's final table of a year, its clubs' slugs by rank, by country; and each club's row. */
async function finalTables(db: Db, saveId: string, startYear: number) {
  const seasons = await db.season.findMany({
    where: { saveId, startYear, competition: { kind: "LEAGUE" } },
    select: { id: true, competition: { select: { code: true, tier: true } } },
  });
  const tables = new Map<string, { code: string; tier: number; rows: ReturnType<typeof computeStandings> }>();
  for (const season of seasons) {
    const fixtures = await db.fixture.findMany({
      where: { saveId, seasonId: season.id, played: true },
      select: { homeGoals: true, awayGoals: true, homeClubSave: { select: { club: { select: { slug: true } } } }, awayClubSave: { select: { club: { select: { slug: true } } } } },
    });
    tables.set(season.competition.code, {
      code: season.competition.code,
      tier: season.competition.tier,
      rows: computeStandings(
        fixtures.map((fixture) => ({
          home: fixture.homeClubSave.club.slug,
          away: fixture.awayClubSave.club.slug,
          homeGoals: fixture.homeGoals ?? 0,
          awayGoals: fixture.awayGoals ?? 0,
        })),
      ),
    });
  }
  return tables;
}

/** A European season's clubs, by code and year. */
async function entrantsOf(db: Db, saveId: string, code: string, startYear: number): Promise<EuropeEntrant[]> {
  const { parseEuropeEntrants } = await import("./europe");
  const season = await db.season.findFirstOrThrow({ where: { saveId, startYear, competition: { code } }, select: { id: true, entrants: true } });
  return parseEuropeEntrants(season.id, season.entrants);
}

/**
 * Plays a save's whole season in a moment, by hand: every match of its seasons in progress written 1-0 for its home club,
 * a knockout tie won by it. Only the cups' first rounds and the leagues exist then (a save without Europe): enough for
 * the transition, which needs every match played.
 */
async function writeSeasonPlayed(db: Db, saveId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "Fixture" AS f
    SET "played" = true, "status" = 'PLAYED'::"FixtureStatus", "homeGoals" = 1, "awayGoals" = 0, "homeHalfTimeGoals" = 0,
        "awayHalfTimeGoals" = 0,
        "decidedBy" = CASE WHEN c."kind" = 'LEAGUE' THEN NULL ELSE 'REGULATION'::"DecidedBy" END,
        "winnerClubSaveId" = CASE WHEN c."kind" = 'LEAGUE' THEN NULL ELSE f."homeClubSaveId" END
    FROM "Season" AS s JOIN "Competition" AS c ON c."id" = s."competitionId"
    WHERE f."seasonId" = s."id" AND f."saveId" = ${saveId} AND s."completed" = false`;
  const last = await db.fixture.findFirstOrThrow({ where: { saveId }, orderBy: { scheduledAt: "desc" }, select: { scheduledAt: true } });
  await db.save.update({ where: { id: saveId }, data: { currentDate: last.scheduledAt } });
}

// Two seasons of a worldVersion 2 save with the European competitions, on a twin of the demo save: the first one played in
// full (both competitions to their finals), then the move to the next one, which qualifies its clubs from the final tables
// and the cups' winners. Then a save from before Europe, which gets it at its next season, and a challenge save, which
// never does. Runs against DATABASE_URL and is skipped without it; modules are imported lazily.
describe.skipIf(process.env.DATABASE_URL === undefined)("European seasons", () => {
  let db: Db | undefined;
  let saveId = "";
  let managedId = "";
  let tables = new Map<string, { code: string; tier: number; rows: ReturnType<typeof computeStandings> }>();
  let reputationsBefore = new Map<string, { reputation: number; slug: string; code: string }>();
  let runBefore: Awaited<ReturnType<typeof import("./europe").clubEuropeRun>> = null;
  let cupWinners = new Map<string, string>(); // country prefix → slug of the season's cup winner
  const fixturesOfFirstSeason: { code: string; round: number; date: string; home: string; away: string; played: boolean; winner: string | null; decidedBy: string | null }[] = [];

  const database = (): Db => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    const [{ prisma }, support, season, europe] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./season"),
      import("./europe"),
    ]);
    db = prisma;
    saveId = await support.createDemoTwin("Test saisons européennes", 2);
    managedId = (await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } })).id;
    await support.playRemainingMatchdays(saveId);

    const rows = await prisma.fixture.findMany({
      where: { saveId, season: { startYear: FIRST_YEAR, competition: { kind: "EUROPE" } } },
      select: {
        round: true,
        scheduledAt: true,
        played: true,
        decidedBy: true,
        season: { select: { competition: { select: { code: true } } } },
        homeClubSave: { select: { club: { select: { slug: true } } } },
        awayClubSave: { select: { club: { select: { slug: true } } } },
        winnerClubSave: { select: { club: { select: { slug: true } } } },
      },
    });
    fixturesOfFirstSeason.push(
      ...rows.map((row) => ({
        code: row.season.competition.code,
        round: row.round,
        date: DAY(row.scheduledAt),
        home: row.homeClubSave.club.slug,
        away: row.awayClubSave.club.slug,
        played: row.played,
        winner: row.winnerClubSave?.club.slug ?? null,
        decidedBy: row.decidedBy,
      })),
    );
    tables = await finalTables(prisma, saveId, FIRST_YEAR);
    const clubs = await prisma.clubSave.findMany({
      where: { saveId },
      select: { id: true, reputation: true, club: { select: { slug: true } }, competition: { select: { code: true } } },
    });
    reputationsBefore = new Map(clubs.map((club) => [club.id, { reputation: club.reputation, slug: club.club.slug, code: club.competition.code }]));
    const europeSeasons = await prisma.season.findMany({ where: { saveId, startYear: FIRST_YEAR, competition: { kind: "EUROPE" } }, select: { id: true } });
    runBefore = await europe.clubEuropeRun(prisma, saveId, managedId, europeSeasons.map((row) => row.id));
    const finals = await prisma.fixture.findMany({
      where: { saveId, round: 6, played: true, season: { startYear: FIRST_YEAR, competition: { kind: "CUP" } } },
      select: { season: { select: { competition: { select: { code: true } } } }, winnerClubSave: { select: { club: { select: { slug: true } } } } },
    });
    cupWinners = new Map(finals.map((final) => [final.season.competition.code.split(".")[0], final.winnerClubSave?.club.slug ?? ""]));

    await season.advanceToNextSeason(saveId, { assistantContracts: true });
  }, 900_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("plays 71 and 41 matches, each round on its date, the finals on 29 May, every knockout tie decided", () => {
    const dates = europeDates(FIRST_YEAR).map(DAY);
    for (const [code, total] of [
      ["eu.1", 71],
      ["eu.2", 41],
    ] as const) {
      const ofCode = fixturesOfFirstSeason.filter((fixture) => fixture.code === code);
      expect(ofCode).toHaveLength(total);
      expect(ofCode.every((fixture) => fixture.played && fixture.date === dates[fixture.round - 1])).toBe(true);
      expect(ofCode.filter((fixture) => fixture.round > 6).every((fixture) => fixture.winner !== null && fixture.decidedBy !== null)).toBe(true);
      expect(ofCode.filter((fixture) => fixture.round === EUROPE_FINAL_ROUND)).toHaveLength(1);
    }
    expect(dates[EUROPE_FINAL_ROUND - 1]).toBe("2027-05-29");
  });

  it("never has a club play twice a day, nor three times in a week", async () => {
    const all = await database().fixture.findMany({
      where: { saveId, season: { startYear: FIRST_YEAR } },
      select: { scheduledAt: true, homeClubSaveId: true, awayClubSaveId: true },
    });
    const byClub = new Map<string, number[]>();
    for (const fixture of all) {
      for (const club of [fixture.homeClubSaveId, fixture.awayClubSaveId]) {
        byClub.set(club, [...(byClub.get(club) ?? []), fixture.scheduledAt.getTime()]);
      }
    }
    for (const times of byClub.values()) {
      const sorted = [...times].sort((a, b) => a - b);
      expect(new Set(sorted).size).toBe(sorted.length);
      for (let index = 2; index < sorted.length; index++) {
        expect(sorted[index] - sorted[index - 2]).toBeGreaterThanOrEqual(7 * DAY_MS);
      }
    }
  });

  it("writes the managed club's European run in its season result, the trophy for a title", async () => {
    const result = await database().seasonResult.findFirstOrThrow({
      where: { saveId, season: { startYear: FIRST_YEAR } },
      select: { europeCode: true, europeStage: true, trophies: true },
    });
    expect(runBefore).not.toBeNull();
    expect(result.europeCode).toBe(runBefore?.code);
    expect(result.europeStage).toBe(Math.min(runBefore?.stage ?? 0, EUROPE_STAGES.FINAL));
    expect(result.trophies.includes("europe")).toBe(runBefore?.won === true);
  });

  it("raises each European finalist's reputation target, within 99", async () => {
    const finals = fixturesOfFirstSeason.filter((fixture) => fixture.round === EUROPE_FINAL_ROUND);
    const clubs = await database().clubSave.findMany({
      where: { saveId },
      select: { id: true, reputation: true, club: { select: { slug: true } }, competition: { select: { code: true } } },
    });
    let checked = 0;
    for (const final of finals) {
      for (const slug of [final.home, final.away]) {
        const club = clubs.find((candidate) => candidate.club.slug === slug);
        const before = [...reputationsBefore.entries()].find(([, value]) => value.slug === slug);
        if (club === undefined || before === undefined || club.competition.code !== before[1].code) {
          continue; // moved division: its target is its new division's place
        }
        const table = tables.get(before[1].code);
        const row = table?.rows.find((candidate) => candidate.club === slug);
        if (table === undefined || row === undefined) {
          continue;
        }
        const stage = final.winner === slug ? EUROPE_STAGES.WON : EUROPE_STAGES.FINAL;
        const code = final.code === "eu.1" ? "eu.1" : "eu.2";
        const target = Math.min(99, reputationTarget(row.rank, table.rows.length, competitionTier(table.tier)) + europeReputationBonus(code, stage));
        expect(club.reputation).toBe(reputationAfterSeason(before[1].reputation, target, null));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("qualifies the next season's clubs from the final tables and the cups' winners", async () => {
    const db = database();
    const next = FIRST_YEAR + 1;
    const eu1 = await entrantsOf(db, saveId, "eu.1", next);
    const eu2 = await entrantsOf(db, saveId, "eu.2", next);
    expect(eu1).toHaveLength(20);
    expect(eu2).toHaveLength(15);
    for (const [code, table] of tables) {
      if (table.tier !== 1) {
        continue;
      }
      const country = code.split(".")[0];
      const ranked = table.rows.map((row) => row.club);
      expect(eu1.filter((entrant) => entrant.country === country).sort((a, b) => a.pot - b.pot).map((entrant) => entrant.club)).toEqual(ranked.slice(0, 4));
      const winner = cupWinners.get(country);
      const winnerIn = winner !== undefined && ranked.slice(0, 6).includes(winner);
      const third = winner === undefined || winner === "" || winnerIn ? ranked[6] : winner;
      const ofCountry = eu2.filter((entrant) => entrant.country === country).map((entrant) => entrant.club);
      expect(ofCountry).toHaveLength(3);
      expect(new Set(ofCountry)).toEqual(new Set([ranked[4], ranked[5], third]));
      if (third === winner) {
        expect(eu2.find((entrant) => entrant.club === winner)?.path).toBe("CUP");
      }
    }
    const fixtures = await db.fixture.count({ where: { saveId, season: { startYear: next, competition: { kind: "EUROPE" } } } });
    expect(fixtures).toBe(90);
  });

  it("closes the managed club's European objective and counts it in the next dotation", async () => {
    const db = database();
    const closed = await db.seasonObjective.findMany({
      where: { saveId, season: { startYear: FIRST_YEAR }, outcome: { not: null } },
      select: { kind: true, chosen: true, outcome: true },
    });
    const outcome = (kind: string): ObjectiveOutcome | undefined => closed.find((objective) => objective.kind === kind)?.outcome ?? undefined;
    const chosen = closed.find((objective) => objective.chosen);
    expect(outcome("EUROPE")).toBeDefined();
    const budget = await db.seasonBudget.findFirstOrThrow({ where: { saveId, season: { startYear: FIRST_YEAR + 1 } }, select: { coefficient: true } });
    expect(budget.coefficient).toBe(
      budgetCoefficient({ ranking: outcome("RANKING"), cup: outcome("CUP"), europe: outcome("EUROPE"), chosen: chosen === undefined ? undefined : outcome(chosen.kind) }),
    );
  });

  it("deletes a save with its European seasons", async () => {
    const db = database();
    const [{ createDemoTwin }] = await Promise.all([import("./test-support")]);
    const doomed = await createDemoTwin("Test Europe supprimée", 2);
    expect(await db.season.count({ where: { saveId: doomed, competition: { kind: "EUROPE" } } })).toBe(2);
    await db.save.delete({ where: { id: doomed } });
    expect(await db.season.count({ where: { saveId: doomed } })).toBe(0);
  }, 120_000);
});

describe.skipIf(process.env.DATABASE_URL === undefined)("a save from before the European competitions, and a challenge save", () => {
  let db: Db | undefined;
  let before = "";
  let challengeSave = "";
  const weekKey = `${2100 + (Date.now() % 800)}-W21`;
  const SECRET = "test-challenge-secret-0123456789abcdef";

  const database = (): Db => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    const [{ prisma }, support, season, challenge, saves] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./season"),
      import("./challenge"),
      import("./saves"),
    ]);
    db = prisma;
    before = await support.createDemoTwin("Test partie d'avant l'Europe", 2, true, false);
    const { id: challengeId } = await challenge.ensureChallenge(weekKey, SECRET);
    const owner = await support.createTestOwner();
    ({ id: challengeSave } = await saves.createChallengeSave({ challengeId, managerName: "Test", ownerId: owner }));
    for (const saveId of [before, challengeSave]) {
      await writeSeasonPlayed(prisma, saveId);
      await season.advanceToNextSeason(saveId, { assistantContracts: true });
    }
  }, 300_000);

  afterAll(async () => {
    const support = await import("./test-support");
    for (const saveId of [before, challengeSave]) {
      if (saveId !== "") {
        await db?.save.delete({ where: { id: saveId } });
      }
    }
    await support.deleteTestChallenges([weekKey]);
    await db?.$disconnect();
  }, 120_000);

  it("leaves a save's season in progress as it was, and gives it Europe at its next season", async () => {
    const db = database();
    expect(await db.season.count({ where: { saveId: before, startYear: FIRST_YEAR, competition: { kind: "EUROPE" } } })).toBe(0);
    expect(await db.season.count({ where: { saveId: before, startYear: FIRST_YEAR + 1, competition: { kind: "EUROPE" } } })).toBe(2);
    // No cup final was played in this season written by hand: each country's 7th takes the cup's place.
    const eu2 = await entrantsOf(db, before, "eu.2", FIRST_YEAR + 1);
    expect(eu2.every((entrant) => entrant.path === "RANK")).toBe(true);
    expect(await db.seasonObjective.count({ where: { saveId: before, season: { startYear: FIRST_YEAR + 1 } } })).toBeGreaterThan(0);
  });

  it("never gives a challenge save a European competition, whatever its season", async () => {
    const db = database();
    expect(await db.season.count({ where: { saveId: challengeSave, competition: { kind: "EUROPE" } } })).toBe(0);
    expect(await db.season.count({ where: { saveId: challengeSave, startYear: FIRST_YEAR + 1, competition: { kind: "LEAGUE" } } })).toBe(10);
  });
});
