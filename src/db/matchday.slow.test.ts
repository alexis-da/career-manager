import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeGoalTimes } from "../engine/match";
import { WORLD_START_DATE } from "../engine/world";
import type { prisma as prismaClient } from "./client";
import type { getStandings as getStandingsFunction } from "./standings";

// Plays a whole season on a twin of the demo save, against DATABASE_URL, then deletes it. Skipped when
// DATABASE_URL is not set. Modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("playNextMatchday on a twin of the demo save", () => {
  let db: typeof prismaClient | undefined;
  let getStandings: typeof getStandingsFunction | undefined;
  let saveId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    const [{ prisma }, support, standings] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./standings"),
    ]);
    db = prisma;
    getStandings = standings.getStandings;

    saveId = await support.createDemoTwin("Test journées");
    await support.playRemainingMatchdays(saveId);
  }, 900_000);

  // Deleting a played save cascades to tens of thousands of rows: allow more than the 10 s hook default.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("plays every fixture of the season, each with a score", async () => {
    const db = database();
    const [unplayed, played, withoutScore] = await Promise.all([
      db.fixture.count({ where: { saveId, played: false } }),
      db.fixture.count({ where: { saveId, played: true } }),
      db.fixture.count({ where: { saveId, played: true, OR: [{ homeGoals: null }, { awayGoals: null }] } }),
    ]);

    expect(unplayed).toBe(0);
    expect(played).toBeGreaterThan(0);
    expect(withoutScore).toBe(0);
  });

  it("records each goal: an event for the scoring side in the managed club's matches, a goal time in the others', and counts them in the stats", async () => {
    const db = database();
    const managed = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    const fixtures = await db.fixture.findMany({
      where: { saveId },
      select: {
        id: true,
        homeGoals: true,
        awayGoals: true,
        homeClubSaveId: true,
        awayClubSaveId: true,
        goalTimes: true,
        events: {
          where: { type: "GOAL" },
          select: { relatedPlayerSaveId: true, playerSave: { select: { clubSaveId: true } } },
        },
      },
    });
    const goalsBy = (fixture: (typeof fixtures)[number], clubSaveId: string) =>
      fixture.events.filter((event) => event.playerSave?.clubSaveId === clubSaveId).length;
    const timesBy = (fixture: (typeof fixtures)[number], side: "home" | "away") =>
      decodeGoalTimes(fixture.goalTimes).filter((goal) => goal.side === side).length;
    const isManagedClubs = (fixture: (typeof fixtures)[number]) =>
      fixture.homeClubSaveId === managed.id || fixture.awayClubSaveId === managed.id;
    const mismatches = fixtures
      .filter((fixture) =>
        isManagedClubs(fixture)
          ? fixture.goalTimes.length > 0 ||
            goalsBy(fixture, fixture.homeClubSaveId) !== fixture.homeGoals ||
            goalsBy(fixture, fixture.awayClubSaveId) !== fixture.awayGoals
          : fixture.events.length > 0 || timesBy(fixture, "home") !== fixture.homeGoals || timesBy(fixture, "away") !== fixture.awayGoals,
      )
      .map((fixture) => fixture.id);
    const managedAssists = fixtures
      .filter(isManagedClubs)
      .flatMap((fixture) => fixture.events)
      .filter((event) => event.relatedPlayerSaveId !== null).length;
    const totalGoals = fixtures.reduce((sum, fixture) => sum + (fixture.homeGoals ?? 0) + (fixture.awayGoals ?? 0), 0);
    const stats = await db.playerSeasonStats.aggregate({ where: { saveId }, _sum: { goals: true, assists: true } });

    expect(fixtures.filter(isManagedClubs).length).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
    expect(stats._sum.goals).toBe(totalGoals);
    // The other matches' assists are kept in the stats alone: at least the managed club's matches', at most one a goal.
    expect(stats._sum.assists).toBeGreaterThanOrEqual(managedAssists);
    expect(stats._sum.assists).toBeLessThanOrEqual(totalGoals);
  });

  it("builds complete standings of 20 or 18 clubs", async () => {
    const seasons = await database().season.findMany({
      where: { saveId },
      select: { id: true, competition: { select: { _count: { select: { clubs: true } } } } },
    });
    if (getStandings === undefined) {
      throw new Error("Standings module not loaded");
    }

    expect(seasons.length).toBeGreaterThan(0);
    for (const season of seasons) {
      const clubCount = season.competition._count.clubs;
      const table = await getStandings(saveId, season.id);

      expect([18, 20]).toContain(table.length);
      expect(table).toHaveLength(clubCount);
      expect(table.every((row) => row.played === 2 * (clubCount - 1))).toBe(true);
    }
  });

  it("moves currentDate forward to the last matchday", async () => {
    const db = database();
    const [save, lastFixture] = await Promise.all([
      db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
      db.fixture.findFirstOrThrow({ where: { saveId }, orderBy: { scheduledAt: "desc" }, select: { scheduledAt: true } }),
    ]);

    expect(save.currentDate.getTime()).toBeGreaterThan(WORLD_START_DATE.getTime());
    expect(save.currentDate).toEqual(lastFixture.scheduledAt);
  });
});
