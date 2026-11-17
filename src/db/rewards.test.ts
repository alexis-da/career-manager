import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The rewards at a Google sign-in, against DATABASE_URL: an anonymous player's missions, tokens and collection go to the
// account, nothing lost, nothing credited twice, the streaks made again day after day. Two throwaway users, deleted at
// the end. Skipped without DATABASE_URL; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the rewards at a Google sign-in, in the database", () => {
  let db: typeof prismaClient | undefined;
  let missions: typeof import("./missions") | undefined;
  let rewards: typeof import("./rewards") | undefined;
  let anonymous = "";
  let account = "";
  let today = "";
  const MS = 60_000;

  const loaded = () => {
    if (db === undefined || missions === undefined || rewards === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, missions, rewards };
  };
  const dayOf = (day: string) => new Date(`${day}T00:00:00.000Z`);
  const daysBefore = (count: number) => new Date(dayOf(today).getTime() - count * 24 * 60 * 60 * 1000);
  const isoDay = (date: Date) => date.toISOString().slice(0, 10);

  beforeAll(async () => {
    const [{ prisma }, missionsModule, rewardsModule, support] = await Promise.all([
      import("./client"),
      import("./missions"),
      import("./rewards"),
      import("./test-support"),
    ]);
    db = prisma;
    missions = missionsModule;
    rewards = rewardsModule;
    [anonymous, account] = [await support.createTestOwner(), await support.createTestOwner()];
    [{ day: today }] = await prisma.$queryRaw<{ day: string }[]>`SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day`;
  }, MS);

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: [anonymous, account] } } });
    await db?.$disconnect();
  }, MS);

  it("gives the account the anonymous player's days, tokens, collection and shield, and makes the streak again", async () => {
    const { db, missions, rewards } = loaded();
    const yesterday = isoDay(daysBefore(1));
    // The anonymous player's yesterday: a mission done, its tokens, a cosmetic, a shield, a live match.
    await db.$transaction(async (tx) => {
      await tx.missionTask.create({
        data: { userId: anonymous, day: daysBefore(1), tier: "EASY", kind: "PLAY_MATCH", target: 1, progress: 1, completedAt: daysBefore(1) },
      });
      await tx.missionDay.create({ data: { userId: anonymous, day: daysBefore(1), done: 1, countedAt: daysBefore(1), streak: 1, best: 1, cycles: 0 } });
      await rewards.writeTokens(tx, { userId: anonymous, key: `mission:${yesterday}:EASY`, reason: "MISSION", amount: 10, day: yesterday });
      await rewards.unlockCosmetics(tx, anonymous, ["frame-bronze"], "STREAK");
      await tx.user.update({ where: { id: anonymous }, data: { streakShield: true, liveMatches: 2, liveWins: 1 } });
    });
    // The account's today: a mission done, its tokens, a title worn.
    await db.$transaction(async (tx) => {
      await tx.missionTask.create({
        data: { userId: account, day: dayOf(today), tier: "EASY", kind: "SCORE", target: 1, progress: 1, completedAt: dayOf(today) },
      });
      await tx.missionDay.create({ data: { userId: account, day: dayOf(today), done: 1, countedAt: dayOf(today), streak: 1, best: 1, cycles: 0 } });
      await rewards.writeTokens(tx, { userId: account, key: `mission:${today}:EASY`, reason: "MISSION", amount: 10, day: today });
      await rewards.unlockCosmetics(tx, account, ["title-professor"], "SHOP");
      await tx.user.update({ where: { id: account }, data: { title: "title-professor", liveMatches: 1 } });
    });

    await db.$transaction(async (tx) => {
      await missions.moveMissions(tx, anonymous, account);
      await missions.moveMissionDays(tx, anonymous, account);
      await rewards.moveRewards(tx, anonymous, account);
    });

    const user = await db.user.findUniqueOrThrow({
      where: { id: account },
      select: { tokens: true, streakShield: true, title: true, frame: true, liveMatches: true, liveWins: true },
    });
    expect(user).toEqual({ tokens: 20, streakShield: true, title: "title-professor", frame: null, liveMatches: 3, liveWins: 1 });
    expect((await db.user.findUniqueOrThrow({ where: { id: anonymous }, select: { tokens: true } })).tokens).toBe(0);
    expect((await db.tokenEntry.findMany({ where: { userId: account }, select: { key: true } })).map(({ key }) => key).sort()).toEqual([
      `merge:${anonymous}:mission:${yesterday}:EASY`,
      `mission:${today}:EASY`,
    ]);
    expect((await db.playerCosmetic.findMany({ where: { userId: account }, select: { cosmetic: true } })).map(({ cosmetic }) => cosmetic).sort()).toEqual([
      "frame-bronze",
      "title-professor",
    ]);
    // Yesterday's day of the anonymous player and today's of the account: two days in a row now.
    expect(await db.missionDay.findUniqueOrThrow({ where: { userId_day: { userId: account, day: dayOf(today) } } })).toMatchObject({
      streak: 2,
      best: 2,
    });
    expect(await db.missionTask.count({ where: { userId: account } })).toBe(2);
  }, MS);

  it("welcomes the account for its own v1 missions only, the anonymous player's welcome come with them", async () => {
    const { db, missions, rewards } = loaded();
    const [{ id: welcomed }, { id: other }] = [
      await db.user.create({ data: { id: `${anonymous}-w`, kind: "ANONYMOUS", lastSeenAt: new Date() }, select: { id: true } }),
      await db.user.create({ data: { id: `${account}-w`, kind: "ANONYMOUS", lastSeenAt: new Date() }, select: { id: true } }),
    ];
    try {
      // Three v1 missions of the anonymous player, welcomed (30); two of the account's own, not yet.
      const v1 = (userId: string, ago: number) => ({
        userId,
        day: daysBefore(ago),
        kind: "WIN" as const,
        target: 1,
        progress: 1,
        completedAt: daysBefore(ago),
        streak: 1,
        best: 1,
      });
      await db.dailyMission.createMany({ data: [v1(welcomed, 3), v1(welcomed, 5), v1(welcomed, 7), v1(other, 4), v1(other, 9)] });
      await db.$transaction(async (tx) => rewards.writeTokens(tx, { userId: welcomed, key: "welcome-v1", reason: "WELCOME", amount: 30 }));

      await db.$transaction(async (tx) => {
        await missions.moveMissions(tx, welcomed, other);
        await missions.moveMissionDays(tx, welcomed, other);
        await rewards.moveRewards(tx, welcomed, other);
      });
      const { id: saveId } = await db.save.create({
        data: { name: "Bienvenue", managerName: "Test", seed: "test-welcome", worldVersion: 1, currentDate: new Date("2026-07-01T00:00:00.000Z"), ownerId: other },
        select: { id: true },
      });

      // Five v1 missions in all: 50, less the 30 already welcomed.
      expect(await missions.getDailyMissions(saveId, dayOf(today))).toMatchObject({ welcome: 20, balance: 50 });
      expect(await missions.getDailyMissions(saveId, dayOf(today))).toMatchObject({ welcome: 0, balance: 50 });
    } finally {
      await db.user.deleteMany({ where: { id: { in: [welcomed, other] } } });
    }
  }, MS);
});
