import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seasonEndDate, WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

// Simulates a throwaway save's whole first season toward a date a year after its end, the way the client chains
// calls, then checks it stopped at the season's end. Runs against DATABASE_URL and is skipped without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("simulateMatchdays, to the end of a season", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";

  beforeAll(async () => {
    const [{ prisma }, support] = await Promise.all([import("./client"), import("./test-support")]);
    db = prisma;
    saveId = await support.createDemoTwin("Test simulation fin de saison");
  }, 120_000);

  // 180 s: deleting a whole season's save takes over 60 s while the other slow files write to the database too.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 180_000);

  it("plays the season in calls of at most five matchdays, then stops: never into the next season", async () => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    const { simulateMatchdays, SIMULATION_MAX_MATCHDAYS } = await import("./simulation");
    const seasonEnd = seasonEndDate(WORLD_START_YEAR);
    const nextYear = new Date(Date.UTC(WORLD_START_YEAR + 2, 0, 1));
    const matchdays = await db.fixture.groupBy({ by: ["scheduledAt"], where: { saveId } });

    let calls = 0;
    let played = 0;
    for (;;) {
      const batch = await simulateMatchdays(saveId, nextYear);
      calls++;
      played += batch.played;
      expect(batch.played).toBeLessThanOrEqual(SIMULATION_MAX_MATCHDAYS);
      if (batch.done) {
        expect(batch.nextDate).toBeNull();
        break;
      }
    }
    expect(played).toBe(matchdays.length);
    expect(calls).toBe(Math.ceil(matchdays.length / SIMULATION_MAX_MATCHDAYS));

    const [save, seasons, unplayed] = await Promise.all([
      db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
      db.season.findMany({ where: { saveId }, select: { startYear: true, completed: true } }),
      db.fixture.count({ where: { saveId, played: false } }),
    ]);
    expect(unplayed).toBe(0);
    expect(save.currentDate <= seasonEnd).toBe(true);
    expect(seasons.every((season) => season.startYear === WORLD_START_YEAR && !season.completed)).toBe(true);

    // Nothing left: a further call plays and writes nothing.
    expect(await simulateMatchdays(saveId, nextYear)).toEqual({ played: 0, nextDate: null, done: true, matches: [] });
  }, 300_000);
});
