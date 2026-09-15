import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ATTRIBUTE_NAMES, RATING_MAX, RATING_MIN } from "../engine/generation";
import type { prisma as prismaClient } from "./client";
import type { SeasonTransition } from "./season";

const COMPLETED_YEAR = 2024;
const NEXT_YEAR = 2025;

// Plays a twin of the demo save to the end of 2024-25, advances it to 2025-26, then deletes it. Runs against
// DATABASE_URL and is skipped without it. Modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("advanceToNextSeason on a twin of the demo save", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let refusal: unknown;
  let notFinishedError: (new (unplayed: number) => Error) | undefined;
  let transition: SeasonTransition | undefined;
  let completedFixturesBefore: unknown[] = [];

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
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

  beforeAll(async () => {
    const [{ prisma }, support, season] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./season"),
    ]);
    db = prisma;
    notFinishedError = season.SeasonNotFinishedError;

    saveId = await support.createDemoTwin("Test fin de saison");
    refusal = await season.advanceToNextSeason(saveId).then(
      () => undefined,
      (error: unknown) => error,
    );
    await support.playRemainingMatchdays(saveId);
    completedFixturesBefore = await fixturesOfYear(COMPLETED_YEAR);
    transition = await season.advanceToNextSeason(saveId);
  }, 900_000);

  // Deleting a played save cascades to tens of thousands of rows: allow more than the 10 s hook default.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.deleteMany({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("refuses to advance while fixtures of the season remain", () => {
    if (notFinishedError === undefined) {
      throw new Error("Season module not loaded");
    }
    expect(refusal).toBeInstanceOf(notFinishedError);
  });

  it("creates 1 752 unplayed fixtures in new 2025 seasons and completes the 2024 ones", async () => {
    const db = database();
    const [nextFixtures, unplayedNext, completed, open] = await Promise.all([
      db.fixture.count({ where: { saveId, season: { startYear: NEXT_YEAR } } }),
      db.fixture.count({ where: { saveId, season: { startYear: NEXT_YEAR }, played: false } }),
      db.season.findMany({ where: { saveId, startYear: COMPLETED_YEAR }, select: { completed: true } }),
      db.season.findMany({ where: { saveId, startYear: NEXT_YEAR }, select: { completed: true } }),
    ]);

    expect(transition?.fixtures).toBe(1752);
    expect(nextFixtures).toBe(1752);
    expect(unplayedNext).toBe(1752);
    expect(completed.map((season) => season.completed)).toEqual([true, true, true, true, true]);
    expect(open.map((season) => season.completed)).toEqual([false, false, false, false, false]);
  });

  it("leaves every 2024 fixture untouched", async () => {
    expect(completedFixturesBefore).toHaveLength(1752);
    expect(await fixturesOfYear(COMPLETED_YEAR)).toEqual(completedFixturesBefore);
  });

  it("moves currentDate to 1 July 2025", async () => {
    const save = await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });

    expect(save.currentDate.toISOString()).toBe("2025-07-01T00:00:00.000Z");
  });

  it("keeps every attribute within 1–99 and resets form, morale, fitness and injuries", async () => {
    const db = database();
    const ratings = [...ATTRIBUTE_NAMES, "overall", "potential"] as const;
    const [outOfBounds, belowPotential, notReset] = await Promise.all([
      db.playerSave.count({
        where: {
          saveId,
          OR: ratings.flatMap((name) => [{ [name]: { lt: RATING_MIN } }, { [name]: { gt: RATING_MAX } }]),
        },
      }),
      db.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "PlayerSave" WHERE "saveId" = ${saveId} AND "potential" < "overall"`,
      db.playerSave.count({
        where: {
          saveId,
          OR: [{ form: { not: 50 } }, { morale: { not: 50 } }, { fitness: { not: 100 } }, { injuredUntil: { not: null } }],
        },
      }),
    ]);

    expect(outOfBounds).toBe(0);
    expect(belowPotential[0].count).toBe(0);
    expect(notReset).toBe(0);
  });

  it("retires some players and releases those whose contract ended, with a transfer each", async () => {
    const db = database();
    const [retirements, releases, playersStillUnderExpiredContract, departedPlayersInClubs] = await Promise.all([
      db.transfer.count({ where: { saveId, type: "RETIREMENT" } }),
      db.transfer.count({ where: { saveId, type: "FREE" } }),
      db.playerSave.count({
        where: { saveId, clubSaveId: { not: null }, contractUntil: { lte: new Date(Date.UTC(NEXT_YEAR, 5, 30)) } },
      }),
      db.playerSave.count({
        where: { saveId, clubSaveId: { not: null }, transfers: { some: { saveId, type: { in: ["RETIREMENT", "FREE"] } } } },
      }),
    ]);

    expect(retirements).toBe(transition?.retired);
    expect(releases).toBe(transition?.freeAgents);
    expect(retirements).toBeGreaterThan(0);
    expect(releases).toBeGreaterThan(0);
    expect(playersStillUnderExpiredContract).toBe(0);
    expect(departedPlayersInClubs).toBe(0);
  });

  it("deletes the whole save, played matches and transfers included", async () => {
    const db = database();
    await db.save.delete({ where: { id: saveId } });
    const [saves, players, fixtures, transfers] = await Promise.all([
      db.save.count({ where: { id: saveId } }),
      db.playerSave.count({ where: { saveId } }),
      db.fixture.count({ where: { saveId } }),
      db.transfer.count({ where: { saveId } }),
    ]);
    saveId = "";

    expect([saves, players, fixtures, transfers]).toEqual([0, 0, 0, 0]);
  }, 120_000);
});
