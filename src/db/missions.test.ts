import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LivePause } from "../engine/live";
import type { HalfTimeChoice } from "../engine/match";
import { changedMissionKind, dailyMissionKind, missionTarget, type MatchFacts, type MissionKind, type MissionTier } from "../lib/missions";
import type { prisma as prismaClient } from "./client";

// The missions of the day, v2, against DATABASE_URL: a twin of the demo save (worldVersion 1) with a throwaway owner of
// its own, and a bare second career of that owner; each test sets the day's missions it needs (the draw is the player's,
// the day's), then plays or records moves. The day is the database's, today's UTC. Deleted at the end, the owner by the
// tests' teardown. Skipped without DATABASE_URL; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the missions of the day, in the database", () => {
  let db: typeof prismaClient | undefined;
  let missions: typeof import("./missions") | undefined;
  let support: typeof import("./test-support") | undefined;
  let matchday: typeof import("./matchday") | undefined;
  let live: typeof import("./live-match") | undefined;
  let liveState: typeof import("./live-state") | undefined;
  let saveId = "";
  let otherCareer = "";
  let ownerId = "";
  let today = "";
  let challengeId = "";
  // Real time, not simulation code: a unique week of a far year for the challenge.
  const WEEK = `2003-W${10 + (Date.now() % 40)}`;
  const PLAYING_MS = 120_000;

  const loaded = () => {
    if (db === undefined || missions === undefined || support === undefined || matchday === undefined || live === undefined || liveState === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, missions, support, matchday, live, liveState };
  };
  const dayOf = (day: string) => new Date(`${day}T00:00:00.000Z`);
  const daysBefore = (count: number) => new Date(dayOf(today).getTime() - count * 24 * 60 * 60 * 1000);
  const facts = (overrides: Partial<MatchFacts> = {}): MatchFacts => ({
    live: false,
    won: false,
    cleanSheet: false,
    goalsFor: 0,
    coached: false,
    starters: [],
    players: [],
    ...overrides,
  });

  /** The owner starts over: no mission, day, token or cosmetic, no shield; today's missions those given, at their progress. */
  const setTasks = async (tasks: Partial<Record<MissionTier, [MissionKind, number?]>>) => {
    const { db } = loaded();
    await db.missionTask.deleteMany({ where: { userId: ownerId } });
    await db.missionDay.deleteMany({ where: { userId: ownerId } });
    await db.tokenEntry.deleteMany({ where: { userId: ownerId } });
    await db.playerCosmetic.deleteMany({ where: { userId: ownerId } });
    await db.dailyMission.deleteMany({ where: { userId: ownerId } });
    await db.user.update({ where: { id: ownerId }, data: { tokens: 0, streakShield: false, liveMatches: 0, liveWins: 0 } });
    for (const [tier, [kind, progress = 0]] of Object.entries(tasks) as [MissionTier, [MissionKind, number?]][]) {
      await db.missionTask.create({ data: { userId: ownerId, day: dayOf(today), tier, kind, target: missionTarget(kind), progress } });
    }
  };
  const task = async (tier: MissionTier) =>
    loaded().db.missionTask.findUniqueOrThrow({ where: { userId_day_tier: { userId: ownerId, day: dayOf(today), tier } } });
  const day = async () => loaded().db.missionDay.findUnique({ where: { userId_day: { userId: ownerId, day: dayOf(today) } } });
  const tokens = async () => (await loaded().db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { tokens: true } })).tokens;
  const owned = async () =>
    (await loaded().db.playerCosmetic.findMany({ where: { userId: ownerId }, select: { cosmetic: true } })).map(({ cosmetic }) => cosmetic).sort();
  const journalSum = async () =>
    (await loaded().db.tokenEntry.aggregate({ where: { userId: ownerId }, _sum: { amount: true } }))._sum.amount ?? 0;
  /** A counted day of the past: its streak, its record and its cycles. */
  const countedDay = async (daysAgo: number, streak: number, best = streak, cycles = 0) =>
    loaded().db.missionDay.create({
      data: { userId: ownerId, day: daysBefore(daysAgo), done: 1, countedAt: daysBefore(daysAgo), streak, best, cycles },
    });
  /** The live match waiting, and its state there. */
  const waiting = async () => {
    const { db, liveState } = loaded();
    const { liveFixtureId } = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true } });
    const fixture = await db.fixture.findFirstOrThrow({ where: { id: liveFixtureId ?? "", saveId }, select: { id: true, liveState: true } });
    return liveState.parseLiveState(fixture.id, fixture.liveState);
  };

  beforeAll(async () => {
    const [{ prisma }, missionsModule, supportModule, matchdayModule, liveModule, liveStateModule] = await Promise.all([
      import("./client"),
      import("./missions"),
      import("./test-support"),
      import("./matchday"),
      import("./live-match"),
      import("./live-state"),
    ]);
    db = prisma;
    missions = missionsModule;
    support = supportModule;
    matchday = matchdayModule;
    live = liveModule;
    liveState = liveStateModule;
    saveId = await supportModule.createDemoTwin("Missions du jour");
    ownerId = (await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { ownerId: true } })).ownerId ?? "";
    // The same player's other career: a bare save, enough for a move made in it.
    ({ id: otherCareer } = await prisma.save.create({
      data: { name: "Missions, autre carrière", managerName: "Test", seed: "test-missions", worldVersion: 1, currentDate: new Date("2026-07-01T00:00:00.000Z"), ownerId },
      select: { id: true },
    }));
    [{ day: today }] = await prisma.$queryRaw<{ day: string }[]>`SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day`;
    const club = await prisma.club.findFirstOrThrow({ select: { id: true } });
    ({ id: challengeId } = await prisma.challenge.create({
      data: { weekKey: WEEK, seed: WEEK, clubId: club.id, horizonMatchdays: 10, startsAt: new Date("2003-05-05T00:00:00.000Z"), endsAt: new Date("2003-05-12T00:00:00.000Z") },
      select: { id: true },
    }));
  }, PLAYING_MS);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: { in: [saveId, otherCareer] } } });
    await db?.challenge.deleteMany({ where: { weekKey: WEEK } });
    await db?.$disconnect();
  }, PLAYING_MS);

  it("proposes the day's three missions the first time they are shown, the same in each career, and welcomes a v1 player once", async () => {
    const { db, missions } = loaded();
    await setTasks({});
    for (const ago of [1, 2, 4]) {
      await db.dailyMission.create({
        data: { userId: ownerId, day: daysBefore(ago), kind: "WIN", target: 1, progress: 1, completedAt: daysBefore(ago), streak: 1, best: 2 },
      });
    }
    const now = dayOf(today);

    const shown = await missions.getDailyMissions(saveId, now);

    expect(shown?.tasks.map(({ tier, kind, progress, completed }) => ({ tier, kind, progress, completed }))).toEqual(
      (["EASY", "MEDIUM", "HARD"] as const).map((tier) => ({ tier, kind: dailyMissionKind(ownerId, today, tier), progress: 0, completed: false })),
    );
    expect(shown).toMatchObject({ day: today, done: 0, balance: 30, welcome: 30, earnedToday: 30, changeUsed: false });
    expect(await db.missionTask.count({ where: { userId: ownerId } })).toBe(3);
    // The other career shows the same missions, and never welcomes again.
    const again = await missions.getDailyMissions(otherCareer, now);
    expect(again?.tasks).toEqual(shown?.tasks);
    expect(again).toMatchObject({ balance: 30, welcome: 0 });
    expect(await db.tokenEntry.findMany({ where: { userId: ownerId }, select: { key: true, amount: true } })).toEqual([{ key: "welcome-v1", amount: 30 }]);
  });

  it("takes the missions on at each move, in any career, credits each once, with the three's bonus and the achievements", async () => {
    const { db, missions } = loaded();
    await setTasks({ EASY: ["PLAY_MATCH"], MEDIUM: ["WIN"], HARD: ["LIVE_WIN"] });
    const date = dayOf(today);
    // A simulated win in the other career: the easy and the medium ones, not the live one.
    await missions.recordMissionMoves(db, otherCareer, { match: { facts: facts({ won: true, goalsFor: 2 }), date } });
    expect(await task("EASY")).toMatchObject({ progress: 1 });
    expect((await task("MEDIUM")).completedAt).toBeInstanceOf(Date);
    expect((await task("HARD")).completedAt).toBeNull();
    expect(await tokens()).toBe(30);
    expect(await day()).toMatchObject({ done: 2, streak: 1, best: 1, cycles: 0, allDoneAt: null });

    // A live win in this one: the hard one, the three's bonus, the live achievements.
    await missions.recordMissionMoves(db, saveId, { match: { facts: facts({ live: true, won: true, goalsFor: 1, coached: true }), date } });
    expect(await tokens()).toBe(100);
    expect((await day())?.allDoneAt).toBeInstanceOf(Date);
    expect(await owned()).toEqual(["badge-first-mission", "badge-live", "badge-perfect-day"]);
    expect(await db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { liveMatches: true, liveWins: true } })).toEqual({ liveMatches: 1, liveWins: 1 });

    // The same moves again: nothing more is credited.
    await missions.recordMissionMoves(db, saveId, { match: { facts: facts({ live: true, won: true, goalsFor: 1 }), date } });
    expect(await tokens()).toBe(100);
    expect(await journalSum()).toBe(100);
    expect(
      (await db.tokenEntry.findMany({ where: { userId: ownerId }, select: { key: true } })).map(({ key }) => key).sort(),
    ).toEqual([`all-three:${today}`, `mission:${today}:EASY`, `mission:${today}:HARD`, `mission:${today}:MEDIUM`]);
  });

  it("counts a match played to its end, simulated, from the matchday's own facts", async () => {
    const { matchday } = loaded();
    await setTasks({ EASY: ["PLAY_MATCHES"], MEDIUM: ["LIVE_INSTRUCTION"], HARD: ["LIVE_WIN"] });
    expect((await matchday.playNextMatchday(saveId))?.managed?.live).toBe(false);
    expect(await task("EASY")).toMatchObject({ progress: 1, completedAt: null });
    expect(await task("MEDIUM")).toMatchObject({ progress: 0 });
    expect(await day()).toBeNull();
  }, PLAYING_MS);

  it("counts the player's substitution and instruction at a pause of a live match, then the live match at its end", async () => {
    const { matchday, live, support, db } = loaded();
    await setTasks({ EASY: ["PLAY_MATCH"], MEDIUM: ["LIVE_SUBSTITUTION"], HARD: ["LIVE_WIN_COACHED"] });
    expect((await matchday.playNextMatchday(saveId, { pauseManagedMatch: true }))?.managed?.live).toBe(true);
    const pause = await support.playLiveMatch(saveId, "break");
    if (pause === null || pause.phase !== "HALF_TIME") {
      throw new Error("No half-time to coach at");
    }
    const { managedSide, state } = await waiting();
    const team = state[managedSide];
    const leaving = team.pitch.find((entry) => entry.status === "ON" && entry.slot !== "GK");
    const substitute = team.bench.find((player) => player.position !== "GK");
    if (leaving === undefined || substitute === undefined) {
      throw new Error("No substitution to make");
    }
    const changes: HalfTimeChoice = {
      formation: team.formation,
      starters: team.pitch
        .filter((entry) => entry.status === "ON")
        .map((entry) => ({ slot: entry.index, playerKey: entry === leaving ? substitute.id : entry.player.id })),
      substitutions: [{ in: substitute.id, out: leaving.player.id }],
    };
    const next = await live.advanceLiveMatch(saveId, pause, { changes, instruction: "ATTACK" }, "segment");
    expect((await task("MEDIUM")).completedAt).toBeInstanceOf(Date);
    expect(await task("EASY")).toMatchObject({ progress: 0 });

    // Steps without a move of the player's: nothing until the match is over, then the match, live, coached.
    for (let at: LivePause | null = next.pause; at !== null; ) {
      const step = await live.advanceLiveMatch(saveId, at, {}, "segment");
      expect((await task("EASY")).progress).toBe(step.result === null ? 0 : 1);
      at = step.pause;
    }
    const { liveMatches } = await db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { liveMatches: true } });
    expect(liveMatches).toBe(1);
    const coachedWin = (await task("HARD")).completedAt !== null;
    const won = (await db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { liveWins: true } })).liveWins === 1;
    // The coached win is done exactly when the match was won: the substitution was the player's.
    expect(coachedWin).toBe(won);
  }, PLAYING_MS);

  it("adds a day to the streak, pays its third and seventh days, unlocks the cycle's lot, and carries a v1 streak on", async () => {
    const { db, missions } = loaded();
    const date = dayOf(today);
    const play = () => missions.recordMissionMoves(db, otherCareer, { match: { facts: facts(), date } });

    await setTasks({ EASY: ["PLAY_MATCH"] });
    await countedDay(1, 2, 4);
    await play();
    expect(await day()).toMatchObject({ streak: 3, best: 4, cycles: 0 });
    expect(await tokens()).toBe(10 + 50);

    await setTasks({ EASY: ["PLAY_MATCH"] });
    await countedDay(1, 6, 6, 0);
    await play();
    expect(await day()).toMatchObject({ streak: 7, best: 7, cycles: 1 });
    expect(await tokens()).toBe(10 + 150);
    expect(await owned()).toEqual(["badge-first-mission", "badge-one-week", "frame-bronze"]);
    expect((await missions.getDailyMissions(saveId, date))?.nextLot).toEqual({ cycle: 2, cosmetics: ["title-regular"] });

    // The first v2 day of a v1 player: yesterday's v1 mission carries the streak on.
    await setTasks({ EASY: ["PLAY_MATCH"] });
    await db.dailyMission.create({
      data: { userId: ownerId, day: daysBefore(1), kind: "WIN", target: 1, progress: 1, completedAt: daysBefore(1), streak: 5, best: 5 },
    });
    await play();
    expect(await day()).toMatchObject({ streak: 6, best: 6 });
  });

  it("starts the streak again after a missed day, unless a shield in reserve forgives it, once", async () => {
    const { db, missions } = loaded();
    const date = dayOf(today);
    const play = () => missions.recordMissionMoves(db, otherCareer, { match: { facts: facts(), date } });

    await setTasks({ EASY: ["PLAY_MATCH"] });
    await countedDay(3, 5);
    expect(await missions.getMissionStreak(saveId, date)).toMatchObject({ current: 0, best: 5, last: 5, shield: false });
    await play();
    expect(await day()).toMatchObject({ streak: 1, best: 5 });

    await setTasks({ EASY: ["PLAY_MATCH"] });
    await countedDay(2, 4);
    await db.user.update({ where: { id: ownerId }, data: { streakShield: true } });
    expect(await missions.getMissionStreak(saveId, date)).toMatchObject({ current: 4, shielded: true, shield: true });
    await play();
    expect(await day()).toMatchObject({ streak: 5 });
    expect((await db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { streakShield: true } })).streakShield).toBe(false);
    const forgiven = await db.missionDay.findUniqueOrThrow({ where: { userId_day: { userId: ownerId, day: daysBefore(1) } } });
    expect(forgiven).toMatchObject({ streak: 4, countedAt: null });
    expect(forgiven.shieldedAt).toBeInstanceOf(Date);

    // Two days missed: the shield stays in reserve, the streak starts again.
    await setTasks({ EASY: ["PLAY_MATCH"] });
    await countedDay(3, 4);
    await db.user.update({ where: { id: ownerId }, data: { streakShield: true } });
    await play();
    expect(await day()).toMatchObject({ streak: 1 });
    expect((await db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { streakShield: true } })).streakShield).toBe(true);
  });

  it("changes a mission not started once a day, to the change's draw, and never one started", async () => {
    const { missions } = loaded();
    const date = dayOf(today);
    const medium = dailyMissionKind(ownerId, today, "MEDIUM");
    await setTasks({ EASY: ["PLAY_MATCH", 1], MEDIUM: [medium], HARD: ["LIVE_WIN"] });

    expect(await missions.changeMission(saveId, "EASY", date)).toEqual({ ok: false, reason: "started" });
    const changed = await missions.changeMission(saveId, "MEDIUM", date);
    const kind = changedMissionKind(ownerId, today, "MEDIUM", medium);
    expect(changed).toEqual({ ok: true, kind });
    expect(await task("MEDIUM")).toMatchObject({ kind, changedFrom: medium, progress: 0 });
    expect(await missions.changeMission(otherCareer, "HARD", date)).toEqual({ ok: false, reason: "used" });
    expect((await missions.getDailyMissions(saveId, date))?.changeUsed).toBe(true);
  });

  it("plays a youngster: a player of 21 or younger at the match's date who played, never an older one", async () => {
    const { db, matchday } = loaded();
    const { currentDate } = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
    const managed = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    const yearsBefore = (years: number) => new Date(Date.UTC(currentDate.getUTCFullYear() - years, currentDate.getUTCMonth(), currentDate.getUTCDate()));
    await setTasks({ EASY: ["START_YOUTH"] });
    await db.playerSave.updateMany({ where: { saveId, clubSaveId: managed.id }, data: { birthDate: yearsBefore(30) } });
    await matchday.playNextMatchday(saveId);
    expect(await task("EASY")).toMatchObject({ progress: 0, completedAt: null });

    await db.playerSave.updateMany({ where: { saveId, clubSaveId: managed.id }, data: { birthDate: yearsBefore(19) } });
    await matchday.playNextMatchday(saveId);
    expect(await task("EASY")).toMatchObject({ progress: 1 });
  }, PLAYING_MS);

  it("gives a challenge save no mission, and counts none of its moves", async () => {
    const { db, missions, matchday } = loaded();
    await setTasks({ EASY: ["PLAY_MATCHES"] });
    await db.save.update({ where: { id: saveId }, data: { challengeId } });
    try {
      expect(await missions.getDailyMissions(saveId, dayOf(today))).toBeNull();
      expect(await missions.getMissionStreak(saveId, dayOf(today))).toBeNull();
      expect(await missions.changeMission(saveId, "EASY", dayOf(today))).toEqual({ ok: false, reason: "challenge" });
      await matchday.playNextMatchday(saveId);
      expect((await task("EASY")).progress).toBe(0);
    } finally {
      await db.save.update({ where: { id: saveId }, data: { challengeId: null } });
    }
  }, PLAYING_MS);
});
