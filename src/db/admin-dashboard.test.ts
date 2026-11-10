import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The figures of /admin, against DATABASE_URL: visits, players, their days and the day's figures of March 1999, earlier
// than any other test's, so that the tracking of visits and of days starts with them; deleted before and after. Skipped
// without DATABASE_URL; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the administrator's dashboard, in the database", () => {
  let db: typeof prismaClient | undefined;
  let dashboard: typeof import("./admin-dashboard") | undefined;
  // Real time, not simulation code: a unique suffix keeps parallel runs apart.
  const run = `${Date.now()}`;
  const id = (name: string) => `test-admin-${name}-${run}`;
  const at = (time: string) => new Date(`1999-03-${time}Z`);
  const day = (date: string) => new Date(`1999-03-${date}T00:00:00.000Z`);
  const NOW = at("10T12:00:00.000");
  const MB = 1024 * 1024;
  const DAYS = ["02", "03", "05", "06", "08", "09", "10"].map(day);

  const users = [
    // Two players from a Reddit post on the 5th: one back the next day, one a Google account who finished a season.
    {
      id: id("a"),
      kind: "ANONYMOUS" as const,
      createdAt: at("05T10:00:00.000"),
      source: "reddit-test",
      locale: "fr",
      device: "PHONE" as const,
      firstSaveAt: at("05T10:01:00.000"),
      firstMatchAt: at("05T10:11:00.000"),
      days: ["05", "06"],
    },
    {
      id: id("b"),
      kind: "REGISTERED" as const,
      createdAt: at("05T11:00:00.000"),
      source: "reddit-test",
      locale: "en",
      device: "COMPUTER" as const,
      firstSaveAt: at("05T11:00:00.000"),
      firstMatchAt: at("05T11:30:00.000"),
      firstSeasonEndAt: at("08T09:00:00.000"),
      days: ["05"],
    },
    // A player from before the tracking of arrivals, on the 9th; and one before the period, on the 2nd.
    { id: id("c"), kind: "ANONYMOUS" as const, createdAt: at("09T08:00:00.000"), days: ["09"] },
    { id: id("d"), kind: "ANONYMOUS" as const, createdAt: at("02T08:00:00.000"), source: "reddit-test", days: ["02"] },
  ];

  const loaded = () => {
    if (db === undefined || dashboard === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, dashboard };
  };
  const clean = async (client: typeof prismaClient) => {
    await client.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await client.visitDay.deleteMany({ where: { day: { in: DAYS } } });
    await client.dailyStat.deleteMany({ where: { day: { in: DAYS } } });
    await client.cleanupPass.deleteMany({ where: { at: { gte: day("01"), lt: new Date("1999-04-01T00:00:00.000Z") } } });
    await client.archivePass.deleteMany({ where: { at: { gte: day("01"), lt: new Date("1999-04-01T00:00:00.000Z") } } });
  };
  /** A pass of the event cleanup, as the maintenance records it. */
  const cleanupPass = (time: string, dryRun: boolean, deleted: number, remaining: number) => ({
    at: at(time),
    dryRun,
    otherGoalsDeleted: deleted,
    otherGoalsRemaining: remaining,
    managedEventsDeleted: 0,
    managedEventsRemaining: 7,
    decisionsDeleted: 0,
    decisionsRemaining: 2,
    milliseconds: 1_500,
  });
  /** A pass of the « archive » task, as the maintenance records it. */
  const archivePass = (time: string, mode: "COUNT" | "ARCHIVE" | "DELETE", archived: number, deleted: number, remaining: number) => ({
    at: at(time),
    mode,
    seasonsArchived: archived,
    seasonsPending: 15 - archived,
    seasonsDeleted: deleted === 0 ? 0 : 4,
    fixturesDeleted: deleted / 2,
    statsDeleted: deleted / 2,
    seasonsDeletable: 3,
    rowsRemaining: remaining,
    mismatches: mode === "DELETE" ? 1 : 0,
    milliseconds: 2_500,
  });

  // Its days must be the table's first: stats.test.ts writes its own, never at the same time.
  let release: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const { holdTestLock, TEST_LOCKS } = await import("./test-locks");
    release = await holdTestLock(TEST_LOCKS.firstTrackedDays);
    const [{ prisma }, dashboardModule] = await Promise.all([import("./client"), import("./admin-dashboard")]);
    db = prisma;
    dashboard = dashboardModule;
    await clean(prisma);
    for (const { days, ...user } of users) {
      await prisma.user.create({ data: { ...user, lastSeenAt: user.createdAt } });
      await prisma.userDay.createMany({ data: days.map((date) => ({ userId: user.id, day: day(date) })) });
    }
    await prisma.visitDay.createMany({
      data: [
        { day: day("02"), source: "reddit-test", page: "/", visits: 50 },
        { day: day("05"), source: "reddit-test", page: "/", visits: 10 },
        { day: day("05"), source: "direct", page: "/fr", visits: 4 },
        { day: day("09"), source: "reddit-test", page: "/", visits: 6 },
      ],
    });
    await prisma.dailyStat.createMany({
      data: [
        { day: day("03"), databaseBytes: 100 * MB },
        { day: day("05"), liveMatches: 3, simulatedMatches: 7, appLaunches: 2 },
        { day: day("09"), databaseBytes: 103 * MB },
        { day: day("10"), databaseBytes: 104 * MB, purgedUsers: 2, purgedSaves: 3 },
      ],
    });
    // The event cleanup's passes: one on the 3rd, before the seven days; a count, then a deletion, on the 10th.
    await prisma.cleanupPass.createMany({
      data: [
        cleanupPass("03T04:17:00.000", true, 0, 900),
        cleanupPass("10T04:17:30.000", true, 0, 900),
        cleanupPass("10T04:18:00.000", false, 600, 300),
      ],
    });
    // The archive task's passes: a count on the 2nd, before the seven days; an archiving, then a deletion, on the 10th.
    await prisma.archivePass.createMany({
      data: [
        archivePass("02T04:20:00.000", "COUNT", 0, 0, 9_000),
        archivePass("10T04:20:00.000", "ARCHIVE", 15, 0, 9_000),
        archivePass("10T04:21:00.000", "DELETE", 0, 6_000, 3_000),
      ],
    });
  }, 60_000);

  afterAll(async () => {
    try {
      if (db !== undefined) {
        await clean(db);
      }
      await db?.$disconnect();
    } finally {
      await release?.();
    }
  }, 60_000);

  it("gives each day of the period its visits, new players and their returns, active players, matches and health", async () => {
    const { db, dashboard } = loaded();

    const { first, last, trackedSince, days } = await dashboard.getAdminDashboard(db, NOW, 7);

    expect({ first, last, trackedSince }).toEqual({ first: "1999-03-04", last: "1999-03-10", trackedSince: "1999-03-02" });
    expect(days.map(({ day: date }) => date)).toEqual(["04", "05", "06", "07", "08", "09", "10"].map((date) => `1999-03-${date}`));
    const [fourth, fifth, sixth, , , ninth, tenth] = days;
    expect(fourth).toMatchObject({ visits: 0, players: 0, active: 0, day1: 0 });
    // The 5th: two players, one back on the 6th; their seventh day is not over on the 10th.
    expect(fifth).toMatchObject({
      visits: 14,
      players: 2,
      registered: 1,
      day1: 1,
      day7: null,
      active: 2,
      liveMatches: 3,
      simulatedMatches: 7,
      appLaunches: 2,
    });
    expect(sixth).toMatchObject({ visits: 0, players: 0, active: 1 });
    // The 9th: its next day, the 10th, is today, not over.
    expect(ninth).toMatchObject({ visits: 6, players: 1, day1: null, active: 1, databaseBytes: 103 * MB, growth: null });
    expect(tenth).toMatchObject({ databaseBytes: 104 * MB, growth: MB, purgedUsers: 2, purgedSaves: 3, purgedChallengeSaves: 0 });
  });

  it("follows each source from its visits to its players' first career, first match and season's end, the unknown last", async () => {
    const { db, dashboard } = loaded();

    const { sources, total, players } = await dashboard.getAdminDashboard(db, NOW, 7);

    expect(sources.map(({ source }) => source)).toEqual(["reddit-test", "direct", dashboard.UNKNOWN_SOURCE]);
    expect(sources[0]).toEqual({
      source: "reddit-test",
      visits: 16,
      players: 2,
      careers: 2,
      firstMatches: 2,
      seasonEnds: 1,
      // 10 and 30 minutes.
      medianMinutesToFirstMatch: 20,
      day1: { part: 1, whole: 2 },
      day7: { part: 0, whole: 0 },
    });
    expect(sources[1]).toMatchObject({ source: "direct", visits: 4, players: 0 });
    expect(sources[2]).toMatchObject({ visits: 0, players: 1, careers: 0, medianMinutesToFirstMatch: null });
    expect(total).toMatchObject({ visits: 20, players: 3, careers: 2, firstMatches: 2, seasonEnds: 1, medianMinutesToFirstMatch: 20 });
    expect(players).toEqual({ anonymous: 2, registered: 1, fr: 1, en: 1, phone: 1, computer: 1 });
  });

  it("measures the storage's growth over the last seven days of snapshots, its cost and the weight a new player adds", async () => {
    const { db, dashboard } = loaded();

    const { health, challenge } = await dashboard.getAdminDashboard(db, NOW, 7);

    // From the 3rd to the 10th: 4 MB in seven days, over the players created from the 3rd to the 9th: a and b on the 5th,
    // c on the 9th; d, on the 2nd, came before.
    expect(health.growth).toBeCloseTo(4 * MB);
    expect(health.dailyGrowth).toBeCloseTo((4 * MB) / 7);
    expect(health.growthSince).toBe("1999-03-03");
    expect(health.newPlayers).toBe(3);
    expect(health.bytesPerNewPlayer).toBeCloseTo((4 * MB) / 3);
    // The size now, the test database's own: priced, then projected 30 days ahead at 4/7 MB a day.
    expect(health.databaseBytes).toBeGreaterThan(0);
    expect(health.storageCost).toBeCloseTo((health.databaseBytes / 1024 ** 3) * 0.35);
    expect(health.projectedBytes).toBeCloseTo(health.databaseBytes + (30 * 4 * MB) / 7);
    expect(health.costAlert).toBe((health.projectedCost ?? 0) > 5);
    expect(challenge).toBeNull();
  });

  it("covers thirty days, today included", async () => {
    const { db, dashboard } = loaded();

    const { first, days, total } = await dashboard.getAdminDashboard(db, NOW, 30);

    expect(first).toBe("1999-02-09");
    expect(days).toHaveLength(30);
    // The player of the 2nd and the visits of that day are in it now.
    expect(total).toMatchObject({ visits: 70, players: 4 });
  });

  it("lists the event cleanup's passes of the period, the latest first, with what each deleted and left", async () => {
    const { db, dashboard } = loaded();

    const week = await dashboard.getAdminDashboard(db, NOW, 7);
    const month = await dashboard.getAdminDashboard(db, NOW, 30);

    expect(week.health.cleanup).toEqual([
      {
        at: "1999-03-10T04:18:00.000Z",
        dryRun: false,
        deleted: { otherGoals: 600, managedEvents: 0, decisions: 0 },
        remaining: { otherGoals: 300, managedEvents: 7, decisions: 2 },
        milliseconds: 1_500,
      },
      {
        at: "1999-03-10T04:17:30.000Z",
        dryRun: true,
        deleted: { otherGoals: 0, managedEvents: 0, decisions: 0 },
        remaining: { otherGoals: 900, managedEvents: 7, decisions: 2 },
        milliseconds: 1_500,
      },
    ]);
    // The pass of the 3rd, before the seven days, is in the thirty.
    expect(month.health.cleanup.map((pass) => pass.at)).toEqual(["1999-03-10T04:18:00.000Z", "1999-03-10T04:17:30.000Z", "1999-03-03T04:17:00.000Z"]);
  });

  it("lists the archive task's passes of the period, the latest first, with what each archived, deleted and left", async () => {
    const { db, dashboard } = loaded();

    const week = await dashboard.getAdminDashboard(db, NOW, 7);
    const month = await dashboard.getAdminDashboard(db, NOW, 30);

    expect(week.health.archive).toEqual([
      {
        at: "1999-03-10T04:21:00.000Z",
        mode: "delete",
        archived: 0,
        deletedSeasons: 4,
        deletedRows: 6_000,
        mismatches: 1,
        pending: 15,
        deletable: 3,
        rowsRemaining: 3_000,
        milliseconds: 2_500,
      },
      {
        at: "1999-03-10T04:20:00.000Z",
        mode: "archive",
        archived: 15,
        deletedSeasons: 0,
        deletedRows: 0,
        mismatches: 0,
        pending: 0,
        deletable: 3,
        rowsRemaining: 9_000,
        milliseconds: 2_500,
      },
    ]);
    // The count of the 2nd, before the seven days, is in the thirty.
    expect(month.health.archive.map((pass) => pass.mode)).toEqual(["delete", "archive", "count"]);
  });
});
