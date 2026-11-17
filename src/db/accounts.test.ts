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

  /** What the sign-in's own request says of the player's arrival: a new account's, unless it takes in an anonymous one. */
  const REQUEST_ACQUISITION = { source: "direct", referrerDomain: null, landingPage: "/", locale: "en", device: "COMPUTER" } as const;
  /** How the anonymous player arrived, two days before (real time, not simulation code), and the days they came. */
  const anonymousCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const ANONYMOUS_ARRIVAL = {
    source: "reddit-playmygame",
    referrerDomain: "reddit.com",
    landingPage: "/fr",
    locale: "fr",
    device: "PHONE",
  } as const;
  /**
   * The anonymous player's first steps: a career the day they arrived, a first match an hour later, a first live one two
   * hours later, no season's end.
   */
  const ANONYMOUS_STEPS = {
    firstSaveAt: anonymousCreatedAt,
    firstMatchAt: new Date(anonymousCreatedAt.getTime() + 60 * 60 * 1000),
    firstLiveMatchAt: new Date(anonymousCreatedAt.getTime() + 2 * 60 * 60 * 1000),
    firstSeasonEndAt: null,
  };
  const dayOf = (time: Date) => time.toISOString().slice(0, 10);
  const daysOf = async (userId: string) =>
    (await loaded().db.userDay.findMany({ where: { userId }, select: { day: true } })).map(({ day }) => dayOf(day)).sort();

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
          acquisition: REQUEST_ACQUISITION,
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
    await prisma.user.create({
      // Not simulation code: lastSeenAt is real time.
      data: {
        id: anonymousId,
        kind: "ANONYMOUS",
        createdAt: anonymousCreatedAt,
        lastSeenAt: new Date(),
        ...ANONYMOUS_ARRIVAL,
        ...ANONYMOUS_STEPS,
      },
    });
    await prisma.userDay.create({ data: { userId: anonymousId, day: new Date(`${dayOf(anonymousCreatedAt)}T00:00:00.000Z`) } });
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
    // The same player: arrived as the anonymous one did, then, with their days of visit and today's sign-in.
    expect(account).toMatchObject({ ...ANONYMOUS_ARRIVAL, ...ANONYMOUS_STEPS, createdAt: anonymousCreatedAt });
    expect(await daysOf(result.userId)).toEqual([...new Set([dayOf(anonymousCreatedAt), dayOf(new Date())])].sort());
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
            acquisition: REQUEST_ACQUISITION,
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
    await db.user.create({
      // Not simulation code: lastSeenAt is real time.
      data: {
        id: otherAnonymous,
        kind: "ANONYMOUS",
        createdAt: anonymousCreatedAt,
        lastSeenAt: new Date(),
        ...ANONYMOUS_ARRIVAL,
        ...ANONYMOUS_STEPS,
      },
    });
    await db.userDay.create({ data: { userId: otherAnonymous, day: new Date(`${dayOf(anonymousCreatedAt)}T00:00:00.000Z`) } });
    const account = await signIn({ profile: otherProfile });
    createdUserIds.push(account.userId);
    const accountCreatedAt = (await db.user.findUniqueOrThrow({ where: { id: account.userId } })).createdAt;
    // The account's own first career, earlier than the anonymous player's: it stays. Its first live match, later: it goes.
    const accountFirstSave = new Date(anonymousCreatedAt.getTime() - 24 * 60 * 60 * 1000);
    const accountFirstLive = new Date(anonymousCreatedAt.getTime() + 24 * 60 * 60 * 1000);
    await db.user.update({ where: { id: account.userId }, data: { firstSaveAt: accountFirstSave, firstLiveMatchAt: accountFirstLive } });
    const challengeSave = async (ownerId: string, challengeId: string) => {
      const { id: saveId } = await db.save.create({ data: { ...bareSave("Défi", ownerId), challengeId }, select: { id: true } });
      await db.challengeEntry.create({ data: { challengeId, userId: ownerId, saveId } });
      return saveId;
    };
    const anonymousFirst = await challengeSave(otherAnonymous, first.id);
    const anonymousSecond = await challengeSave(otherAnonymous, second.id);
    const accountSecond = await challengeSave(account.userId, second.id);
    // Daily missions: the anonymous player's of the last two days, done; the account's of three days ago, done, and of
    // yesterday, not done. Real days, not simulation code.
    const missionDay = (days: number) => new Date(`${dayOf(new Date(Date.now() - days * 24 * 60 * 60 * 1000))}T00:00:00.000Z`);
    const done = (userId: string, days: number, streak: number) => ({
      userId,
      day: missionDay(days),
      kind: "WIN" as const,
      target: 1,
      progress: 1,
      completedAt: missionDay(days),
      streak,
      best: streak,
    });
    await db.dailyMission.createMany({
      data: [
        done(otherAnonymous, 2, 1),
        done(otherAnonymous, 1, 2),
        done(account.userId, 3, 1),
        { userId: account.userId, day: missionDay(1), kind: "PLAY_LIVE", target: 1, progress: 0 },
      ],
    });

    const result = await signIn({ profile: otherProfile, anonymousUserId: otherAnonymous });

    expect(result).toMatchObject({ userId: account.userId, mergedSaves: 2, mergedChallengeEntries: 1, droppedChallengeEntries: 1 });
    const entries = await db.challengeEntry.findMany({ where: { userId: account.userId }, select: { challengeId: true, saveId: true } });
    expect(entries.map(({ challengeId, saveId }) => `${challengeId} ${saveId}`).sort()).toEqual(
      [`${first.id} ${anonymousFirst}`, `${second.id} ${accountSecond}`].sort(),
    );
    // The anonymous user's save of the second week follows them, without an entry: it no longer counts.
    expect(await db.save.findUniqueOrThrow({ where: { id: anonymousSecond }, select: { ownerId: true } })).toEqual({ ownerId: account.userId });
    expect(await db.challengeEntry.count({ where: { saveId: anonymousSecond } })).toBe(0);
    // An account that was there keeps its own arrival, and gets the anonymous player's days of visit.
    expect(await db.user.findUniqueOrThrow({ where: { id: account.userId } })).toMatchObject({
      ...REQUEST_ACQUISITION,
      createdAt: accountCreatedAt,
      // Of each first step, the earliest of both.
      firstSaveAt: accountFirstSave,
      firstMatchAt: ANONYMOUS_STEPS.firstMatchAt,
      firstLiveMatchAt: ANONYMOUS_STEPS.firstLiveMatchAt,
      firstSeasonEndAt: null,
    });
    expect(await daysOf(account.userId)).toEqual([...new Set([dayOf(anonymousCreatedAt), dayOf(new Date())])].sort());
    // The missions follow the player: yesterday's, done by the anonymous player, takes the place of the account's not
    // done, and the streak runs over both histories.
    const missions = await db.dailyMission.findMany({
      where: { userId: account.userId },
      orderBy: { day: "asc" },
      select: { day: true, kind: true, streak: true, best: true },
    });
    expect(missions).toEqual([
      { day: missionDay(3), kind: "WIN", streak: 1, best: 1 },
      { day: missionDay(2), kind: "WIN", streak: 2, best: 2 },
      { day: missionDay(1), kind: "WIN", streak: 3, best: 3 },
    ]);
  });
});
