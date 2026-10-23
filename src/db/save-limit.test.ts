import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The save limit in createSave, against DATABASE_URL: throwaway users own bare saves (no club, no player: only the
// count matters), so a refused creation costs one query; the one allowed creation builds a real save. The users go at
// the end, their saves with them. Skipped without DATABASE_URL; modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("save limit, in the database", () => {
  let db: typeof prismaClient | undefined;
  let saves: typeof import("./saves") | undefined;
  let limits: typeof import("../lib/limits") | undefined;
  let clubId = "";
  // Real time, not simulation code: a unique suffix keeps parallel runs apart.
  const run = `${Date.now()}`;
  const users = {
    anonymous: `test-limit-anon-${run}`,
    fresh: `test-limit-fresh-${run}`,
    registered: `test-limit-reg-${run}`,
    merged: `test-limit-merged-${run}`,
  };

  const loaded = () => {
    if (db === undefined || saves === undefined || limits === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, saves, limits };
  };

  const bareSaves = (ownerId: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      name: `Test limite ${index + 1}`,
      managerName: "Test",
      seed: `test-limit-${run}`,
      worldVersion: 1,
      currentDate: new Date("2026-07-01T00:00:00.000Z"),
      ownerId,
    }));

  const input = (ownerId: string) => ({ name: "Test limite", managerName: "Test", clubId, seed: `test-limit-${run}`, ownerId, worldVersion: 1 as const });

  beforeAll(async () => {
    const [{ prisma }, savesModule, limitsModule] = await Promise.all([import("./client"), import("./saves"), import("../lib/limits")]);
    db = prisma;
    saves = savesModule;
    limits = limitsModule;
    ({ id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: "olympique-lyonnais" }, select: { id: true } }));
    // Not simulation code: lastSeenAt is real time.
    const now = new Date();
    await prisma.user.createMany({
      data: [
        { id: users.anonymous, kind: "ANONYMOUS", lastSeenAt: now },
        { id: users.fresh, kind: "ANONYMOUS", lastSeenAt: now },
        { id: users.registered, kind: "REGISTERED", lastSeenAt: now },
        { id: users.merged, kind: "REGISTERED", lastSeenAt: now },
      ],
    });
    await prisma.save.createMany({
      data: [...bareSaves(users.anonymous, 1), ...bareSaves(users.registered, 3), ...bareSaves(users.merged, 4)],
    });
  }, 60_000);

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    await db?.$disconnect();
  }, 120_000);

  it("refuses a second save to an anonymous player, and writes nothing", async () => {
    const { db, saves, limits } = loaded();

    await expect(saves.createSave(input(users.anonymous))).rejects.toBeInstanceOf(limits.SaveLimitError);
    await expect(saves.createSave(input(users.anonymous))).rejects.toMatchObject({ kind: "ANONYMOUS", saveCount: 1 });
    expect(await saves.countOwnedSaves(users.anonymous)).toBe(1);
    expect(await db.clubSave.count({ where: { save: { ownerId: users.anonymous } } })).toBe(0);
  });

  it("refuses a fourth save to a Google account, and a fifth to one that a sign-in took beyond three", async () => {
    const { saves } = loaded();

    await expect(saves.createSave(input(users.registered))).rejects.toMatchObject({ kind: "REGISTERED", saveCount: 3 });
    await expect(saves.createSave(input(users.merged))).rejects.toMatchObject({ kind: "REGISTERED", saveCount: 4 });
    // Nothing is taken away from an account beyond the limit.
    expect(await saves.countOwnedSaves(users.merged)).toBe(4);
  });

  it("creates the first save of an anonymous player", async () => {
    const { saves } = loaded();

    const { id } = await saves.createSave(input(users.fresh));

    expect(id).not.toBe("");
    expect(await saves.countOwnedSaves(users.fresh)).toBe(1);
  }, 120_000);
});
