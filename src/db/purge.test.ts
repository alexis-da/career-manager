import "dotenv/config";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The purge of anonymous users, against DATABASE_URL. The deleting runs happen in a transaction rolled back at the
// end: the purge is global, and the database's own users must stay as they are. The endpoint is only called with a
// wrong secret or in dry run, which delete nothing. Skipped without DATABASE_URL; modules are imported lazily because
// the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("purge of anonymous users, in the database", () => {
  let db: typeof prismaClient | undefined;
  let purge: typeof import("./purge") | undefined;
  let route: typeof import("@/app/api/maintenance/purge/route") | undefined;
  // Real time, not simulation code: who goes depends on it, and a unique suffix keeps parallel runs apart.
  const now = new Date();
  const run = `${now.getTime()}`;
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
  const users = {
    oldAnonymous: { id: `test-purge-old-${run}`, kind: "ANONYMOUS", lastSeenAt: ago(31 * 24), saves: 1 },
    recentAnonymous: { id: `test-purge-recent-${run}`, kind: "ANONYMOUS", lastSeenAt: ago(2), saves: 1 },
    emptyAnonymous: { id: `test-purge-empty-${run}`, kind: "ANONYMOUS", lastSeenAt: ago(25), saves: 0 },
    freshEmptyAnonymous: { id: `test-purge-fresh-${run}`, kind: "ANONYMOUS", lastSeenAt: ago(1), saves: 0 },
    oldRegistered: { id: `test-purge-reg-${run}`, kind: "REGISTERED", lastSeenAt: ago(90 * 24), saves: 1 },
    emptyRegistered: { id: `test-purge-reg-empty-${run}`, kind: "REGISTERED", lastSeenAt: ago(90 * 24), saves: 0 },
  } as const;
  const ids = Object.values(users).map((user) => user.id);
  const SECRET = "test-maintenance-secret-0123456789";
  const secretBefore = process.env.MAINTENANCE_SECRET;

  /** Thrown to roll a transaction back once its checks are done. */
  class Rollback extends Error {}

  const loaded = () => {
    if (db === undefined || purge === undefined || route === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, purge, route };
  };

  const call = (query: string, authorization: string | null) => {
    const headers = authorization === null ? undefined : { authorization };
    return loaded().route.POST(new Request(`http://localhost/api/maintenance/purge${query}`, { method: "POST", headers }));
  };

  beforeAll(async () => {
    const [{ prisma }, purgeModule, routeModule] = await Promise.all([
      import("./client"),
      import("./purge"),
      import("@/app/api/maintenance/purge/route"),
    ]);
    db = prisma;
    purge = purgeModule;
    route = routeModule;
    await prisma.user.createMany({ data: Object.values(users).map(({ id, kind, lastSeenAt }) => ({ id, kind, lastSeenAt, createdAt: lastSeenAt })) });
    await prisma.save.createMany({
      data: Object.values(users)
        .filter((user) => user.saves > 0)
        .map((user) => ({ name: "Test purge", managerName: "Test", seed: `test-purge-${run}`, worldVersion: 1, currentDate: new Date("2026-07-01T00:00:00.000Z"), ownerId: user.id })),
    });
  }, 60_000);

  afterEach(() => {
    if (secretBefore === undefined) {
      delete process.env.MAINTENANCE_SECRET;
    } else {
      process.env.MAINTENANCE_SECRET = secretBefore;
    }
  });

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: ids } } });
    await db?.$disconnect();
  }, 120_000);

  const remaining = async (client: Pick<typeof prismaClient, "user">) =>
    (await client.user.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((user) => user.id).sort();

  it("deletes the old anonymous user with their save and the saveless one, never a recent one nor an account (rolled back)", async () => {
    const { db, purge } = loaded();
    await expect(
      db.$transaction(
        async (tx) => {
          // Batch after batch, as the workflow calls, until none remain.
          let inactive = 0;
          let empty = 0;
          for (let call = 1; ; call++) {
            const result = await purge.purgeAnonymousUsers(tx, now, { dryRun: false });
            expect(result.total).toBe(result.inactive + result.empty);
            expect(result.total).toBeLessThanOrEqual(purge.PURGE_BATCH_SIZE);
            inactive += result.inactive;
            empty += result.empty;
            if (result.remaining === 0) {
              break;
            }
            expect(call).toBeLessThan(1_000);
          }
          expect(inactive).toBeGreaterThanOrEqual(1);
          expect(empty).toBeGreaterThanOrEqual(1);
          expect(await remaining(tx)).toEqual(
            [users.recentAnonymous.id, users.freshEmptyAnonymous.id, users.oldRegistered.id, users.emptyRegistered.id].sort(),
          );
          // The old anonymous user's save went with them; the old account's stays.
          expect(await tx.save.count({ where: { ownerId: { in: ids } } })).toBe(2);
          throw new Rollback();
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);
    expect(await remaining(db)).toEqual([...ids].sort());
  }, 90_000);

  it("stops at the batch size, the users seen longest ago first, and says how many remain (rolled back)", async () => {
    const { db, purge } = loaded();
    await expect(
      db.$transaction(
        async (tx) => {
          const before = await remaining(tx);
          // At least our two purgeable users: a batch of one leaves one at least.
          const result = await purge.purgeAnonymousUsers(tx, now, { dryRun: false, batchSize: 1 });
          expect(result.total).toBe(1);
          expect(result.remaining).toBeGreaterThanOrEqual(1);
          // Nobody seen more recently than our old anonymous user goes before them; the accounts never.
          const after = await remaining(tx);
          const gone = before.filter((id) => !after.includes(id));
          expect(gone.every((id) => id === users.oldAnonymous.id)).toBe(true);
          throw new Rollback();
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);
    expect(await remaining(db)).toEqual([...ids].sort());
  }, 90_000);

  it("only counts in dry run", async () => {
    const { db, purge } = loaded();

    const result = await purge.purgeAnonymousUsers(db, now, { dryRun: true });

    expect(result).toMatchObject({ dryRun: true });
    expect(result.total).toBeGreaterThanOrEqual(1);
    // Our two purgeable users are in this batch or among those remaining.
    expect(result.total + result.remaining).toBeGreaterThanOrEqual(2);
    expect(await remaining(db)).toEqual([...ids].sort());
  });

  it("answers 404 without MAINTENANCE_SECRET, and with a missing or wrong header", async () => {
    delete process.env.MAINTENANCE_SECRET;
    expect((await call("", `Bearer ${SECRET}`)).status).toBe(404);

    process.env.MAINTENANCE_SECRET = SECRET;
    expect((await call("", null)).status).toBe(404);
    expect((await call("", "Bearer wrong-secret")).status).toBe(404);
    expect((await call("", SECRET)).status).toBe(404);
    expect(await remaining(loaded().db)).toEqual([...ids].sort());
  });

  it("answers the counts in JSON, in dry run without deleting anything", async () => {
    process.env.MAINTENANCE_SECRET = SECRET;

    const response = await call("?dryRun=1", `Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      dryRun: true,
      inactive: expect.any(Number),
      empty: expect.any(Number),
      total: expect.any(Number),
      remaining: expect.any(Number),
    });
    expect(await remaining(loaded().db)).toEqual([...ids].sort());
  });
});
