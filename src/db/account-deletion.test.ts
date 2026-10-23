import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// A player deleting their own Google account, against DATABASE_URL: throwaway users with bare saves (no club, no
// player: only their owner matters), deleted at the end if a test left them. Skipped without DATABASE_URL; modules
// are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("account deletion, in the database", () => {
  let db: typeof prismaClient | undefined;
  let accounts: typeof import("./accounts") | undefined;
  // Real time, not simulation code: a unique suffix keeps parallel runs apart.
  const run = `${Date.now()}`;
  const users = {
    account: `test-delete-account-${run}`,
    otherAccount: `test-delete-other-${run}`,
    anonymous: `test-delete-anon-${run}`,
  };

  const loaded = () => {
    if (db === undefined || accounts === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, accounts };
  };

  const bareSave = (ownerId: string) => ({
    name: "Test suppression",
    managerName: "Test",
    seed: `test-delete-${run}`,
    worldVersion: 1,
    currentDate: new Date("2026-07-01T00:00:00.000Z"),
    ownerId,
  });

  beforeAll(async () => {
    const [{ prisma }, accountsModule] = await Promise.all([import("./client"), import("./accounts")]);
    db = prisma;
    accounts = accountsModule;
    // Not simulation code: lastSeenAt is real time.
    const now = new Date();
    await prisma.user.createMany({
      data: [
        { id: users.account, kind: "REGISTERED", lastSeenAt: now, email: `${users.account}@example.com` },
        { id: users.otherAccount, kind: "REGISTERED", lastSeenAt: now, email: `${users.otherAccount}@example.com` },
        { id: users.anonymous, kind: "ANONYMOUS", lastSeenAt: now },
      ],
    });
    await prisma.save.createMany({
      data: [bareSave(users.account), bareSave(users.account), bareSave(users.otherAccount), bareSave(users.anonymous)],
    });
    await prisma.userDay.create({ data: { userId: users.account, day: new Date("2026-10-09T00:00:00.000Z") } });
  }, 60_000);

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    await db?.$disconnect();
  }, 60_000);

  it("deletes the account with its saves and visit days, and leaves the others alone", async () => {
    const { db, accounts } = loaded();

    expect(await accounts.deleteRegisteredUser(users.account)).toBe(true);

    expect(await db.user.count({ where: { id: users.account } })).toBe(0);
    expect(await db.save.count({ where: { ownerId: users.account } })).toBe(0);
    expect(await db.userDay.count({ where: { userId: users.account } })).toBe(0);
    expect(await db.user.count({ where: { id: { in: [users.otherAccount, users.anonymous] } } })).toBe(2);
    expect(await db.save.count({ where: { ownerId: { in: [users.otherAccount, users.anonymous] } } })).toBe(2);
  });

  it("deletes no anonymous user, and nothing for a user that does not exist", async () => {
    const { db, accounts } = loaded();

    expect(await accounts.deleteRegisteredUser(users.anonymous)).toBe(false);
    expect(await accounts.deleteRegisteredUser(users.account)).toBe(false);
    expect(await db.save.count({ where: { ownerId: users.anonymous } })).toBe(1);
  });
});
