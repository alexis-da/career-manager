import "dotenv/config";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The cleanup of the match events no screen reads any more (src/db/event-cleanup.ts), on a throwaway twin of the demo
// save played three matchdays, its other matches' goals put back as events the way the game kept them before
// Fixture.goalTimes, the current date's included. Every deleting pass is scoped to the twin (saveIds): the cleanup is
// global, and the database's other saves must stay as they are; the endpoint is only called in dry run or with a wrong
// secret. The proof that no screen changes, over seasons played before and after the change, is
// event-cleanup.slow.test.ts. Skipped without DATABASE_URL; modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the cleanup of the match events no screen reads", () => {
  let db: typeof prismaClient | undefined;
  let cleanup: typeof import("./event-cleanup") | undefined;
  let route: typeof import("@/app/api/maintenance/cleanup/route") | undefined;
  let saveId = "";
  let managedId = "";
  let today = new Date(0);
  let startedAt = new Date(0); // the database's clock before the file's first pass: its passes are deleted at the end
  const SECRET = "test-maintenance-secret-0123456789";
  const secretBefore = process.env.MAINTENANCE_SECRET;

  const loaded = () => {
    if (db === undefined || cleanup === undefined || route === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, cleanup, route };
  };

  /** A pass on the twin only, as the maintenance runs it on every save. */
  const pass = (options: Omit<import("./event-cleanup").EventCleanupOptions, "saveIds">) =>
    loaded().cleanup.cleanUpEvents(loaded().db, { ...options, saveIds: [saveId] });

  /** What the twin holds of each kind, read through Prisma, apart from the cleanup's own SQL. */
  const counts = async () => {
    const { db } = loaded();
    const other = { homeClubSaveId: { not: managedId }, awayClubSaveId: { not: managedId } };
    const managed = { OR: [{ homeClubSaveId: managedId }, { awayClubSaveId: managedId }] };
    return {
      otherGoalsPast: await db.matchEvent.count({ where: { type: "GOAL", fixture: { saveId, ...other, scheduledAt: { lt: today } } } }),
      otherGoalsToday: await db.matchEvent.count({ where: { type: "GOAL", fixture: { saveId, ...other, scheduledAt: today } } }),
      otherCards: await db.matchEvent.count({ where: { type: { not: "GOAL" }, fixture: { saveId, ...other } } }),
      managedEvents: await db.matchEvent.count({ where: { fixture: { saveId, ...managed } } }),
      decisions: await db.matchDecision.count({ where: { fixture: { saveId, ...managed } } }),
    };
  };

  const call = (query: string, authorization: string | null) => {
    const headers = authorization === null ? undefined : { authorization };
    return loaded().route.POST(new Request(`http://localhost/api/maintenance/cleanup${query}`, { method: "POST", headers }));
  };

  beforeAll(async () => {
    const [{ prisma }, support, matchday, cleanupModule, routeModule] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./event-cleanup"),
      import("@/app/api/maintenance/cleanup/route"),
    ]);
    db = prisma;
    cleanup = cleanupModule;
    route = routeModule;
    [{ now: startedAt }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    saveId = await support.createDemoTwin("Test nettoyage des événements");
    for (let matchday_ = 0; matchday_ < 3; matchday_++) {
      await matchday.playNextMatchday(saveId);
    }
    ({ currentDate: today } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }));
    ({ id: managedId } = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } }));
    // Every match played so far kept the old way, today's too: a live match paused since then would still show them.
    await support.keepOtherGoalsAsEvents(saveId, { lte: today });
    // A card of an older code on another match: the cleanup deletes goals only.
    const fixture = await prisma.fixture.findFirstOrThrow({
      where: { saveId, played: true, scheduledAt: { lt: today }, homeClubSaveId: { not: managedId }, awayClubSaveId: { not: managedId } },
      select: { id: true, homeClubSaveId: true },
    });
    const player = await prisma.playerSave.findFirstOrThrow({ where: { saveId, clubSaveId: fixture.homeClubSaveId }, select: { id: true } });
    await prisma.matchEvent.create({ data: { fixtureId: fixture.id, minute: 30, type: "YELLOW_CARD", side: "HOME", playerSaveId: player.id } });
  }, 180_000);

  afterEach(() => {
    if (secretBefore === undefined) {
      delete process.env.MAINTENANCE_SECRET;
    } else {
      process.env.MAINTENANCE_SECRET = secretBefore;
    }
  });

  afterAll(async () => {
    await db?.cleanupPass.deleteMany({ where: { at: { gte: startedAt } } });
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("counts in a dry run what each kind would lose, deletes nothing, and records the pass", async () => {
    const before = await counts();
    expect(before.otherGoalsPast).toBeGreaterThan(0);
    expect(before.otherGoalsToday).toBeGreaterThan(0);
    expect(before.managedEvents).toBeGreaterThan(0);
    expect(before.decisions).toBeGreaterThan(0);

    const counted = await pass({ dryRun: true });

    expect(counted).toMatchObject({
      dryRun: true,
      deleted: { otherGoals: 0, managedEvents: 0, decisions: 0 },
      // Today's goals are not counted, nor the card, nor the managed club's season in progress.
      remaining: { otherGoals: before.otherGoalsPast, managedEvents: 0, decisions: 0 },
    });
    expect(await counts()).toEqual(before);
    expect(await loaded().db.cleanupPass.findUniqueOrThrow({ where: { id: counted.id } })).toMatchObject({
      dryRun: true,
      otherGoalsDeleted: 0,
      otherGoalsRemaining: before.otherGoalsPast,
      managedEventsDeleted: 0,
      managedEventsRemaining: 0,
      decisionsDeleted: 0,
      decisionsRemaining: 0,
      milliseconds: counted.milliseconds,
    });
  });

  it("deletes by batches, within the rows and the time it is given", async () => {
    const before = await counts();

    // No time: no batch starts, what remains is counted all the same.
    const idle = await pass({ dryRun: false, maxMs: 0 });
    expect(idle.deleted).toEqual({ otherGoals: 0, managedEvents: 0, decisions: 0 });
    expect(idle.remaining.otherGoals).toBe(before.otherGoalsPast);

    // Five rows, two a statement: three statements, five rows, not one more.
    const five = await pass({ dryRun: false, maxRows: 5, batchRows: 2 });
    expect(five.deleted).toEqual({ otherGoals: 5, managedEvents: 0, decisions: 0 });
    expect(five.remaining.otherGoals).toBe(before.otherGoalsPast - 5);
    expect(await counts()).toEqual({ ...before, otherGoalsPast: before.otherGoalsPast - 5 });
  });

  it("deletes the other matches' goals of the past dates, pass after pass, never today's, a card or the season in progress", async () => {
    const before = await counts();

    const passes = [];
    do {
      passes.push(await pass({ dryRun: false, maxRows: 60, batchRows: 25 }));
    } while (loaded().cleanup.totalOf(passes.at(-1)?.remaining ?? { otherGoals: 0, managedEvents: 0, decisions: 0 }) > 0);

    expect(passes.length).toBeGreaterThan(1);
    expect(passes.every((one) => one.deleted.otherGoals <= 60)).toBe(true);
    expect(passes.reduce((sum, one) => sum + one.deleted.otherGoals, 0)).toBe(before.otherGoalsPast);
    expect(await counts()).toEqual({ ...before, otherGoalsPast: 0 });

    // Nothing left: a pass deletes nothing and says so.
    const empty = await pass({ dryRun: false });
    expect(empty.deleted).toEqual({ otherGoals: 0, managedEvents: 0, decisions: 0 });
    expect(empty.remaining).toEqual({ otherGoals: 0, managedEvents: 0, decisions: 0 });
  });

  it("deletes the events and decisions of the managed club's matches once their season is completed, today's other goals kept", async () => {
    const { db } = loaded();
    await db.season.updateMany({ where: { saveId }, data: { completed: true } });
    const before = await counts();

    const counted = await pass({ dryRun: true });
    expect(counted.remaining).toEqual({ otherGoals: 0, managedEvents: before.managedEvents, decisions: before.decisions });

    const done = await pass({ dryRun: false });
    expect(done.deleted).toEqual({ otherGoals: 0, managedEvents: before.managedEvents, decisions: before.decisions });
    expect(done.remaining).toEqual({ otherGoals: 0, managedEvents: 0, decisions: 0 });
    expect(await counts()).toEqual({ ...before, managedEvents: 0, decisions: 0 });
  });

  it("answers 404 without MAINTENANCE_SECRET or with a wrong header, and counts in JSON in a dry run", async () => {
    const before = await counts();
    delete process.env.MAINTENANCE_SECRET;
    expect((await call("?dryRun=1", `Bearer ${SECRET}`)).status).toBe(404);

    process.env.MAINTENANCE_SECRET = SECRET;
    expect((await call("?dryRun=1", null)).status).toBe(404);
    expect((await call("?dryRun=1", "Bearer wrong-secret")).status).toBe(404);

    const response = await call("?dryRun=1", `Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dryRun: true,
      deleted: 0,
      remaining: expect.any(Number),
      byKind: {
        deleted: { otherGoals: 0, managedEvents: 0, decisions: 0 },
        remaining: { otherGoals: expect.any(Number), managedEvents: expect.any(Number), decisions: expect.any(Number) },
      },
      milliseconds: expect.any(Number),
    });
    expect(await counts()).toEqual(before);
  });
});
