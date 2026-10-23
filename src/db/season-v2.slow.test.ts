import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROMOTION_RELEGATION } from "../engine/balance";
import { financesAfterMove, type ClubFinances } from "../engine/economy";
import { countryOf } from "../engine/promotion";
import { seasonStartDate, WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";
import type { SeasonTransition } from "./season";

const FIRST_YEAR = WORLD_START_YEAR;

/** Clubs of each competition of a worldVersion 2 save: they never change, promotions and relegations included. */
const DIVISION_SIZES: Record<string, number> = {
  "de.1": 18,
  "de.2": 18,
  "en.1": 20,
  "en.2": 24,
  "es.1": 20,
  "es.2": 22,
  "fr.1": 18,
  "fr.2": 18,
  "it.1": 20,
  "it.2": 20,
};

type SeasonDates = { code: string; tier: number; startYear: number; first: string; last: string; fixtures: number; unplayed: number };

/** What a transition did: the moves read back from the database, the tables they came from, the clubs after. */
type TransitionCheck = {
  transition: SeasonTransition;
  movements: { code: string; movements: unknown }[]; // Season.movements of the closed seasons
  expected: { clubId: string; from: string; to: string; reason: string; rank: number }[]; // from the final tables
  clubsByCompetition: Record<string, number>; // clubs of each new season, from its fixtures
  fixturesByCompetition: Record<string, number>;
  competitionOf: Map<string, string>; // ClubSave.competitionId by Club.id, after
  codeOf: Map<string, string>; // competition code by id
  financesBefore: Map<string, ClubFinances>; // by Club.id
  financesAfter: Map<string, ClubFinances>;
  saleFees: Map<string, number>; // budget change by Club.id from the preseason's AI sales for wage bills
};

// Two seasons of a worldVersion 2 save (first and second divisions) on a twin of the demo save, each followed by the
// move to the next one with its promotions and relegations, then the twin is deleted; and the worldVersion 2 demo save
// itself, created once and kept. Runs against DATABASE_URL and is skipped without it. Modules are imported lazily
// because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("worldVersion 2 seasons", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let matchdays = 0;
  let firstSeasonDates: SeasonDates[] = [];
  const checks: TransitionCheck[] = [];
  let demoId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  /** First and last matchday, matches and unplayed matches of every season of a save. */
  const seasonDates = async (id: string): Promise<SeasonDates[]> => {
    const seasons = await database().season.findMany({
      where: { saveId: id },
      select: { id: true, startYear: true, competition: { select: { code: true, tier: true } } },
    });
    const dates = await database().fixture.groupBy({
      by: ["seasonId"],
      where: { saveId: id },
      _min: { scheduledAt: true },
      _max: { scheduledAt: true },
      _count: { _all: true },
    });
    const unplayed = await database().fixture.groupBy({ by: ["seasonId"], where: { saveId: id, played: false }, _count: { _all: true } });
    return seasons
      .map((season) => {
        const row = dates.find((candidate) => candidate.seasonId === season.id);
        return {
          code: season.competition.code,
          tier: season.competition.tier,
          startYear: season.startYear,
          first: row?._min.scheduledAt?.toISOString() ?? "",
          last: row?._max.scheduledAt?.toISOString() ?? "",
          fixtures: row?._count._all ?? 0,
          unplayed: unplayed.find((candidate) => candidate.seasonId === season.id)?._count._all ?? 0,
        };
      })
      .sort((a, b) => a.startYear - b.startYear || a.code.localeCompare(b.code));
  };

  const financesOf = async (id: string): Promise<Map<string, ClubFinances>> => {
    const clubs = await database().clubSave.findMany({
      where: { saveId: id },
      select: { clubId: true, budget: true, wageBudget: true, reputation: true },
    });
    return new Map(clubs.map(({ clubId, ...finances }) => [clubId, finances]));
  };

  /**
   * Budget change of each club (Club.id) from the AI sales of a preseason (planWageSales): the fees received, minus the
   * fees paid, of the paid transfers dated that day.
   */
  const saleFeesOn = async (date: Date): Promise<Map<string, number>> => {
    const sales = await database().transfer.findMany({
      where: { saveId, type: "TRANSFER", date },
      select: { fromClubId: true, toClubId: true, fee: true },
    });
    const fees = new Map<string, number>();
    for (const { fromClubId, toClubId, fee } of sales) {
      if (fromClubId !== null) {
        fees.set(fromClubId, (fees.get(fromClubId) ?? 0) + fee);
      }
      if (toClubId !== null) {
        fees.set(toClubId, (fees.get(toClubId) ?? 0) - fee);
      }
    }
    return fees;
  };

  /** Plays the season in progress, then moves on, and reads back what the move did. */
  const playAndAdvance = async (
    support: typeof import("./test-support"),
    standings: typeof import("./standings"),
    season: typeof import("./season"),
    startYear: number,
  ): Promise<{ matchdays: number; check: TransitionCheck }> => {
    const db = database();
    const played = await support.playRemainingMatchdays(saveId);
    const closing = await db.season.findMany({
      where: { saveId, startYear },
      select: { id: true, competitionId: true, competition: { select: { code: true, tier: true } } },
    });
    // The final tables as the league table shows them, read before the move.
    const clubIdBySlug = new Map(
      (await db.clubSave.findMany({ where: { saveId }, select: { clubId: true, club: { select: { slug: true } } } })).map(
        (row) => [row.club.slug, row.clubId],
      ),
    );
    const tables = new Map<string, string[]>();
    for (const row of closing) {
      const table = await standings.getStandings(saveId, row.id);
      tables.set(row.competition.code, table.map((line) => clubIdBySlug.get(line.club) ?? line.club));
    }
    const financesBefore = await financesOf(saveId);

    const transition = await season.advanceToNextSeason(saveId);

    const expected = closing
      .filter((row) => row.competition.tier === 1)
      .flatMap((upper) => {
        const country = countryOf(upper.competition.code);
        const count = PROMOTION_RELEGATION[country];
        const lowerCode = `${country}.2`;
        const upperTable = tables.get(upper.competition.code) ?? [];
        const lowerTable = tables.get(lowerCode) ?? [];
        return [
          ...upperTable.slice(-count).map((clubId) => ({
            clubId,
            from: upper.competition.code,
            to: lowerCode,
            reason: "RELEGATED",
            rank: upperTable.indexOf(clubId) + 1,
          })),
          ...lowerTable.slice(0, count).map((clubId) => ({
            clubId,
            from: lowerCode,
            to: upper.competition.code,
            reason: "PROMOTED",
            rank: lowerTable.indexOf(clubId) + 1,
          })),
        ];
      });
    const [movements, competitions, clubs, nextFixtures] = await Promise.all([
      db.season.findMany({ where: { saveId, startYear }, select: { movements: true, competition: { select: { code: true } } } }),
      db.competition.findMany({ select: { id: true, code: true } }),
      db.clubSave.findMany({ where: { saveId }, select: { clubId: true, competitionId: true } }),
      db.fixture.findMany({
        where: { saveId, season: { startYear: startYear + 1 } },
        select: { homeClubSaveId: true, awayClubSaveId: true, season: { select: { competition: { select: { code: true } } } } },
      }),
    ]);
    const clubSets = new Map<string, Set<string>>();
    const fixturesByCompetition: Record<string, number> = {};
    for (const fixture of nextFixtures) {
      const code = fixture.season.competition.code;
      const set = clubSets.get(code) ?? new Set<string>();
      set.add(fixture.homeClubSaveId).add(fixture.awayClubSaveId);
      clubSets.set(code, set);
      fixturesByCompetition[code] = (fixturesByCompetition[code] ?? 0) + 1;
    }
    return {
      matchdays: played,
      check: {
        transition,
        movements: movements.map((row) => ({ code: row.competition.code, movements: row.movements })).sort((a, b) => a.code.localeCompare(b.code)),
        expected,
        clubsByCompetition: Object.fromEntries([...clubSets].map(([code, set]) => [code, set.size])),
        fixturesByCompetition,
        competitionOf: new Map(clubs.map((club) => [club.clubId, club.competitionId])),
        codeOf: new Map(competitions.map((competition) => [competition.id, competition.code])),
        financesBefore,
        financesAfter: await financesOf(saveId),
        saleFees: await saleFeesOn(seasonStartDate(startYear + 1)),
      },
    };
  };

  beforeAll(async () => {
    const [{ prisma }, support, standings, season] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./standings"),
      import("./season"),
    ]);
    db = prisma;
    saveId = await support.createDemoTwin("Test saisons deux divisions", 2);
    const first = await playAndAdvance(support, standings, season, FIRST_YEAR);
    matchdays = first.matchdays;
    firstSeasonDates = (await seasonDates(saveId)).filter((row) => row.startYear === FIRST_YEAR);
    checks.push(first.check);
    checks.push((await playAndAdvance(support, standings, season, FIRST_YEAR + 1)).check);
    demoId = await support.ensureDemoSave(2);
  }, 2_400_000);

  // Deleting a played save cascades to tens of thousands of rows: allow more than the 10 s hook default.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.deleteMany({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 300_000);

  it("plays the ten competitions of the first season, all from the same first Saturday to the same last one", () => {
    expect(firstSeasonDates.map((season) => [season.code, season.fixtures])).toEqual(
      Object.entries(DIVISION_SIZES).map(([code, size]) => [code, size * (size - 1)]),
    );
    expect(firstSeasonDates.every((season) => season.unplayed === 0)).toBe(true);
    expect(new Set(firstSeasonDates.map((season) => season.first))).toEqual(new Set(["2026-08-15T00:00:00.000Z"]));
    expect(new Set(firstSeasonDates.map((season) => season.last))).toEqual(new Set(["2027-05-15T00:00:00.000Z"]));
    // 40 Saturdays and the Tuesdays of the 46 and 42 matchday seasons, some shared: one playNextMatchday each.
    expect(matchdays).toBe(46);
  });

  it.each([0, 1])("moves the last of each first division down and the first of each second up (transition %i)", (index) => {
    const check = checks[index];
    const stored = check.movements.flatMap((row) => (Array.isArray(row.movements) ? row.movements : []));
    const byKey = (move: { clubId: string; reason: string }) => `${move.reason}:${move.clubId}`;

    // Every closed season has its list, the moves out of its competition; 26 moves in all (3 × 3 + 2 × 2, twice).
    expect(check.movements.map((row) => row.code)).toEqual(Object.keys(DIVISION_SIZES));
    expect(check.movements.every((row) => Array.isArray(row.movements))).toBe(true);
    expect(check.transition.moves).toBe(26);
    expect([...stored].sort((a, b) => byKey(a).localeCompare(byKey(b)))).toEqual(
      [...check.expected].sort((a, b) => byKey(a).localeCompare(byKey(b))),
    );
    for (const move of check.expected) {
      expect(check.codeOf.get(check.competitionOf.get(move.clubId) ?? "")).toBe(move.to);
    }
  });

  it.each([0, 1])("keeps every division's size and gives the next season its full calendar (transition %i)", (index) => {
    const check = checks[index];

    expect(check.clubsByCompetition).toEqual(DIVISION_SIZES);
    expect(check.fixturesByCompetition).toEqual(
      Object.fromEntries(Object.entries(DIVISION_SIZES).map(([code, size]) => [code, size * (size - 1)])),
    );
  });

  it.each([0, 1])("gives the moving clubs the finances of their new division, and leaves the others alone (transition %i)", (index) => {
    const check = checks[index];
    const reasonOf = new Map(check.expected.map((move) => [move.clubId, move.reason as "PROMOTED" | "RELEGATED"]));

    // The preseason's AI sales for wage bills move budgets too: their fees are added back to what the move gives.
    for (const [clubId, before] of check.financesBefore) {
      const reason = reasonOf.get(clubId);
      const moved = reason === undefined ? before : financesAfterMove(before, reason);
      expect(check.financesAfter.get(clubId)).toEqual({ ...moved, budget: moved.budget + (check.saleFees.get(clubId) ?? 0) });
    }
  });

  it("keeps the worldVersion 2 demo save at the kickoff of its second season, its first season's moves written", async () => {
    const db = database();
    const [demo, v1Demo, seasons, movements] = await Promise.all([
      db.save.findUniqueOrThrow({ where: { id: demoId }, select: { worldVersion: true, currentDate: true, ownerId: true } }),
      db.save.findFirst({ where: { name: { startsWith: "Partie de démo" }, worldVersion: 1 }, select: { id: true } }),
      seasonDates(demoId),
      db.season.findMany({ where: { saveId: demoId, startYear: FIRST_YEAR }, select: { movements: true } }),
    ]);

    expect(demo).toMatchObject({ worldVersion: 2, ownerId: "demo-user-v2" });
    expect(demo.currentDate.toISOString()).toBe("2027-07-01T00:00:00.000Z");
    expect(v1Demo?.id).not.toBe(demoId);
    expect(seasons.filter((season) => season.startYear === FIRST_YEAR).every((season) => season.unplayed === 0)).toBe(true);
    expect(seasons.filter((season) => season.startYear === FIRST_YEAR + 1)).toHaveLength(10);
    expect(movements.flatMap((season) => (Array.isArray(season.movements) ? season.movements : []))).toHaveLength(26);
  });
});
