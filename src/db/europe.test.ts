import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EUROPE_PRIZES } from "../engine/balance";
import { europeDates, EUROPE_COUNTRIES, knockoutTies, type EuropeEntrant } from "../engine/europe";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

const DAY = (date: Date): string => date.toISOString().slice(0, 10);

// The European competitions of a new worldVersion 2 save, on a throwaway twin of the demo save: what its creation opens,
// then the knockout rounds drawn from results written by hand (the league phase won by every home club, then each tie by
// its home club), and the prizes they pay. Runs against DATABASE_URL and is skipped without it; modules are imported
// lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the European competitions of a new worldVersion 2 save", () => {
  let db: typeof prismaClient | undefined;
  let europe: typeof import("./europe") | undefined;
  let saveId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const europeModule = (): typeof import("./europe") => {
    if (europe === undefined) {
      throw new Error("Europe module not loaded");
    }
    return europe;
  };

  /** A European season of the twin, with its clubs. */
  const seasonOf = async (code: string) =>
    database().season.findFirstOrThrow({
      where: { saveId, competition: { code } },
      select: { id: true, startYear: true, entrants: true },
    });

  beforeAll(async () => {
    const [{ prisma }, support, europeLoaded] = await Promise.all([import("./client"), import("./test-support"), import("./europe")]);
    db = prisma;
    europe = europeLoaded;
    saveId = await support.createDemoTwin("Test Europe", 2);
  }, 120_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("qualifies each country's first four for the Laurel Cup and its 5th to 7th for the Pennant Cup, from the source season", async () => {
    const clubs = await database().clubSave.findMany({
      where: { saveId, competition: { kind: "LEAGUE", tier: 1 } },
      select: { club: { select: { slug: true, initialRank: true } }, competition: { select: { code: true } } },
    });
    for (const [code, ranks, pots] of [
      ["eu.1", [1, 2, 3, 4], 4],
      ["eu.2", [5, 6, 7], 3],
    ] as const) {
      const season = await seasonOf(code);
      const entrants = europeModule().parseEuropeEntrants(season.id, season.entrants);
      expect(season.startYear).toBe(WORLD_START_YEAR);
      expect(entrants).toHaveLength(ranks.length * EUROPE_COUNTRIES.length);
      for (const country of EUROPE_COUNTRIES) {
        const expected = clubs
          .filter((club) => club.competition.code === `${country}.1` && (ranks as readonly number[]).includes(club.club.initialRank))
          .sort((a, b) => a.club.initialRank - b.club.initialRank)
          .map((club) => club.club.slug);
        const ofCountry = entrants.filter((entrant) => entrant.country === country).sort((a, b) => a.pot - b.pot);
        expect(ofCountry.map((entrant) => entrant.club)).toEqual(expected);
        expect(ofCountry.map((entrant) => entrant.pot)).toEqual(Array.from({ length: pots }, (_, index) => index + 1));
        // Nobody has won a cup yet: the cup's place goes to the 7th, by rank.
        expect(ofCountry.every((entrant) => entrant.path === "RANK" && entrant.tier === 1)).toBe(true);
      }
    }
  });

  it("draws both league phases on their Wednesdays, 60 and 30 matches, and pays the managed club its participation", async () => {
    const dates = europeDates(WORLD_START_YEAR).map(DAY);
    for (const [code, matches] of [
      ["eu.1", 60],
      ["eu.2", 30],
    ] as const) {
      const season = await seasonOf(code);
      const fixtures = await database().fixture.findMany({ where: { saveId, seasonId: season.id }, select: { round: true, scheduledAt: true } });
      expect(fixtures).toHaveLength(matches);
      expect(fixtures.every((fixture) => fixture.round >= 1 && fixture.round <= 6 && DAY(fixture.scheduledAt) === dates[fixture.round - 1])).toBe(true);
    }
    // Lyon, 6th of its league in the source season: the Pennant Cup, with its objective.
    const managed = await database().clubSave.findFirstOrThrow({
      where: { saveId, isManaged: true },
      select: { id: true, budget: true, club: { select: { slug: true } } },
    });
    const eu2 = europeModule().parseEuropeEntrants((await seasonOf("eu.2")).id, (await seasonOf("eu.2")).entrants);
    expect(eu2.some((entrant) => entrant.club === managed.club.slug)).toBe(true);
    const dotation = await database().seasonBudget.findFirstOrThrow({ where: { saveId }, select: { budget: true } });
    expect(managed.budget - dotation.budget).toBe(EUROPE_PRIZES["eu.2"].participation);
    const objective = await database().seasonObjective.findFirst({ where: { saveId, kind: "EUROPE" }, select: { imposed: true, target: true, exceed: true } });
    expect(objective).not.toBeNull();
    expect(objective?.imposed).toBe(true);
    expect((objective?.exceed ?? 0) - (objective?.target ?? 0)).toBe(2);
  });

  it("draws the play-offs from the league phase's table, pays its first four, then the quarter-finals of the fixed bracket", async () => {
    const db = database();
    const { europeFixtures, leaguePhaseTableOf, parseEuropeEntrants, progressEurope } = europeModule();
    const season = await seasonOf("eu.2");
    const entrants: EuropeEntrant[] = parseEuropeEntrants(season.id, season.entrants);
    const league = await db.fixture.findMany({
      where: { saveId, seasonId: season.id },
      orderBy: { round: "asc" },
      select: { id: true, round: true, homeClubSaveId: true },
    });
    // Every home club wins its league phase match 1-0.
    await db.fixture.updateMany({
      where: { saveId, seasonId: season.id },
      data: { played: true, status: "PLAYED", homeGoals: 1, awayGoals: 0, homeHalfTimeGoals: 0, awayHalfTimeGoals: 0 },
    });
    const budgetsOf = async () =>
      new Map((await db.clubSave.findMany({ where: { saveId }, select: { id: true, budget: true } })).map((club) => [club.id, club.budget]));
    const before = await budgetsOf();
    const lastRound = league.filter((fixture) => fixture.round === 6);
    await db.$transaction((tx) => progressEurope(tx, saveId, lastRound.map((fixture) => fixture.id)));

    const fixtures = await europeFixtures(db, saveId, season.id);
    const ranking = leaguePhaseTableOf(entrants, fixtures).map((row) => row.club);
    const playoffs = fixtures.filter((fixture) => fixture.round === 7);
    expect(playoffs.map(({ home, away }) => ({ home, away }))).toEqual(knockoutTies(7, ranking, []));
    expect(new Set(playoffs.map(() => DAY(europeDates(WORLD_START_YEAR)[6])))).toEqual(new Set([DAY(europeDates(WORLD_START_YEAR)[6])]));
    const clubSaveIdOf = new Map(fixtures.flatMap((fixture) => [[fixture.home, fixture.homeClubSaveId] as const, [fixture.away, fixture.awayClubSaveId] as const]));
    const prizes = EUROPE_PRIZES["eu.2"];
    const after = await budgetsOf();
    for (const [rank, club] of ranking.entries()) {
      const id = clubSaveIdOf.get(club) ?? "";
      const wonLast = lastRound.some((fixture) => fixture.homeClubSaveId === id);
      const expected = (rank < 4 ? prizes.quarterFinalQualification : 0) + (wonLast ? prizes.leagueWin : 0);
      expect((after.get(id) ?? 0) - (before.get(id) ?? 0)).toBe(expected);
    }

    // The home clubs win the play-offs: the quarter-finals of the bracket, and the quarter-finals' place paid.
    const playoffRows = await db.fixture.findMany({ where: { saveId, seasonId: season.id, round: 7 }, select: { id: true, homeClubSaveId: true } });
    for (const row of playoffRows) {
      await db.fixture.update({
        where: { id: row.id },
        data: { played: true, status: "PLAYED", homeGoals: 2, awayGoals: 1, decidedBy: "REGULATION", winnerClubSaveId: row.homeClubSaveId },
      });
    }
    await db.$transaction((tx) => progressEurope(tx, saveId, playoffRows.map((row) => row.id)));
    const afterPlayoffs = await europeFixtures(db, saveId, season.id);
    const played = afterPlayoffs.flatMap((fixture) =>
      fixture.round === 7 && fixture.winner !== null ? [{ round: 7, home: fixture.home, away: fixture.away, winner: fixture.winner }] : [],
    );
    expect(afterPlayoffs.filter((fixture) => fixture.round === 8).map(({ home, away }) => ({ home, away }))).toEqual(knockoutTies(8, ranking, played));
    const afterQuarterPlaces = await budgetsOf();
    for (const row of playoffRows) {
      expect((afterQuarterPlaces.get(row.homeClubSaveId) ?? 0) - (after.get(row.homeClubSaveId) ?? 0)).toBe(prizes.quarterFinalQualification);
    }
  });

  it("shows on the Club screen the prizes its matches earned, none from the cup yet", async () => {
    const db = database();
    const { getSeasonPrizes } = await import("./club");
    const { europeFixtures, leaguePhaseTableOf, parseEuropeEntrants } = europeModule();
    const managed = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, club: { select: { slug: true } } } });
    const season = await seasonOf("eu.2");
    const fixtures = await europeFixtures(db, saveId, season.id);
    const ranking = leaguePhaseTableOf(parseEuropeEntrants(season.id, season.entrants), fixtures).map((row) => row.club);
    // Every home club won its match above, its play-off too: the managed club's wins are its home matches played.
    const homeWins = (rounds: (round: number) => boolean) =>
      fixtures.filter((fixture) => fixture.played && rounds(fixture.round) && fixture.homeClubSaveId === managed.id).length;
    const prizes = EUROPE_PRIZES["eu.2"];
    const expected =
      prizes.participation +
      homeWins((round) => round <= 6) * prizes.leagueWin +
      (ranking.slice(0, 4).includes(managed.club.slug) ? prizes.quarterFinalQualification : 0) +
      homeWins((round) => round === 7) * prizes.quarterFinalQualification;

    expect(await getSeasonPrizes(saveId)).toEqual({
      startYear: WORLD_START_YEAR,
      cup: { code: "fr.cup", amount: 0 },
      europe: { code: "eu.2", amount: expected },
    });
    expect(expected).toBeGreaterThan(prizes.participation);
  });
});

const FINAL_DATE = new Date(Date.UTC(WORLD_START_YEAR, 7, 12)); // a Wednesday before the first matchday
const OPPONENT_SLUG = "aj-auxerre";

// A European final of the managed club, played live to its end, on a throwaway twin of the demo save (a worldVersion 1
// save, half as heavy, given a Laurel Cup season and its final by hand): on neutral ground, a knockout match, its winner
// and both finalists' prizes written, its season stats the managed club's players' only.
describe.skipIf(process.env.DATABASE_URL === undefined)("a European final of the managed club", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let fixtureId = "";
  let clubs = { managed: "", opponent: "" };
  let budgetsBefore = new Map<string, number>();
  let atKickOff: { knockout?: true; neutral?: true } | undefined;

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    const [{ prisma }, support, matchday, liveState] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./live-state"),
    ]);
    db = prisma;
    saveId = await support.createDemoTwin("Test finale européenne");

    const [competition, managed, opponent] = await Promise.all([
      prisma.competition.findUniqueOrThrow({ where: { code: "eu.1" }, select: { id: true } }),
      prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, budget: true, reputation: true, club: { select: { slug: true } } } }),
      prisma.clubSave.findFirstOrThrow({ where: { saveId, club: { slug: OPPONENT_SLUG } }, select: { id: true, budget: true, reputation: true } }),
    ]);
    clubs = { managed: managed.id, opponent: opponent.id };
    budgetsBefore = new Map([
      [managed.id, managed.budget],
      [opponent.id, opponent.budget],
    ]);
    const entrants: EuropeEntrant[] = [
      { club: managed.club.slug, country: "fr", pot: 1, path: "RANK", tier: 1, rank: 1, reputation: managed.reputation },
      { club: OPPONENT_SLUG, country: "fr", pot: 2, path: "RANK", tier: 1, rank: 2, reputation: opponent.reputation },
    ];
    const season = await prisma.season.create({
      data: { saveId, competitionId: competition.id, startYear: WORLD_START_YEAR, entrants },
      select: { id: true },
    });
    ({ id: fixtureId } = await prisma.fixture.create({
      data: { saveId, seasonId: season.id, round: 10, scheduledAt: FINAL_DATE, homeClubSaveId: managed.id, awayClubSaveId: opponent.id },
      select: { id: true },
    }));

    const day = await matchday.playNextMatchday(saveId, { pauseManagedMatch: true });
    expect(day).toMatchObject({ fixtures: 1, managed: { fixtureId, live: true } });
    const paused = await prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId }, select: { liveState: true } });
    const { state } = liveState.parseLiveState(fixtureId, paused.liveState);
    atKickOff = { knockout: state.knockout, neutral: state.neutral };
    await support.playLiveMatch(saveId, "end");
  }, 300_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("plays the final on neutral ground as a knockout match, and writes its winner", async () => {
    const fixture = await database().fixture.findUniqueOrThrow({
      where: { id: fixtureId },
      select: { status: true, homeGoals: true, awayGoals: true, decidedBy: true, winnerClubSaveId: true },
    });

    expect(atKickOff).toEqual({ knockout: true, neutral: true });
    expect(fixture.status).toBe("PLAYED");
    expect(fixture.decidedBy).not.toBeNull();
    expect([clubs.managed, clubs.opponent]).toContain(fixture.winnerClubSaveId);
    if (fixture.decidedBy === "REGULATION") {
      expect(fixture.homeGoals).not.toBe(fixture.awayGoals);
    }
  });

  it("pays the winner and the runner-up, and gives season stats to the managed club's players only", async () => {
    const db = database();
    const [fixture, budgets, stats] = await Promise.all([
      db.fixture.findUniqueOrThrow({ where: { id: fixtureId }, select: { winnerClubSaveId: true } }),
      db.clubSave.findMany({ where: { saveId, id: { in: [clubs.managed, clubs.opponent] } }, select: { id: true, budget: true } }),
      db.playerSeasonStats.findMany({
        where: { saveId, season: { competition: { code: "eu.1" } } },
        select: { playerSave: { select: { clubSaveId: true } } },
      }),
    ]);
    const gained = new Map(budgets.map((club) => [club.id, club.budget - (budgetsBefore.get(club.id) ?? 0)]));
    const loser = fixture.winnerClubSaveId === clubs.managed ? clubs.opponent : clubs.managed;

    expect(gained.get(fixture.winnerClubSaveId ?? "")).toBe(EUROPE_PRIZES["eu.1"].finalWin);
    expect(gained.get(loser)).toBe(EUROPE_PRIZES["eu.1"].finalLoss);
    expect(stats.length).toBeGreaterThanOrEqual(11);
    expect(stats.every((row) => row.playerSave.clubSaveId === clubs.managed)).toBe(true);
  });

  it("seeds a European match with its competition's code, never as a league or cup match", async () => {
    const { fixtureMatchSeed } = await import("./matchday");
    const fixture = (kind: "LEAGUE" | "CUP" | "EUROPE", code: string) => ({
      round: 10,
      season: { startYear: WORLD_START_YEAR, competition: { kind, code } },
      homeClubSave: { club: { slug: "a" } },
      awayClubSave: { club: { slug: "b" } },
    });
    const seeds = [
      fixtureMatchSeed("seed", fixture("LEAGUE", "fr.1")),
      fixtureMatchSeed("seed", fixture("CUP", "fr.cup")),
      fixtureMatchSeed("seed", fixture("EUROPE", "eu.1")),
      fixtureMatchSeed("seed", fixture("EUROPE", "eu.2")),
    ];
    expect(new Set(seeds).size).toBe(4);
    expect(seeds[2]).toBe(`seed:europe:${WORLD_START_YEAR}:eu.1:10:a:b`);
  });
});
