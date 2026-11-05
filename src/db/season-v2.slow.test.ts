import "dotenv/config";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CUP_ROUNDS, PROMOTION_RELEGATION } from "../engine/balance";
import { cupDates, cupRunOf, type CupRun } from "../engine/cup";
import { seasonFinances, type ClubFinances } from "../engine/economy";
import { budgetCoefficient, divisionOf, rankingObjective, rankingOutcome, type ObjectiveOutcome } from "../engine/objectives";
import type { MoveReason } from "../engine/promotion";
import { reputationAfterSeason, reputationRanks } from "../engine/reputation";
import { competitionTier } from "../engine/tiers";
import { countryOf } from "../engine/promotion";
import { seasonStartDate, WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";
import type { SeasonTransition } from "./season";

const FIRST_YEAR = WORLD_START_YEAR;

/** Clubs of each country, the cup's entrants: N − 1 ties, 12, 10, 8, 4 and 4 of them in the preliminary round. */
const CUP_SIZES: Record<string, number> = { "de.cup": 36, "en.cup": 44, "es.cup": 42, "fr.cup": 36, "it.cup": 40 };
const PRELIMINARY_TIES: Record<string, number> = { "de.cup": 4, "en.cup": 12, "es.cup": 10, "fr.cup": 4, "it.cup": 8 };

/**
 * Every league score of the demo save's first season until the eve of the first cup round, 570 matches, as a digest:
 * taken on a twin without the cups (createSave with cups false), and taken again whenever the engine changes the
 * matches. The cups change nothing before their first tie (later, their matches change form, fitness and injuries, so
 * the league goes its own way).
 */
const LEAGUE_DIGEST_BEFORE_CUP = "eb49e83cbb6dbb3ecaeb09640b487db60ba4f60f5365455b2eadcddd91618b75";

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
  tables: Map<string, string[]>; // the final tables, Club.id in order, by competition code
  slugOf: Map<string, string>; // club slug by Club.id
  clubsByCompetition: Record<string, number>; // clubs of each new season, from its fixtures
  fixturesByCompetition: Record<string, number>;
  competitionOf: Map<string, string>; // ClubSave.competitionId by Club.id, after
  codeOf: Map<string, string>; // competition code by id
  tierOf: Map<string, number>; // competition tier by code
  managedClubId: string; // Club.id
  dotation: Record<string, number> | null; // the managed club's SeasonBudget on its new season
  closedObjectives: { kind: string; imposed: boolean; chosen: boolean; target: number; exceed: number | null; outcome: string | null }[];
  nextObjectives: number; // the managed club's objectives of the new season
  financesBefore: Map<string, ClubFinances>; // by Club.id
  financesAfter: Map<string, ClubFinances>;
  saleFees: Map<string, number>; // budget change by Club.id from the preseason's AI sales for wage bills
  cups: CupCheck[]; // the closing season's cups, read before the move
  managedRun: CupRun | null; // the managed club's cup run, from those ties
  seasonResult: { cupRound: number | null; trophies: string[] } | null; // as advanceToNextSeason wrote it
  nextCupTies: Record<string, number>; // the next season's preliminary rounds
};

type CupCheck = {
  code: string;
  ties: number;
  unplayed: number;
  withoutWinner: number;
  perRound: number[]; // ties of rounds 1 to 6
  datesPerRound: string[][];
  winnerPlayedFinal: boolean;
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
      where: { saveId, startYear, competition: { kind: "LEAGUE" } },
      select: { id: true, competitionId: true, competition: { select: { code: true, tier: true } } },
    });
    const { cups, managedRun } = await readCups(startYear);
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
    const [movements, competitions, clubs, nextFixtures, nextCupTies, seasonResult] = await Promise.all([
      db.season.findMany({
        where: { saveId, startYear, competition: { kind: "LEAGUE" } },
        select: { movements: true, competition: { select: { code: true } } },
      }),
      db.competition.findMany({ select: { id: true, code: true, tier: true } }),
      db.clubSave.findMany({ where: { saveId }, select: { clubId: true, competitionId: true, isManaged: true } }),
      db.fixture.findMany({
        where: { saveId, season: { startYear: startYear + 1, competition: { kind: "LEAGUE" } } },
        select: { homeClubSaveId: true, awayClubSaveId: true, season: { select: { competition: { select: { code: true } } } } },
      }),
      db.fixture.findMany({
        where: { saveId, season: { startYear: startYear + 1, competition: { kind: "CUP" } } },
        select: { round: true, season: { select: { competition: { select: { code: true } } } } },
      }),
      db.seasonResult.findFirst({ where: { saveId, season: { startYear } }, select: { cupRound: true, trophies: true } }),
    ]);
    const closedObjectives = await db.seasonObjective.findMany({
      where: { saveId, season: { startYear } },
      select: { kind: true, imposed: true, chosen: true, target: true, exceed: true, outcome: true },
    });
    const nextObjectives = await db.seasonObjective.count({ where: { saveId, season: { startYear: startYear + 1 } } });
    const dotation = await db.seasonBudget.findFirst({
      where: { saveId, season: { startYear: startYear + 1 } },
      select: {
        reputation: true,
        reputationRank: true,
        dotation: true,
        coefficient: true,
        carryOver: true,
        budget: true,
        wageBudget: true,
      },
    });
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
        tables,
        slugOf: new Map([...clubIdBySlug].map(([slug, clubId]) => [clubId, slug])),
        clubsByCompetition: Object.fromEntries([...clubSets].map(([code, set]) => [code, set.size])),
        fixturesByCompetition,
        competitionOf: new Map(clubs.map((club) => [club.clubId, club.competitionId])),
        codeOf: new Map(competitions.map((competition) => [competition.id, competition.code])),
        tierOf: new Map(competitions.map((competition) => [competition.code, competition.tier])),
        managedClubId: clubs.find((club) => club.isManaged)?.clubId ?? "",
        dotation,
        closedObjectives,
        nextObjectives,
        financesBefore,
        financesAfter: await financesOf(saveId),
        saleFees: await saleFeesOn(seasonStartDate(startYear + 1)),
        cups,
        managedRun,
        seasonResult,
        nextCupTies: Object.fromEntries(
          Object.entries(Object.groupBy(nextCupTies, (tie) => tie.season.competition.code)).map(([code, ties]) => [
            code,
            ties?.filter((tie) => tie.round === 1).length ?? 0,
          ]),
        ),
      },
    };
  };

  /** The cups of a season as they stand, and the managed club's run in them. */
  const readCups = async (startYear: number): Promise<{ cups: CupCheck[]; managedRun: CupRun | null }> => {
    const clubSelect = { select: { isManaged: true, club: { select: { slug: true } } } } as const;
    const ties = await database().fixture.findMany({
      where: { saveId, season: { startYear, competition: { kind: "CUP" } } },
      select: {
        round: true,
        played: true,
        scheduledAt: true,
        winnerClubSaveId: true,
        homeClubSaveId: true,
        awayClubSaveId: true,
        season: { select: { competition: { select: { code: true } } } },
        homeClubSave: clubSelect,
        awayClubSave: clubSelect,
        winnerClubSave: clubSelect,
      },
    });
    const byCup = Map.groupBy(ties, (tie) => tie.season.competition.code);
    const cups = [...byCup].map(([code, rows]): CupCheck => {
      const rounds = Array.from({ length: CUP_ROUNDS }, (_, index) => rows.filter((tie) => tie.round === index + 1));
      const final = rounds[CUP_ROUNDS - 1][0];
      return {
        code,
        ties: rows.length,
        unplayed: rows.filter((tie) => !tie.played).length,
        withoutWinner: rows.filter(
          (tie) => tie.winnerClubSaveId !== tie.homeClubSaveId && tie.winnerClubSaveId !== tie.awayClubSaveId,
        ).length,
        perRound: rounds.map((round) => round.length),
        datesPerRound: rounds.map((round) => [...new Set(round.map((tie) => tie.scheduledAt.toISOString()))]),
        winnerPlayedFinal: final !== undefined && final.winnerClubSaveId !== null,
      };
    });
    const managedTies = ties.flatMap((tie) =>
      tie.winnerClubSave === null
        ? []
        : [{ round: tie.round, home: tie.homeClubSave.club.slug, away: tie.awayClubSave.club.slug, winner: tie.winnerClubSave.club.slug }],
    );
    const managedSlug = ties.flatMap((tie) => [tie.homeClubSave, tie.awayClubSave]).find((club) => club.isManaged)?.club.slug;
    return {
      cups: cups.sort((a, b) => a.code.localeCompare(b.code)),
      managedRun: managedSlug === undefined ? null : cupRunOf(managedTies, managedSlug),
    };
  };

  /** Digest of the save's league scores played before a date, as the pre-cup fingerprint was taken. */
  const leagueDigestBefore = async (date: Date): Promise<{ played: number; digest: string }> => {
    const fixtures = await database().fixture.findMany({
      where: { saveId, played: true, scheduledAt: { lt: date }, season: { competition: { kind: "LEAGUE" } } },
      select: {
        round: true,
        homeGoals: true,
        awayGoals: true,
        season: { select: { competition: { select: { code: true } } } },
        homeClubSave: { select: { club: { select: { slug: true } } } },
        awayClubSave: { select: { club: { select: { slug: true } } } },
      },
    });
    const lines = fixtures
      .map(
        (f) =>
          `${f.season.competition.code}|${f.round}|${f.homeClubSave.club.slug}|${f.awayClubSave.club.slug}|${f.homeGoals}-${f.awayGoals}`,
      )
      .sort();
    return { played: lines.length, digest: createHash("sha256").update(lines.join("\n")).digest("hex") };
  };
  let leagueBeforeCup = { played: 0, digest: "" };

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
    leagueBeforeCup = await leagueDigestBefore(cupDates(FIRST_YEAR)[0]);
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
    const leagues = firstSeasonDates.filter((season) => season.code in DIVISION_SIZES);
    expect(leagues.map((season) => [season.code, season.fixtures])).toEqual(
      Object.entries(DIVISION_SIZES).map(([code, size]) => [code, size * (size - 1)]),
    );
    expect(firstSeasonDates.every((season) => season.unplayed === 0)).toBe(true);
    expect(new Set(leagues.map((season) => season.first))).toEqual(new Set(["2026-08-15T00:00:00.000Z"]));
    expect(new Set(leagues.map((season) => season.last))).toEqual(new Set(["2027-05-15T00:00:00.000Z"]));
    // 40 Saturdays and the Tuesdays of the 46 and 42 matchday seasons, some shared, then the cups' five Wednesdays
    // and their final: one playNextMatchday each.
    expect(matchdays).toBe(52);
  });

  it("plays the league exactly as before the cups until their first tie", () => {
    expect(leagueBeforeCup).toEqual({ played: 570, digest: LEAGUE_DIGEST_BEFORE_CUP });
  });

  it.each([0, 1])("plays each country's cup to the end: N − 1 ties, each with a winner, the final on its Saturday (season %i)", (index) => {
    const check = checks[index];
    const dates = cupDates(FIRST_YEAR + index).map((date) => [date.toISOString()]);

    expect(check.cups.map((cup) => [cup.code, cup.ties])).toEqual(Object.entries(CUP_SIZES).map(([code, size]) => [code, size - 1]));
    for (const cup of check.cups) {
      expect(cup).toMatchObject({ unplayed: 0, withoutWinner: 0, winnerPlayedFinal: true });
      expect(cup.perRound).toEqual([PRELIMINARY_TIES[cup.code], 16, 8, 4, 2, 1]);
      expect(cup.datesPerRound).toEqual(dates);
    }
    expect(dates[CUP_ROUNDS - 1]).toEqual([index === 0 ? "2027-05-22T00:00:00.000Z" : "2028-05-27T00:00:00.000Z"]);
  });

  it.each([0, 1])("writes the managed club's cup run in its season result, the « cup » trophy to a winner (season %i)", (index) => {
    const check = checks[index];

    expect(check.managedRun).not.toBeNull();
    expect(check.seasonResult?.cupRound).toBe(check.managedRun?.round);
    expect(check.seasonResult?.trophies.includes("cup")).toBe(check.managedRun?.won);
  });

  it.each([0, 1])("opens the next season's cups with their preliminary rounds (transition %i)", (index) => {
    expect(checks[index].nextCupTies).toEqual(PRELIMINARY_TIES);
    expect(checks[index].transition.cupTies).toBe(38);
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

  it.each([0, 1])("gives every club the reputation of its season and its dotation in its new division (transition %i)", (index) => {
    const check = checks[index];
    const reasonOf = new Map(check.expected.map((move) => [move.clubId, move.reason as MoveReason]));
    const before = (clubId: string): ClubFinances => check.financesBefore.get(clubId) ?? { budget: NaN, wageBudget: NaN, reputation: NaN };
    const tierOf = (code: string) => competitionTier(check.tierOf.get(code) ?? NaN);

    // The managed club's objectives of the season: the imposed ones and the chosen one have their outcome, which give
    // its coefficient; the ranking's, against its final rank. The new season has its own.
    const counted = check.closedObjectives.filter((objective) => objective.imposed || objective.chosen);
    expect(["RANKING", "CUP"].every((kind) => counted.some((objective) => objective.kind === kind && objective.imposed))).toBe(true);
    expect(counted.filter((objective) => objective.chosen)).toHaveLength(1);
    expect(counted.every((objective) => objective.outcome !== null)).toBe(true);
    expect(check.closedObjectives.filter((objective) => !objective.imposed && !objective.chosen).every((objective) => objective.outcome === null)).toBe(true);
    const outcomeOf = (kind: string) => counted.find((objective) => objective.kind === kind)?.outcome as ObjectiveOutcome | undefined;
    const managedRanking = counted.find((objective) => objective.kind === "RANKING");
    const managedTable = [...check.tables.values()].find((table) => table.includes(check.managedClubId)) ?? [];
    expect(managedRanking?.outcome).toBe(
      rankingOutcome({ target: managedRanking?.target ?? NaN, exceed: managedRanking?.exceed ?? NaN }, managedTable.indexOf(check.managedClubId) + 1),
    );
    const managedCoefficient = budgetCoefficient({
      ranking: outcomeOf("RANKING"),
      cup: outcomeOf("CUP"),
      chosen: outcomeOf(counted.find((objective) => objective.chosen)?.kind ?? ""),
    });
    expect(check.nextObjectives).toBeGreaterThanOrEqual(4);

    // Each club's expected rank, its reputation rank in its division as the season was played, against its final one:
    // its new reputation, and an AI club's coefficient, its ranking objective's (the managed club's, its objectives').
    const reputations = new Map<string, number>();
    const coefficients = new Map<string, number>();
    for (const [code, table] of check.tables) {
      const expectedRanks = reputationRanks(
        table.map((clubId) => ({ key: clubId, ...before(clubId), slug: check.slugOf.get(clubId) ?? "" })),
      );
      const division = divisionOf(code, tierOf(code), table.length, 2);
      table.forEach((clubId, place) => {
        const expectedRank = expectedRanks.get(clubId) ?? NaN;
        reputations.set(clubId, reputationAfterSeason(before(clubId).reputation, expectedRank, place + 1, reasonOf.get(clubId) ?? null));
        const outcome = rankingOutcome(rankingObjective(expectedRank, division), place + 1);
        coefficients.set(clubId, clubId === check.managedClubId ? managedCoefficient : budgetCoefficient({ ranking: outcome }));
      });
    }
    // Reputations do move: some clubs rise, some fall; coefficients too. Each division's expected ranks add up as its
    // final ones (one club a rank), so its total reputation moves only by the caps of five places and by the moves.
    const changes = [...check.financesBefore].map(([clubId, finances]) => (reputations.get(clubId) ?? NaN) - finances.reputation);
    expect(changes.some((change) => change > 0) && changes.some((change) => change < 0)).toBe(true);
    expect(new Set([...coefficients].filter(([clubId]) => clubId !== check.managedClubId).map(([, value]) => value))).toEqual(new Set([85, 110, 120]));

    // Each new division ranked by the new reputations: the dotation, plus half of the unspent budget; the preseason's AI
    // sales for wage bills move budgets too, their fees added back.
    const divisions = Map.groupBy([...check.financesBefore.keys()], (clubId) => check.competitionOf.get(clubId) ?? "");
    for (const [competitionId, members] of divisions) {
      const tier = tierOf(check.codeOf.get(competitionId) ?? "");
      const ranks = reputationRanks(
        members.map((clubId) => ({
          key: clubId,
          reputation: reputations.get(clubId) ?? NaN,
          wageBudget: before(clubId).wageBudget,
          slug: check.slugOf.get(clubId) ?? "",
        })),
      );
      for (const clubId of members) {
        const reputationRank = ranks.get(clubId) ?? NaN;
        const finances = seasonFinances(reputationRank, members.length, tier, coefficients.get(clubId) ?? NaN, before(clubId).budget);
        expect(check.financesAfter.get(clubId)).toEqual({
          budget: finances.budget + (check.saleFees.get(clubId) ?? 0),
          wageBudget: finances.wageBudget,
          reputation: reputations.get(clubId),
        });
        if (clubId === check.managedClubId) {
          expect(check.dotation).toEqual({ ...finances, reputation: reputations.get(clubId), reputationRank });
        }
      }
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
    // Its leagues: a demo created before the cups got them only from its second season, one created since from the first.
    expect(seasons.filter((season) => season.startYear === FIRST_YEAR + 1 && season.code in DIVISION_SIZES)).toHaveLength(10);
    expect(movements.flatMap((season) => (Array.isArray(season.movements) ? season.movements : []))).toHaveLength(26);
  });
});
