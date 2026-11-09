import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The day's figures, against DATABASE_URL: today's row of the test database, which other files' matches and purges add
// to at the same time, hence counts read as increases of at least what this file adds. Skipped without DATABASE_URL;
// modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the day's figures, in the database", () => {
  let db: typeof prismaClient | undefined;
  let stats: typeof import("./daily-stats") | undefined;

  const loaded = () => {
    if (db === undefined || stats === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, stats };
  };
  /** Today's row at the database's clock, as the statements write it; zeros before its first figure. */
  const today = async () => {
    const [row] = await loaded().db.$queryRaw<
      {
        liveMatches: number;
        simulatedMatches: number;
        appLaunches: number;
        databaseBytes: bigint | null;
        purgedUsers: number;
        purgedSaves: number;
        purgedChallengeSaves: number;
      }[]
    >`SELECT "liveMatches", "simulatedMatches", "appLaunches", "databaseBytes", "purgedUsers", "purgedSaves", "purgedChallengeSaves"
      FROM "DailyStat" WHERE "day" = (now() AT TIME ZONE 'UTC')::date`;
    return (
      row ?? { liveMatches: 0, simulatedMatches: 0, appLaunches: 0, databaseBytes: null, purgedUsers: 0, purgedSaves: 0, purgedChallengeSaves: 0 }
    );
  };

  beforeAll(async () => {
    const [{ prisma }, statsModule] = await Promise.all([import("./client"), import("./daily-stats")]);
    db = prisma;
    stats = statsModule;
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
  }, 60_000);

  it("counts the matches played today, live and simulated apart", async () => {
    const { db, stats } = loaded();
    const before = await today();

    await stats.countManagedMatch(db, "live");
    await stats.countManagedMatch(db, "simulated");
    await stats.countManagedMatch(db, "simulated");

    const after = await today();
    expect(after.liveMatches).toBeGreaterThanOrEqual(before.liveMatches + 1);
    expect(after.simulatedMatches).toBeGreaterThanOrEqual(before.simulatedMatches + 2);
  });

  it("counts the installed app's launches today, nothing else", async () => {
    const { db, stats } = loaded();
    const before = await today();

    await stats.countAppLaunch(db);
    await stats.countAppLaunch(db);

    const after = await today();
    expect(after.appLaunches).toBeGreaterThanOrEqual(before.appLaunches + 2);
  });

  it("adds each maintenance call's deletions to the day's, and keeps the database's size of the last one", async () => {
    const { db, stats } = loaded();
    const before = await today();

    await stats.recordMaintenance(db, { users: 2, saves: 3, challengeSaves: 1 });
    await stats.recordMaintenance(db, { users: 0, saves: 0, challengeSaves: 0 });

    const after = await today();
    expect(after.purgedUsers).toBeGreaterThanOrEqual(before.purgedUsers + 2);
    expect(after.purgedSaves).toBeGreaterThanOrEqual(before.purgedSaves + 3);
    expect(after.purgedChallengeSaves).toBeGreaterThanOrEqual(before.purgedChallengeSaves + 1);
    const [{ size }] = await db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
    // The size of a moment ago: within a few megabytes of now, whatever the other files write meanwhile.
    expect(Math.abs(Number(after.databaseBytes ?? 0) - Number(size))).toBeLessThan(64 * 1024 * 1024);
  });
});
