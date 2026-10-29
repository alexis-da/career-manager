import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// A challenge save, against DATABASE_URL: one real save of a week of a far year, the challenge and what it holds deleted
// at the end (deleteTestChallenges), with the ordinary save the test creates; throwaway owners, deleted once saveless.
// The refusals cost one query each. Skipped without DATABASE_URL; modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a challenge save, in the database", () => {
  let db: typeof prismaClient | undefined;
  let saves: typeof import("./saves") | undefined;
  let challenges: typeof import("./challenge") | undefined;
  let support: typeof import("./test-support") | undefined;
  let limits: typeof import("../lib/limits") | undefined;
  // Real time, not simulation code: a year of its own keeps parallel runs, and the real weeks, apart.
  const weekKey = `${2100 + (Date.now() % 800)}-W20`;
  const SECRET = "test-challenge-secret-0123456789abcdef";
  let challengeId = "";
  let player = "";
  let latecomer = "";
  let challengeSaveId = "";

  const loaded = () => {
    if (db === undefined || saves === undefined || challenges === undefined || support === undefined || limits === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, saves, challenges, support, limits };
  };

  beforeAll(async () => {
    const [{ prisma }, savesModule, challengeModule, supportModule, limitsModule] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./challenge"),
      import("./test-support"),
      import("../lib/limits"),
    ]);
    db = prisma;
    saves = savesModule;
    challenges = challengeModule;
    support = supportModule;
    limits = limitsModule;
    ({ id: challengeId } = await challengeModule.ensureChallenge(weekKey, SECRET));
    [player, latecomer] = await Promise.all([supportModule.createTestOwner(), supportModule.createTestOwner()]);
  });

  afterAll(async () => {
    await support?.deleteTestChallenges([weekKey]);
    await db?.save.deleteMany({ where: { ownerId: { in: [player, latecomer] } } });
    await db?.$disconnect();
  }, 60_000);

  it("is the challenge's world for every player: world 2 with its cups, its seed, its club and its name, and an entry without a score", async () => {
    const { db, saves } = loaded();

    ({ id: challengeSaveId } = await saves.createChallengeSave({ challengeId, managerName: "Test", ownerId: player }));

    const challenge = await db.challenge.findUniqueOrThrow({ where: { id: challengeId }, select: { seed: true, clubId: true } });
    const save = await db.save.findUniqueOrThrow({
      where: { id: challengeSaveId },
      select: { name: true, seed: true, worldVersion: true, challengeId: true, clubSaves: { where: { isManaged: true }, select: { clubId: true } } },
    });
    expect(save).toEqual({
      name: "",
      seed: challenge.seed,
      worldVersion: 2,
      challengeId,
      clubSaves: [{ clubId: challenge.clubId }],
    });
    expect(await db.season.count({ where: { saveId: challengeSaveId, competition: { kind: "CUP" } } })).toBe(5);
    expect(await db.challengeEntry.findUnique({ where: { saveId: challengeSaveId } })).toMatchObject({
      challengeId,
      userId: player,
      matchdaysPlayed: 0,
      points: null,
      goalDiff: null,
      goalsFor: null,
      submittedAt: null,
    });
  }, 60_000);

  it("leaves the save limits alone: its player still creates the ordinary save an anonymous user may have, and no more", async () => {
    const { db, saves, limits } = loaded();
    const { id: clubId } = await db.club.findUniqueOrThrow({ where: { slug: "olympique-lyonnais" }, select: { id: true } });
    const ordinary = { name: "Test défi, partie normale", managerName: "Test", clubId, seed: `test-${weekKey}`, ownerId: player, worldVersion: 1 as const };

    expect(await saves.countOwnedSaves(player)).toBe(0);
    await saves.createSave(ordinary);

    expect(await saves.countOwnedSaves(player)).toBe(1);
    await expect(saves.createSave(ordinary)).rejects.toBeInstanceOf(limits.SaveLimitError);
  }, 60_000);

  it("is one a player a week", async () => {
    const { db, saves, limits } = loaded();

    await expect(saves.createChallengeSave({ challengeId, managerName: "Test", ownerId: player })).rejects.toBeInstanceOf(
      limits.ChallengeEntryExistsError,
    );
    expect(await db.save.count({ where: { challengeId } })).toBe(1);
  });

  it("is refused beyond the week's cap", async () => {
    const { db, saves, limits } = loaded();

    await expect(
      saves.createChallengeSave({ challengeId, managerName: "Test", ownerId: latecomer }, { maxSaves: 1 }),
    ).rejects.toBeInstanceOf(limits.ChallengeFullError);
    expect(await db.challengeEntry.count({ where: { userId: latecomer } })).toBe(0);
  });

  it("leaves its entry when deleted, so that its player cannot start the week again", async () => {
    const { db, saves, limits } = loaded();

    await saves.deleteSave(challengeSaveId);

    expect(await db.challengeEntry.findUnique({ where: { challengeId_userId: { challengeId, userId: player } } })).toMatchObject({
      saveId: null,
      submittedAt: null,
    });
    await expect(saves.createChallengeSave({ challengeId, managerName: "Test", ownerId: player })).rejects.toBeInstanceOf(
      limits.ChallengeEntryExistsError,
    );
  }, 60_000);
});
