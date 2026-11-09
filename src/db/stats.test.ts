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
  let challengeId = "";
  // Real time, not simulation code: a unique suffix keeps parallel runs apart.
  const run = `${Date.now()}`;
  const id = (name: string) => `test-stats-${name}-${run}`;
  const at = (day: string) => new Date(`${day}T10:00:00.000Z`);
  // A cohort from before the first UserDay, 28 February 2001 (no visit recorded), two cohorts, 1 and 2 March, and
  // an empty day, 3 March. The table's first UserDay is these users' 1 March, unless a crashed run left an older one.
  const users = [
    { id: id("z"), createdAt: at("2001-02-28"), returns: [], untracked: true },
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

  // The days of these users must be the table's first: admin-dashboard.test.ts writes older ones, never at the same time.
  let release: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const { holdTestLock, TEST_LOCKS } = await import("./test-locks");
    release = await holdTestLock(TEST_LOCKS.firstTrackedDays);
    const [{ prisma }, statsModule, userDaysModule] = await Promise.all([import("./client"), import("./stats"), import("./user-days")]);
    db = prisma;
    stats = statsModule;
    userDays = userDaysModule;
    await prisma.user.createMany({
      data: users.map((user) => ({ id: user.id, kind: "ANONYMOUS" as const, createdAt: user.createdAt, lastSeenAt: user.createdAt })),
    });
    for (const user of users) {
      const days = "untracked" in user ? user.returns : [user.createdAt.toISOString().slice(0, 10), ...user.returns];
      for (const day of days) {
        await userDaysModule.recordUserDay(prisma, user.id, at(day));
      }
    }
  }, 60_000);

  afterAll(async () => {
    try {
      await db?.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
      await db?.$disconnect();
    } finally {
      await release?.();
    }
  }, 60_000);

  it("records a day once, however many times it is written", async () => {
    const { db, userDays } = loaded();
    const user = users[1]; // a: created on 1 March, back on the 2nd and the 8th

    await userDays.recordUserDay(db, user.id, new Date("2001-03-02T08:00:00.000Z"));
    await userDays.recordUserDay(db, user.id, new Date("2001-03-02T22:00:00.000Z"));

    expect(await db.userDay.count({ where: { userId: user.id } })).toBe(3);
  });

  it("counts each cohort's returns one and seven days later, unknown until the return day is over", async () => {
    const { db, stats } = loaded();

    const cohorts = await stats.retentionByCohort(db, {
      first: "2001-02-28",
      last: "2001-03-03",
      now: new Date("2001-03-09T12:00:00.000Z"),
    });

    expect(cohorts).toEqual([
      // Before the first recorded visit: unknown, not zero.
      { day: "2001-02-28", users: 1, day1: null, day7: null },
      // a and b came back the next day, a and c a week later; b's return on day 4 counts for neither.
      { day: "2001-03-01", users: 3, day1: 2, day7: 2 },
      // d, created a minute before midnight, came back the next UTC day; 9 March is not over yet.
      { day: "2001-03-02", users: 2, day1: 1, day7: null },
      { day: "2001-03-03", users: 0, day1: 0, day7: null },
    ]);
  });

  describe("first steps of new saves", () => {
    /** A throwaway save of a day of April 2001: its managed club, an opponent and a third club, `played` matches of the managed one. */
    const addSave = async (
      name: string,
      createdAt: Date,
      { played = 0, others = 0, lineup = false, challengeId = null }: { played?: number; others?: number; lineup?: boolean; challengeId?: string | null },
    ) => {
      const { db } = loaded();
      const [managed, opponent, third] = await db.club.findMany({ take: 3, orderBy: { slug: "asc" }, select: { id: true, competitionId: true } });
      const competitionId = managed.competitionId ?? "";
      const save = await db.save.create({
        data: {
          ownerId: users[1].id,
          name,
          managerName: "Test",
          seed: name,
          worldVersion: 2,
          currentDate: createdAt,
          createdAt,
          challengeId,
          clubSaves: {
            create: [
              { clubId: managed.id, competitionId, isManaged: true, lineup: lineup ? { starters: [], benchOrder: [] } : undefined },
              { clubId: opponent.id, competitionId },
              { clubId: third.id, competitionId },
            ],
          },
          seasons: { create: { competitionId, startYear: 2026 } },
        },
        select: { id: true, seasons: { select: { id: true } }, clubSaves: { orderBy: { isManaged: "desc" }, select: { id: true, isManaged: true } } },
      });
      const [own, against, otherClub] = save.clubSaves;
      const fixture = (homeClubSaveId: string, awayClubSaveId: string, round: number, played: boolean) => ({
        saveId: save.id,
        seasonId: save.seasons[0].id,
        round,
        scheduledAt: createdAt,
        homeClubSaveId,
        awayClubSaveId,
        played,
        status: played ? ("PLAYED" as const) : ("SCHEDULED" as const),
      });
      await db.fixture.createMany({
        data: [
          ...Array.from({ length: played }, (_, index) => fixture(own.id, against.id, index + 1, true)),
          // Another club's matches and a match of its own yet to play: neither counts.
          ...Array.from({ length: others }, (_, index) => fixture(against.id, otherClub.id, index + 1, true)),
          fixture(own.id, otherClub.id, played + 1, false),
        ],
      });
    };

    beforeAll(async () => {
      const { db } = loaded();
      const [club] = await db.club.findMany({ take: 1, orderBy: { slug: "asc" }, select: { id: true } });
      const challenge = await db.challenge.create({
        data: {
          weekKey: `test-${run}`,
          seed: run,
          clubId: club.id,
          horizonMatchdays: 10,
          startsAt: at("2001-04-02"),
          endsAt: at("2001-04-09"),
        },
        select: { id: true },
      });
      challengeId = challenge.id;
      await addSave("ten", at("2001-04-01"), { played: 10, others: 3, lineup: true });
      await addSave("nine", at("2001-04-01"), { played: 9 });
      await addSave("others only", at("2001-04-01"), { others: 4 });
      await addSave("late at night", new Date("2001-04-01T23:59:00.000Z"), { played: 1 });
      await addSave("the challenge's", at("2001-04-01"), { played: 12, challengeId });
      await addSave("two days later", at("2001-04-03"), {});
    }, 60_000);

    afterAll(async () => {
      // Before the challenge, which a save restricts.
      await db?.save.deleteMany({ where: { ownerId: users[1].id } });
      await db?.challenge.deleteMany({ where: { id: challengeId } });
    }, 60_000);

    it("counts how far the saves of each day went, only their own club's matches, the challenge's left out", async () => {
      const { db, stats } = loaded();

      const cohorts = await stats.firstStepsByCohort(db, { first: "2001-04-01", last: "2001-04-03" });

      expect(cohorts).toEqual([
        { day: "2001-04-01", saves: 4, lineups: 1, firstMatches: 3, tenMatches: 1 },
        { day: "2001-04-02", saves: 0, lineups: 0, firstMatches: 0, tenMatches: 0 },
        { day: "2001-04-03", saves: 1, lineups: 0, firstMatches: 0, tenMatches: 0 },
      ]);
    });
  });

  it("gives every figure of the page", async () => {
    const { db, stats } = loaded();

    // Not simulation code: the page's real time.
    const now = new Date();
    const result = await stats.getAdminStats(db, now);

    expect(result.newUsersPerDay).toHaveLength(stats.STATS_DAYS);
    expect(result.cohorts.at(-1)).toMatchObject({ day1: null, day7: null });
    // The first steps stop the day before: a save of today still has time to play.
    expect(result.firstSteps).toHaveLength(stats.STATS_DAYS);
    expect(result.firstSteps.at(-1)?.day).toBe(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    expect(result.usersByKind.anonymous).toBeGreaterThanOrEqual(users.length);
    expect(result.databaseBytes).toBeGreaterThan(0);
    expect(result.largestTables).toHaveLength(8);
    expect(result.largestTables.map((table) => table.total)).toEqual([...result.largestTables.map((table) => table.total)].sort((a, b) => b - a));
    // PostgreSQL's counters of each table, since the server started: rows, updates, upkeep.
    for (const table of result.largestTables) {
      expect(table.live, table.table).toBeGreaterThanOrEqual(0);
      expect(table.dead, table.table).toBeGreaterThanOrEqual(0);
      expect(table.hotUpdates, table.table).toBeLessThanOrEqual(table.updates);
      expect(table.autovacuums, table.table).toBeGreaterThanOrEqual(0);
      for (const time of [table.lastAutovacuum, table.lastAutoanalyze]) {
        expect(time === null || !Number.isNaN(Date.parse(time)), table.table).toBe(true);
      }
    }
    expect(result.largestTables.some((table) => table.live > 0)).toBe(true);
    expect(Date.parse(result.serverStartedAt)).toBeLessThanOrEqual(now.getTime());
  });
});
