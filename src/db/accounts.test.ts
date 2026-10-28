import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GoogleSignIn } from "../auth/google";
import type { prisma as prismaClient } from "./client";

// Signing in with Google against DATABASE_URL: bare saves (no club, no player: only their owner matters here) of
// throwaway users, deleted with them afterwards. The administrator's sign-in runs in a transaction rolled back at
// the end, so the database's real inherited saves stay as they are. Skipped without DATABASE_URL; modules are
// imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("signing in with Google, in the database", () => {
  let db: typeof prismaClient | undefined;
  let google: typeof import("../auth/google") | undefined;
  let accounts: typeof import("./accounts") | undefined;
  let access: typeof import("./access") | undefined;
  // Real time, not simulation code: a unique suffix keeps parallel runs apart.
  const run = `${Date.now()}`;
  const anonymousId = `test-google-anon-${run}`;
  const profile = { sub: `test-google-sub-${run}`, email: `test-google-${run}@example.com`, name: "Test Google", image: null };
  const createdUserIds: string[] = [anonymousId];
  const challengeWeeks = [`${2100 + (Number(run) % 800)}-W40`, `${2100 + (Number(run) % 800)}-W41`];

  /** Thrown to roll a transaction back once its checks are done. */
  class Rollback extends Error {}

  const loaded = () => {
    if (db === undefined || google === undefined || accounts === undefined || access === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, google, accounts, access };
  };

  const bareSave = (name: string, ownerId: string | null) => ({
    name,
    managerName: "Test",
    seed: `test-google-${run}`,
    worldVersion: 1,
    currentDate: new Date("2026-07-01T00:00:00.000Z"),
    ownerId,
  });

  /** One sign-in, in its own transaction, as src/auth/auth.ts runs it. */
  const signIn = (input: Partial<GoogleSignIn>) => {
    const { db, google, accounts } = loaded();
    return db.$transaction(
      (tx) =>
        google.signInWithGoogle(accounts.prismaAccountStore(tx), {
          profile,
          anonymousUserId: null,
          adminEmail: null,
          // Not simulation code: lastSeenAt is real time.
          now: new Date(),
          ...input,
        }),
      { timeout: 20_000 },
    );
  };

  beforeAll(async () => {
    const [{ prisma }, googleModule, accountsModule, accessModule] = await Promise.all([
      import("./client"),
      import("../auth/google"),
      import("./accounts"),
      import("./access"),
    ]);
    db = prisma;
    google = googleModule;
    accounts = accountsModule;
    access = accessModule;
    // Not simulation code: lastSeenAt is real time.
    await prisma.user.create({ data: { id: anonymousId, kind: "ANONYMOUS", lastSeenAt: new Date() } });
    await prisma.save.createMany({ data: [bareSave("Anonyme 1", anonymousId), bareSave("Anonyme 2", anonymousId)] });
  }, 60_000);

  // Deleting the users cascades to their saves; the test challenges go after their saves and entries.
  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: createdUserIds } } });
    const { deleteTestChallenges } = await import("./test-support");
    await deleteTestChallenges(challengeWeeks);
    await db?.$disconnect();
  }, 60_000);

  it("gives the anonymous user's two saves to the new account, deletes that user, and the account opens both", async () => {
    const { db, access } = loaded();

    const result = await signIn({ anonymousUserId: anonymousId });
    createdUserIds.push(result.userId);

    expect(result).toMatchObject({ created: true, mergedSaves: 2, deletedAnonymousUserId: anonymousId, claimedInheritedSaves: 0 });
    expect(await db.user.count({ where: { id: anonymousId } })).toBe(0);
    const account = await db.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(account).toMatchObject({ kind: "REGISTERED", googleSub: profile.sub, email: profile.email, name: "Test Google" });
    const saves = await db.save.findMany({ where: { ownerId: result.userId }, select: { id: true } });
    expect(saves).toHaveLength(2);
    for (const save of saves) {
      expect(await access.loadOwnedSave(save.id, { id: result.userId })).toEqual({ id: save.id, ownerId: result.userId });
    }
  });

  it("does nothing more on a second sign-in, but the name follows the account", async () => {
    const { db } = loaded();
    const first = await db.user.findUniqueOrThrow({ where: { googleSub: profile.sub }, select: { id: true } });

    const again = await signIn({ anonymousUserId: anonymousId, profile: { ...profile, name: "Test Google renamed" } });

    expect(again).toEqual({
      userId: first.id,
      created: false,
      mergedSaves: 0,
      mergedChallengeEntries: 0,
      droppedChallengeEntries: 0,
      deletedAnonymousUserId: null,
      claimedInheritedSaves: 0,
    });
    expect(await db.user.count({ where: { email: profile.email } })).toBe(1);
    expect(await db.save.count({ where: { ownerId: first.id } })).toBe(2);
    expect((await db.user.findUniqueOrThrow({ where: { id: first.id } })).name).toBe("Test Google renamed");
  });

  it("attaches the inherited saves to the administrator, once (rolled back)", async () => {
    const { db, google, accounts } = loaded();
    const adminProfile = { ...profile, sub: `${profile.sub}-admin`, email: `TEST-GOOGLE-ADMIN-${run}@example.com` };
    const inheritedBefore = await db.save.count({ where: { ownerId: null } });

    await expect(
      db.$transaction(
        async (tx) => {
          const inherited = await tx.save.create({ data: bareSave("Héritée", null), select: { id: true } });
          const input: GoogleSignIn = {
            profile: adminProfile,
            anonymousUserId: null,
            adminEmail: google.readAdminEmail(adminProfile.email.toLowerCase()),
            // Not simulation code: lastSeenAt is real time.
            now: new Date(),
          };

          const first = await google.signInWithGoogle(accounts.prismaAccountStore(tx), input);
          expect(first.claimedInheritedSaves).toBe(inheritedBefore + 1);
          expect(await tx.save.count({ where: { ownerId: null } })).toBe(0);
          expect((await tx.save.findUniqueOrThrow({ where: { id: inherited.id } })).ownerId).toBe(first.userId);

          const second = await google.signInWithGoogle(accounts.prismaAccountStore(tx), input);
          expect(second).toMatchObject({ userId: first.userId, created: false, claimedInheritedSaves: 0 });
          throw new Rollback();
        },
        { timeout: 20_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);

    expect(await db.save.count({ where: { ownerId: null } })).toBe(inheritedBefore);
    expect(await db.user.count({ where: { googleSub: adminProfile.sub } })).toBe(0);
  });

  it("gives the anonymous user's challenge entries with their saves, the account keeping its own entry of a week", async () => {
    const { db } = loaded();
    const { ensureChallenge } = await import("./challenge");
    // Weeks of a far year of their own, deleted at the end with their saves and entries.
    const SECRET = "test-challenge-secret-0123456789abcdef";
    const [first, second] = await Promise.all(challengeWeeks.map((weekKey) => ensureChallenge(weekKey, SECRET)));
    const otherAnonymous = `${anonymousId}-challenge`;
    const otherProfile = { ...profile, sub: `${profile.sub}-challenge`, email: `test-google-challenge-${run}@example.com` };
    createdUserIds.push(otherAnonymous);
    // Not simulation code: lastSeenAt is real time.
    await db.user.create({ data: { id: otherAnonymous, kind: "ANONYMOUS", lastSeenAt: new Date() } });
    const account = await signIn({ profile: otherProfile });
    createdUserIds.push(account.userId);
    const challengeSave = async (ownerId: string, challengeId: string) => {
      const { id: saveId } = await db.save.create({ data: { ...bareSave("Défi", ownerId), challengeId }, select: { id: true } });
      await db.challengeEntry.create({ data: { challengeId, userId: ownerId, saveId } });
      return saveId;
    };
    const anonymousFirst = await challengeSave(otherAnonymous, first.id);
    const anonymousSecond = await challengeSave(otherAnonymous, second.id);
    const accountSecond = await challengeSave(account.userId, second.id);

    const result = await signIn({ profile: otherProfile, anonymousUserId: otherAnonymous });

    expect(result).toMatchObject({ userId: account.userId, mergedSaves: 2, mergedChallengeEntries: 1, droppedChallengeEntries: 1 });
    const entries = await db.challengeEntry.findMany({ where: { userId: account.userId }, select: { challengeId: true, saveId: true } });
    expect(entries.map(({ challengeId, saveId }) => `${challengeId} ${saveId}`).sort()).toEqual(
      [`${first.id} ${anonymousFirst}`, `${second.id} ${accountSecond}`].sort(),
    );
    // The anonymous user's save of the second week follows them, without an entry: it no longer counts.
    expect(await db.save.findUniqueOrThrow({ where: { id: anonymousSecond }, select: { ownerId: true } })).toEqual({ ownerId: account.userId });
    expect(await db.challengeEntry.count({ where: { saveId: anonymousSecond } })).toBe(0);
  });
});
