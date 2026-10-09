import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// Retention by cohort, against DATABASE_URL: throwaway users created in March 2001, far from any real one, with the
// days they came back; the cohorts asked for are those days only, so the database's own users never count. Deleted
// at the end, their UserDay rows with them. Skipped without DATABASE_URL; modules are imported lazily because the
// client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("admin statistics, in the database", () => {
  let db: typeof prismaClient | undefined;
  let stats: typeof import("./stats") | undefined;
  let userDays: typeof import("./user-days") | undefined;
  // Real time, not simulation code: a unique suffix keeps parallel runs apart.
  const run = `${Date.now()}`;
  const id = (name: string) => `test-stats-${name}-${run}`;
  const at = (day: string) => new Date(`${day}T10:00:00.000Z`);
  // Two cohorts, 1 and 2 March 2001, and an empty day, 3 March.
  const users = [
    { id: id("a"), createdAt: at("2001-03-01"), returns: ["2001-03-02", "2001-03-08"] },
    { id: id("b"), createdAt: at("2001-03-01"), returns: ["2001-03-02", "2001-03-05"] },
    { id: id("c"), createdAt: at("2001-03-01"), returns: ["2001-03-08"] },
    { id: id("d"), createdAt: new Date("2001-03-02T23:59:00.000Z"), returns: ["2001-03-03", "2001-03-09"] },
    { id: id("e"), createdAt: new Date("2001-03-02T00:00:00.000Z"), returns: [] },
  ];

  const loaded = () => {
    if (db === undefined || stats === undefined || userDays === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, stats, userDays };
  };

  beforeAll(async () => {
    const [{ prisma }, statsModule, userDaysModule] = await Promise.all([import("./client"), import("./stats"), import("./user-days")]);
    db = prisma;
    stats = statsModule;
    userDays = userDaysModule;
    await prisma.user.createMany({
      data: users.map((user) => ({ id: user.id, kind: "ANONYMOUS" as const, createdAt: user.createdAt, lastSeenAt: user.createdAt })),
    });
    for (const user of users) {
      for (const day of [user.createdAt.toISOString().slice(0, 10), ...user.returns]) {
        await userDaysModule.recordUserDay(prisma, user.id, at(day));
      }
    }
  }, 60_000);

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await db?.$disconnect();
  }, 60_000);

  it("records a day once, however many times it is written", async () => {
    const { db, userDays } = loaded();
    const user = users[0];

    await userDays.recordUserDay(db, user.id, new Date("2001-03-02T08:00:00.000Z"));
    await userDays.recordUserDay(db, user.id, new Date("2001-03-02T22:00:00.000Z"));

    expect(await db.userDay.count({ where: { userId: user.id } })).toBe(3);
  });

  it("counts each cohort's returns one and seven days later, unknown until the return day is over", async () => {
    const { db, stats } = loaded();

    const cohorts = await stats.retentionByCohort(db, {
      first: "2001-03-01",
      last: "2001-03-03",
      now: new Date("2001-03-09T12:00:00.000Z"),
    });

    expect(cohorts).toEqual([
      // a and b came back the next day, a and c a week later; b's return on day 4 counts for neither.
      { day: "2001-03-01", users: 3, day1: 2, day7: 2 },
      // d, created a minute before midnight, came back the next UTC day; 9 March is not over yet.
      { day: "2001-03-02", users: 2, day1: 1, day7: null },
      { day: "2001-03-03", users: 0, day1: 0, day7: null },
    ]);
  });

  it("gives every figure of the page", async () => {
    const { db, stats } = loaded();

    // Not simulation code: the page's real time.
    const result = await stats.getAdminStats(db, new Date());

    expect(result.newUsersPerDay).toHaveLength(stats.STATS_DAYS);
    expect(result.cohorts.at(-1)).toMatchObject({ day1: null, day7: null });
    expect(result.usersByKind.anonymous).toBeGreaterThanOrEqual(users.length);
    expect(result.databaseBytes).toBeGreaterThan(0);
    expect(result.largestTables).toHaveLength(5);
    expect(result.largestTables.map((table) => table.total)).toEqual([...result.largestTables.map((table) => table.total)].sort((a, b) => b - a));
  });
});
