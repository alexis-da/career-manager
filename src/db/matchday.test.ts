import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";
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

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    const [{ prisma }, support, { playNextMatchday }, standings] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./standings"),
    ]);
    db = prisma;
    getStandings = standings.getStandings;
    saveId = await support.createDemoTwin("Test première journée");
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
    const firstMatchday = new Date(Date.UTC(2024, 7, 17));
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

  it("records one goal event per goal and counts them in the season stats", async () => {
    const db = database();
    const [fixtures, goalEvents, stats] = await Promise.all([
      db.fixture.aggregate({ where: { saveId, played: true }, _sum: { homeGoals: true, awayGoals: true } }),
      db.matchEvent.count({ where: { type: "GOAL", fixture: { saveId } } }),
      db.playerSeasonStats.aggregate({ where: { saveId }, _sum: { goals: true } }),
    ]);
    const goals = (fixtures._sum.homeGoals ?? 0) + (fixtures._sum.awayGoals ?? 0);

    expect(summary?.goals).toBe(goals);
    expect(goalEvents).toBe(goals);
    expect(stats._sum.goals).toBe(goals);
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

    expect(save.currentDate.toISOString()).toBe("2024-08-17T00:00:00.000Z");
    for (const season of seasons) {
      const table = await getStandings(saveId, season.id);
      expect(table).toHaveLength(season.competition._count.clubs);
      expect(table.every((row) => row.played === 1)).toBe(true);
    }
  });
});
