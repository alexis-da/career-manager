import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LivePause } from "../engine/live";
import type { HalfTimeChoice } from "../engine/match";
import { MISSION_TARGETS, dailyMissionKind, type MissionKind } from "../lib/missions";
import type { prisma as prismaClient } from "./client";

// The mission of the day, against DATABASE_URL: a twin of the demo save (worldVersion 1) with a throwaway owner of its
// own, and a bare second career of that owner; each test sets the day's mission it needs (the draw is the player's, the
// day's), then plays. The day is the database's, today's UTC. Deleted at the end, the owner by the tests' teardown.
// Skipped without DATABASE_URL; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the mission of the day, in the database", () => {
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
  /** The owner's missions start over: today's set to `kind`, with `progress`; none before unless a test writes it. */
  const setMission = async (kind: MissionKind, progress = 0) => {
    const { db } = loaded();
    await db.dailyMission.deleteMany({ where: { userId: ownerId } });
    await db.dailyMission.create({ data: { userId: ownerId, day: dayOf(today), kind, target: MISSION_TARGETS[kind], progress } });
  };
  const todays = async () => loaded().db.dailyMission.findUniqueOrThrow({ where: { userId_day: { userId: ownerId, day: dayOf(today) } } });
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
    await db?.dailyMission.deleteMany({ where: { userId: ownerId } });
    await db?.challenge.deleteMany({ where: { weekKey: WEEK } });
    await db?.$disconnect();
  }, PLAYING_MS);

  it("proposes the day's mission the first time it is shown: the player's draw, the same in each of their careers", async () => {
    const { db, missions } = loaded();
    await db.dailyMission.deleteMany({ where: { userId: ownerId } });
    const now = dayOf(today);

    const shown = await missions.getDailyMission(saveId, now);

    const kind = dailyMissionKind(ownerId, today);
    expect(shown).toEqual({ day: today, kind, target: MISSION_TARGETS[kind], progress: 0, completed: false, streak: { current: 0, best: 0, last: null } });
    expect(await todays()).toMatchObject({ kind, progress: 0, completedAt: null });
    expect(await missions.getDailyMission(otherCareer, now)).toEqual(shown);
    expect(await db.dailyMission.count({ where: { userId: ownerId } })).toBe(1);
  });

  it("takes the mission on at each move that brings it a step, in any career of the player's, and nothing else", async () => {
    const { db, missions, matchday } = loaded();
    await setMission("LIVE_INSTRUCTION");
    // A simulated match says nothing to a live mission: nothing written.
    expect((await matchday.playNextMatchday(saveId))?.managed?.live).toBe(false);
    expect(await todays()).toMatchObject({ progress: 0, completedAt: null });

    await setMission("PLAY_MATCHES");
    await matchday.playNextMatchday(saveId);
    expect(await todays()).toMatchObject({ progress: 1, completedAt: null });
    // Another career of the same player: its match counts too.
    const facts = { live: false, won: false, cleanSheet: false, starters: [] };
    await missions.recordMissionMoves(db, otherCareer, { match: { facts, date: dayOf(today) }, substitution: false, instruction: false });
    expect(await todays()).toMatchObject({ progress: 2, completedAt: null });
    await matchday.playNextMatchday(saveId);

    const done = await todays();
    expect(done).toMatchObject({ progress: 3, streak: 1, best: 1 });
    expect(done.completedAt).toBeInstanceOf(Date);
    // Done: a later match changes nothing.
    await matchday.playNextMatchday(saveId);
    expect(await todays()).toEqual(done);
    expect(await missions.getDailyMission(saveId, dayOf(today))).toMatchObject({ completed: true, progress: 3, streak: { current: 1, best: 1, last: null } });
  }, PLAYING_MS);

  it("counts the player's substitution and instruction at a pause of a live match, then the live match at its end", async () => {
    const { matchday, live, support } = loaded();
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
    await setMission("LIVE_SUBSTITUTION");
    // Kept as it was before the pause: the step's moves count once it is written.
    const next = await live.advanceLiveMatch(saveId, pause, { changes, instruction: "ATTACK" }, "segment");
    expect(await todays()).toMatchObject({ progress: 1, streak: 1 });

    await setMission("LIVE_INSTRUCTION");
    if (next.pause === null) {
      throw new Error("The match ended at half-time");
    }
    await live.advanceLiveMatch(saveId, next.pause, { instruction: "DEFEND" }, "segment");
    expect(await todays()).toMatchObject({ progress: 1, streak: 1 });

    await setMission("PLAY_LIVE");
    // Steps without a move of the player's: nothing until the match is over, then the live match.
    for (let at: LivePause | null = await live.getLivePause(saveId); at !== null; ) {
      const step = await live.advanceLiveMatch(saveId, at, {}, "segment");
      expect((await todays()).progress).toBe(step.result === null ? 0 : 1);
      at = step.pause;
    }
    expect(await todays()).toMatchObject({ progress: 1, streak: 1, best: 1 });
  }, PLAYING_MS);

  it("adds a day to the streak of yesterday's mission, starts it again after a missed day, and keeps the record", async () => {
    const { db, missions, matchday } = loaded();
    await setMission("PLAY_MATCHES", 2);
    await db.dailyMission.create({
      data: { userId: ownerId, day: daysBefore(1), kind: "WIN", target: 1, progress: 1, completedAt: daysBefore(1), streak: 2, best: 4 },
    });
    await matchday.playNextMatchday(saveId);
    expect(await todays()).toMatchObject({ streak: 3, best: 4 });

    await setMission("PLAY_MATCHES", 2);
    await db.dailyMission.create({
      data: { userId: ownerId, day: daysBefore(3), kind: "WIN", target: 1, progress: 1, completedAt: daysBefore(3), streak: 5, best: 5 },
    });
    expect(await missions.getMissionStreak(saveId, dayOf(today))).toEqual({ current: 0, best: 5, last: 5 });
    await matchday.playNextMatchday(saveId);
    expect(await todays()).toMatchObject({ streak: 1, best: 5 });
    expect(await missions.getMissionStreak(saveId, dayOf(today))).toEqual({ current: 1, best: 5, last: null });
    // Yesterday's streak alive today, before today's mission is done.
    await setMission("WIN");
    await db.dailyMission.create({
      data: { userId: ownerId, day: daysBefore(1), kind: "WIN", target: 1, progress: 1, completedAt: daysBefore(1), streak: 2, best: 3 },
    });
    expect(await missions.getDailyMission(saveId, dayOf(today))).toMatchObject({ completed: false, streak: { current: 2, best: 3, last: null } });
  }, PLAYING_MS);

  it("starts a youngster: a starter of 21 or younger at the match's date, never an older one", async () => {
    const { db, matchday } = loaded();
    const { currentDate } = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
    const managed = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    const yearsBefore = (years: number) => new Date(Date.UTC(currentDate.getUTCFullYear() - years, currentDate.getUTCMonth(), currentDate.getUTCDate()));
    await setMission("START_YOUTH");
    await db.playerSave.updateMany({ where: { saveId, clubSaveId: managed.id }, data: { birthDate: yearsBefore(30) } });
    await matchday.playNextMatchday(saveId);
    expect(await todays()).toMatchObject({ progress: 0, completedAt: null });

    await db.playerSave.updateMany({ where: { saveId, clubSaveId: managed.id }, data: { birthDate: yearsBefore(19) } });
    await matchday.playNextMatchday(saveId);
    expect(await todays()).toMatchObject({ progress: 1, streak: 1 });
  }, PLAYING_MS);

  it("gives a challenge save no mission, and counts none of its moves", async () => {
    const { db, missions, matchday } = loaded();
    await setMission("PLAY_MATCHES");
    await db.save.update({ where: { id: saveId }, data: { challengeId } });
    try {
      expect(await missions.getDailyMission(saveId, dayOf(today))).toBeNull();
      expect(await missions.getMissionStreak(saveId, dayOf(today))).toBeNull();
      await matchday.playNextMatchday(saveId);
      expect((await todays()).progress).toBe(0);
    } finally {
      await db.save.update({ where: { id: saveId }, data: { challengeId: null } });
    }
  }, PLAYING_MS);
});
