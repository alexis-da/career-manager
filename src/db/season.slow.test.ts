import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FREE_AGENT_STAY_MIN_OVERALL, MIN_GOALKEEPERS, SQUAD_SIZE_MAX, SQUAD_SIZE_MIN } from "../engine/balance";
import { marketValueFor } from "../engine/economy";
import { FREE_AGENT_POOL_SLUG } from "../engine/free-agents";
import { ATTRIBUTE_NAMES, RATING_MAX, RATING_MIN } from "../engine/generation";
import { seasonStartDate, WORLD_START_YEAR } from "../engine/world";
import { ageInYears } from "../lib/dates";
import type { prisma as prismaClient } from "./client";
import type { SeasonTransition } from "./season";

const FIRST_YEAR = WORLD_START_YEAR;
const SEASONS_PLAYED = 3;

type Kickoff = {
  startYear: number;
  activePlayers: number;
  aiSquads: { players: number; goalkeepers: number }[];
};

type AfterFirstAdvance = {
  transition: SeasonTransition;
  completedFixturesBefore: unknown[];
  completedFixturesAfter: unknown[];
  nextFixtures: number;
  unplayedNextFixtures: number;
  completedSeasons: boolean[];
  openSeasons: boolean[];
  currentDate: string;
  outOfBounds: number;
  belowPotential: number;
  notReset: number;
  wrongMarketValues: number;
  retirements: number;
  managedReleases: number;
  expiredContractsInClubs: number;
  poolStillFree: number; // free agents of the initial pool rated FREE_AGENT_STAY_MIN_OVERALL or less, still in the world
  poolLeft: number;
};

// Plays three seasons in a row on a save with the demo seed, advancing after each one, then deletes it. Runs
// against DATABASE_URL and is skipped without it. Modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("advanceToNextSeason over three seasons", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let refusal: unknown;
  let notFinishedError: (new (unplayed: number) => Error) | undefined;
  let first: AfterFirstAdvance | undefined;
  const kickoffs: Kickoff[] = [];
  const completedSeasonIds: (string | null)[] = [];
  /** The owner's first steps (src/db/activation.ts): at the creation, once the first season is played, at the end. */
  type FirstSteps = { firstSaveAt: Date | null; firstMatchAt: Date | null; firstSeasonEndAt: Date | null };
  const steps: FirstSteps[] = [];
  let writtenResults: unknown[] = [];
  let rebuiltResults: unknown[] = [];

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  const afterFirstAdvance = (): AfterFirstAdvance => {
    if (first === undefined) {
      throw new Error("The first season was not advanced");
    }
    return first;
  };

  const fixturesOfYear = (startYear: number) =>
    database().fixture.findMany({
      where: { saveId, season: { startYear } },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        seasonId: true,
        round: true,
        scheduledAt: true,
        homeClubSaveId: true,
        awayClubSaveId: true,
        played: true,
        homeGoals: true,
        awayGoals: true,
        _count: { select: { events: true } },
      },
    });

  const readKickoff = async (startYear: number): Promise<Kickoff> => {
    const db = database();
    const [activePlayers, squads] = await Promise.all([
      db.playerSave.count({ where: { saveId, transfers: { none: { saveId, type: "RETIREMENT" } } } }),
      db.$queryRaw<{ isManaged: boolean; players: number; goalkeepers: number }[]>`
        SELECT cs."isManaged" AS "isManaged", count(ps.id)::int AS players,
          count(ps.id) FILTER (WHERE ps.position = 'GK')::int AS goalkeepers
        FROM "ClubSave" cs
        LEFT JOIN "PlayerSave" ps ON ps."clubSaveId" = cs.id AND ps."saveId" = ${saveId}
        WHERE cs."saveId" = ${saveId}
        GROUP BY cs.id, cs."isManaged"`,
    ]);
    return {
      startYear,
      activePlayers,
      aiSquads: squads.filter((squad) => !squad.isManaged).map(({ players, goalkeepers }) => ({ players, goalkeepers })),
    };
  };

  const readAfterFirstAdvance = async (
    transition: SeasonTransition,
    completedFixturesBefore: unknown[],
  ): Promise<AfterFirstAdvance> => {
    const db = database();
    const ratings = [...ATTRIBUTE_NAMES, "overall", "potential"] as const;
    const nextYear = FIRST_YEAR + 1;
    const [
      completedFixturesAfter,
      nextFixtures,
      unplayedNextFixtures,
      completedSeasons,
      openSeasons,
      save,
      outOfBounds,
      belowPotential,
      notReset,
      retirements,
      managedReleases,
      expiredContractsInClubs,
      marketValues,
      poolStillFree,
      poolLeft,
    ] = await Promise.all([
      fixturesOfYear(FIRST_YEAR),
      db.fixture.count({ where: { saveId, season: { startYear: nextYear } } }),
      db.fixture.count({ where: { saveId, season: { startYear: nextYear }, played: false } }),
      db.season.findMany({ where: { saveId, startYear: FIRST_YEAR }, select: { completed: true } }),
      db.season.findMany({ where: { saveId, startYear: nextYear }, select: { completed: true } }),
      db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
      db.playerSave.count({
        where: { saveId, OR: ratings.flatMap((name) => [{ [name]: { lt: RATING_MIN } }, { [name]: { gt: RATING_MAX } }]) },
      }),
      db.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "PlayerSave" WHERE "saveId" = ${saveId} AND "potential" < "overall"`,
      db.playerSave.count({
        where: {
          saveId,
          OR: [
            { form: { not: 50 } },
            { morale: { not: 50 } },
            { fitness: { not: 100 } },
            { injuredUntil: { not: null } },
            { leagueYellows: { not: 0 } },
            { cupYellows: { not: 0 } },
          ],
        },
      }),
      // Age retirements and preseason departures share the date; free agents of the pool retire without a club.
      db.transfer.count({ where: { saveId, type: "RETIREMENT", date: new Date(Date.UTC(nextYear, 6, 1)) } }),
      db.transfer.count({
        where: { saveId, type: "FREE", toClubId: null, playerSave: { transfers: { some: { saveId } } }, date: new Date(Date.UTC(nextYear, 6, 1)) },
      }),
      db.playerSave.count({
        where: { saveId, clubSaveId: { not: null }, contractUntil: { lte: new Date(Date.UTC(nextYear, 5, 30)) } },
      }),
      db.playerSave.findMany({ where: { saveId }, select: { birthDate: true, overall: true, potential: true, marketValue: true } }),
      db.playerSave.count({
        where: {
          saveId,
          playerKey: { startsWith: `${FREE_AGENT_POOL_SLUG}#` },
          clubSaveId: null,
          overall: { lte: FREE_AGENT_STAY_MIN_OVERALL },
          transfers: { none: { saveId, type: "RETIREMENT" } },
        },
      }),
      db.transfer.count({
        where: {
          saveId,
          type: "RETIREMENT",
          fromClubId: null,
          date: new Date(Date.UTC(nextYear, 6, 1)),
          playerSave: { playerKey: { startsWith: `${FREE_AGENT_POOL_SLUG}#` } },
        },
      }),
    ]);
    const kickoffDate = new Date(Date.UTC(nextYear, 6, 1));
    return {
      transition,
      completedFixturesBefore,
      completedFixturesAfter,
      nextFixtures,
      unplayedNextFixtures,
      completedSeasons: completedSeasons.map((season) => season.completed),
      openSeasons: openSeasons.map((season) => season.completed),
      currentDate: save.currentDate.toISOString(),
      outOfBounds,
      belowPotential: belowPotential[0].count,
      notReset,
      retirements,
      managedReleases,
      expiredContractsInClubs,
      poolStillFree,
      poolLeft,
      wrongMarketValues: marketValues.filter(
        (player) =>
          player.marketValue !==
          marketValueFor({ age: ageInYears(player.birthDate, kickoffDate), overall: player.overall, potential: player.potential }),
      ).length,
    };
  };

  beforeAll(async () => {
    const [{ prisma }, support, season, seasonResults] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./season"),
      import("./season-results"),
    ]);
    db = prisma;
    notFinishedError = season.SeasonNotFinishedError;

    saveId = await support.createDemoTwin("Test saisons");
    const readSteps = async () => {
      const { ownerId } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { ownerId: true } });
      return prisma.user.findUniqueOrThrow({
        where: { id: ownerId ?? "" },
        select: { firstSaveAt: true, firstMatchAt: true, firstSeasonEndAt: true },
      });
    };
    steps.push(await readSteps());
    kickoffs.push(await readKickoff(FIRST_YEAR));
    refusal = await season.advanceToNextSeason(saveId).then(
      () => undefined,
      (error: unknown) => error,
    );

    for (let played = 0; played < SEASONS_PLAYED; played++) {
      await support.playRemainingMatchdays(saveId);
      if (played === 0) {
        steps.push(await readSteps());
      }
      const completedFixturesBefore = played === 0 ? await fixturesOfYear(FIRST_YEAR) : [];
      const transition = await season.advanceToNextSeason(saveId);
      completedSeasonIds.push(transition.completedSeasonId);
      if (played === 0) {
        first = await readAfterFirstAdvance(transition, completedFixturesBefore);
      }
      kickoffs.push(await readKickoff(transition.startYear));
    }

    steps.push(await readSteps());

    // The rows advanceToNextSeason wrote, then the same seasons rebuilt from the database once the rows are gone, as
    // for a save from before SeasonResult: three seasons of transfers later, the rebuilding must find the same squads.
    const resultsWithoutIdentity = (): Promise<unknown[]> =>
      prisma.seasonResult.findMany({ where: { saveId }, orderBy: { seasonId: "asc" }, omit: { id: true, createdAt: true } });
    writtenResults = await resultsWithoutIdentity();
    await prisma.seasonResult.deleteMany({ where: { saveId } });
    await seasonResults.getSeasonResults(saveId);
    rebuiltResults = await resultsWithoutIdentity();
  }, 900_000);

  // Deleting a played save cascades to tens of thousands of rows: allow more than the 10 s hook default.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.deleteMany({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("dates the owner's first career, first match and first season's end, each once", () => {
    const [created, firstSeasonOver, last] = steps;
    expect(created.firstSaveAt).toBeInstanceOf(Date);
    expect(created).toMatchObject({ firstMatchAt: null, firstSeasonEndAt: null });
    expect(firstSeasonOver.firstMatchAt).toBeInstanceOf(Date);
    expect(firstSeasonOver.firstSeasonEndAt).toBeInstanceOf(Date);
    expect(firstSeasonOver.firstSeasonEndAt?.getTime()).toBeGreaterThan(firstSeasonOver.firstMatchAt?.getTime() ?? Infinity);
    // Three seasons later, the same dates: the first ones.
    expect(last).toEqual(firstSeasonOver);
    expect(last.firstSaveAt).toEqual(created.firstSaveAt);
  });

  it("refuses to advance while fixtures of the season remain", () => {
    if (notFinishedError === undefined) {
      throw new Error("Season module not loaded");
    }
    expect(refusal).toBeInstanceOf(notFinishedError);
  });

  it("creates 1 752 unplayed fixtures in new seasons and completes the finished ones", () => {
    const state = afterFirstAdvance();

    expect(state.transition.fixtures).toBe(1752);
    expect(state.nextFixtures).toBe(1752);
    expect(state.unplayedNextFixtures).toBe(1752);
    expect(state.completedSeasons).toEqual([true, true, true, true, true]);
    expect(state.openSeasons).toEqual([false, false, false, false, false]);
  });

  it("leaves every fixture of the finished season untouched", () => {
    const state = afterFirstAdvance();

    expect(state.completedFixturesBefore).toHaveLength(1752);
    expect(state.completedFixturesAfter).toEqual(state.completedFixturesBefore);
  });

  it("moves currentDate to 1 July", () => {
    expect(afterFirstAdvance().currentDate).toBe(seasonStartDate(FIRST_YEAR + 1).toISOString());
  });

  it("keeps every attribute within 1–99 and resets form, morale, fitness, injuries and yellow cards", () => {
    const state = afterFirstAdvance();

    expect(state.outOfBounds).toBe(0);
    expect(state.belowPotential).toBe(0);
    expect(state.notReset).toBe(0);
  });

  it("recomputes every market value from the new rating and age", () => {
    expect(afterFirstAdvance().wrongMarketValues).toBe(0);
  });

  it("retires players, runs the preseason and leaves no expired contract in a squad", () => {
    const state = afterFirstAdvance();

    expect(state.transition.retired).toBeGreaterThan(0);
    expect(state.retirements).toBe(state.transition.retired + state.transition.preseason.departures);
    expect(state.transition.preseason.skipped).toBe(false);
    expect(state.transition.preseason.youthPlayers).toBe(192);
    expect(state.expiredContractsInClubs).toBe(0);
  });

  it("makes the free agents of the initial pool still unsigned at the next preseason leave the world, unless rated above 65", () => {
    const state = afterFirstAdvance();

    // Age retirements of pool players share the date and the shape of departures: only the outcome is compared.
    expect(state.transition.preseason.departures).toBeGreaterThan(0);
    expect(state.poolLeft).toBeGreaterThan(0);
    expect(state.poolStillFree).toBe(0);
  });

  it("keeps the number of active players within 10 % over three seasons", () => {
    expect(kickoffs.map((kickoff) => kickoff.startYear)).toEqual([FIRST_YEAR, FIRST_YEAR + 1, FIRST_YEAR + 2, FIRST_YEAR + 3]);
    const [reference] = kickoffs;
    for (const kickoff of kickoffs) {
      expect(Math.abs(kickoff.activePlayers - reference.activePlayers) / reference.activePlayers).toBeLessThanOrEqual(0.1);
    }
  });

  it("gives every AI club 20 to 25 players and 2 goalkeepers at every kickoff", () => {
    for (const kickoff of kickoffs) {
      expect(kickoff.aiSquads).toHaveLength(95);
      expect({
        startYear: kickoff.startYear,
        wrongSize: kickoff.aiSquads.filter((squad) => squad.players < SQUAD_SIZE_MIN || squad.players > SQUAD_SIZE_MAX),
        missingKeepers: kickoff.aiSquads.filter((squad) => squad.goalkeepers < MIN_GOALKEEPERS),
      }).toEqual({ startYear: kickoff.startYear, wrongSize: [], missingKeepers: [] });
    }
  });

  it("moves no club in a worldVersion 1 save: no promotion, no relegation, no Season.movements, every club where it began", async () => {
    const db = database();
    const [seasons, misplaced, results] = await Promise.all([
      db.season.findMany({ where: { saveId }, select: { movements: true } }),
      db.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "ClubSave" cs JOIN "Club" c ON c.id = cs."clubId"
        WHERE cs."saveId" = ${saveId} AND cs."competitionId" <> c."competitionId"`,
      db.seasonResult.findMany({ where: { saveId }, select: { promoted: true, relegated: true } }),
    ]);

    expect(first?.transition.moves).toBe(0);
    expect(seasons.every((season) => season.movements === null)).toBe(true);
    expect(misplaced[0].count).toBe(0);
    expect(results.every((result) => !result.promoted && !result.relegated)).toBe(true);
  });

  it("writes the managed club's result of every season it closes, and rebuilds the same rows later", async () => {
    const seasons = await database().season.findMany({
      where: { saveId, completed: true, competition: { code: "fr.1" } },
      orderBy: { startYear: "asc" },
      select: { id: true },
    });
    expect(completedSeasonIds).toEqual(seasons.map((season) => season.id));
    expect(writtenResults).toHaveLength(SEASONS_PLAYED);
    expect(writtenResults).toEqual(
      expect.arrayContaining([expect.objectContaining({ played: 34, bestPlayerKey: expect.any(String) })]),
    );
    expect(rebuiltResults).toEqual(writtenResults);
  });

  it("deletes the whole save, played matches, transfers and results included", async () => {
    const db = database();
    await db.save.delete({ where: { id: saveId } });
    const [saves, players, fixtures, transfers, results] = await Promise.all([
      db.save.count({ where: { id: saveId } }),
      db.playerSave.count({ where: { saveId } }),
      db.fixture.count({ where: { saveId } }),
      db.transfer.count({ where: { saveId } }),
      db.seasonResult.count({ where: { saveId } }),
    ]);
    saveId = "";

    expect([saves, players, fixtures, transfers, results]).toEqual([0, 0, 0, 0, 0]);
  }, 120_000);
});
