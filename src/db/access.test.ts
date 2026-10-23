import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// Who may open a save, against DATABASE_URL: two throwaway users, one save played for a matchday, then deleted with
// its owner. Skipped without DATABASE_URL; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("access to a save", () => {
  let db: typeof prismaClient | undefined;
  let access: typeof import("./access") | undefined;
  let support: typeof import("./test-support") | undefined;
  // Real time, not simulation code: a unique suffix keeps parallel runs apart.
  const run = `${Date.now()}`;
  const users = { owner: `test-access-owner-${run}`, other: `test-access-other-${run}`, race: `test-access-race-${run}` };
  let saveId = "";

  const loaded = () => {
    if (db === undefined || access === undefined || support === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, access, support };
  };

  /** What Next's notFound() throws: the page answers 404. */
  const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

  beforeAll(async () => {
    const [{ prisma }, accessModule, supportModule, { createSave }, { playNextMatchday }] = await Promise.all([
      import("./client"),
      import("./access"),
      import("./test-support"),
      import("./saves"),
      import("./matchday"),
    ]);
    db = prisma;
    access = accessModule;
    support = supportModule;
    await Promise.all([supportModule.ensureDemoUser(users.owner), supportModule.ensureDemoUser(users.other)]);
    const club = await prisma.club.findUniqueOrThrow({ where: { slug: supportModule.DEMO_CLUB_SLUG }, select: { id: true } });
    ({ id: saveId } = await createSave({
      name: "Test accès",
      managerName: "Test",
      clubId: club.id,
      seed: supportModule.DEMO_SEED,
      ownerId: users.owner,
      worldVersion: 1, // no second division needed here: half the rows
    }));
    await playNextMatchday(saveId);
  }, 240_000);

  // Deleting the users cascades to their saves; a failed test leaves nothing behind either.
  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    await db?.$disconnect();
  }, 120_000);

  it("opens a save for its owner", async () => {
    const { access } = loaded();

    expect(await access.loadOwnedSave(saveId, { id: users.owner })).toEqual({ id: saveId, ownerId: users.owner });
  });

  it("answers 404 to another player, to nobody, and for a save that does not exist", async () => {
    const { access } = loaded();

    await expect(access.loadOwnedSave(saveId, { id: users.other })).rejects.toMatchObject(NOT_FOUND);
    await expect(access.loadOwnedSave(saveId, null)).rejects.toMatchObject(NOT_FOUND);
    await expect(access.loadOwnedSave("no-such-save", { id: users.owner })).rejects.toMatchObject(NOT_FOUND);
  });

  it("opens an inherited save, without an owner, for nobody, and lists it for nobody", async () => {
    const { db, access } = loaded();
    await db.save.update({ where: { id: saveId }, data: { ownerId: null } });
    try {
      await expect(access.loadOwnedSave(saveId, { id: users.owner })).rejects.toMatchObject(NOT_FOUND);
      await expect(access.loadOwnedSave(saveId, null)).rejects.toMatchObject(NOT_FOUND);
      for (const viewer of [null, { id: users.owner }, { id: users.other }]) {
        const visible = await db.save.findMany({ where: access.visibleSavesWhere(viewer), select: { id: true } });
        expect(visible.map((save) => save.id)).not.toContain(saveId);
      }
      expect(await db.save.count({ where: access.visibleSavesWhere(null) })).toBe(0);
    } finally {
      await db.save.update({ where: { id: saveId }, data: { ownerId: users.owner } });
    }
  });

  it("gives the demo save to a stable demo user, created once even by parallel calls", async () => {
    const { db, support } = loaded();
    const demoSaveId = await support.ensureDemoSave();
    const demo = await db.save.findUniqueOrThrow({ where: { id: demoSaveId }, select: { ownerId: true } });

    expect(demo.ownerId).toBe(support.DEMO_USER_ID);
    expect(await support.ensureDemoUser()).toBe(support.DEMO_USER_ID);
    expect(await db.user.count({ where: { id: support.DEMO_USER_ID } })).toBe(1);

    const ids = await Promise.all(Array.from({ length: 8 }, () => support.ensureDemoUser(users.race)));
    expect(new Set(ids)).toEqual(new Set([users.race]));
    expect(await db.user.count({ where: { id: users.race } })).toBe(1);
  }, 600_000);

  it("deletes a played save with its owner, by cascade", async () => {
    const { db } = loaded();
    const [events, players] = await Promise.all([
      db.matchEvent.count({ where: { fixture: { saveId } } }),
      db.playerSave.count({ where: { saveId } }),
    ]);
    expect(events).toBeGreaterThan(0);
    expect(players).toBeGreaterThan(0);

    await db.user.delete({ where: { id: users.owner } });

    expect(await db.save.count({ where: { id: saveId } })).toBe(0);
    expect(await db.playerSave.count({ where: { saveId } })).toBe(0);
  }, 120_000);
});
