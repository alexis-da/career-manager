import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { breakWindows } from "../engine/schedule";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

const DAY = (date: Date): string => date.toISOString().slice(0, 10);

// The national teams of a new worldVersion 2 save (docs/design/selections.md, N1 and N2), on a throwaway twin of the demo
// save: its nations and the friendlies of its breaks from its first season, a break played as one step of its own, what
// the screens read of it; none in a worldVersion 1 save. Runs against DATABASE_URL and is skipped without it; modules are
// imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the national teams of a save", () => {
  let db: typeof prismaClient | undefined;
  let modules:
    | {
        matchday: typeof import("./matchday");
        nations: typeof import("./nations");
        view: typeof import("./nations-view");
        players: typeof import("./players");
      }
    | undefined;
  let saveId = "";
  let worldOneId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const loaded = () => {
    if (modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return modules;
  };

  beforeAll(async () => {
    const [{ prisma }, support, matchday, nations, view, players] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./nations"),
      import("./nations-view"),
      import("./players"),
    ]);
    db = prisma;
    modules = { matchday, nations, view, players };
    saveId = await support.createDemoTwin("Test Nations", 2);
    worldOneId = await support.createDemoTwin("Test Nations 1", 1);
  }, 120_000);

  afterAll(async () => {
    for (const id of [saveId, worldOneId]) {
      if (id !== "") {
        await db?.save.delete({ where: { id } });
      }
    }
    await db?.$disconnect();
  }, 120_000);

  it("opens the 14 nations, their reserves and the 56 friendlies of the first season's breaks, no club playing on them", async () => {
    const save = await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { breaksFrom: true } });
    expect(save.breaksFrom).toBe(WORLD_START_YEAR);
    const nations = await database().nationSave.findMany({ where: { saveId }, select: { code: true, reserve: true, reserveCaps: true } });
    expect(nations).toHaveLength(14);
    for (const nation of nations) {
      expect(loaded().nations.parseReserve(nation.reserve)).toHaveLength(23);
      expect(nation.reserveCaps).toEqual(Array.from({ length: 23 }, () => 0));
    }
    const matches = await database().internationalMatch.findMany({ where: { saveId }, select: { scheduledAt: true, home: true, away: true, played: true } });
    expect(matches).toHaveLength(56);
    expect([...new Set(matches.map((match) => DAY(match.scheduledAt)))].sort()).toEqual(
      breakWindows(WORLD_START_YEAR).flatMap((window) => window.dates.map(DAY)),
    );
    expect(matches.every((match) => !match.played)).toBe(true);
    // No club plays from the Wednesday before a break to the Wednesday after its Saturday.
    const clubDates = await database().fixture.groupBy({ by: ["scheduledAt"], where: { saveId } });
    const breakDays = breakWindows(WORLD_START_YEAR).flatMap(({ dates: [friday] }) =>
      [-2, -1, 0, 1, 2, 3, 4, 5].map((offset) => DAY(new Date(friday.getTime() + offset * 86_400_000))),
    );
    expect(clubDates.map(({ scheduledAt }) => DAY(scheduledAt)).filter((day) => breakDays.includes(day))).toEqual([]);
  });

  it("gives a worldVersion 1 save no national team", async () => {
    const save = await database().save.findUniqueOrThrow({ where: { id: worldOneId }, select: { breaksFrom: true } });
    expect(save.breaksFrom).toBeNull();
    expect(await database().nationSave.count({ where: { saveId: worldOneId } })).toBe(0);
    expect(await database().internationalMatch.count({ where: { saveId: worldOneId } })).toBe(0);
    expect(await loaded().view.getManagedBreak(worldOneId)).toBeNull();
    expect(await loaded().view.getNationsView(worldOneId)).toBeNull();
    // Never in a challenge save, whatever the game gives the others.
    expect(loaded().nations.nationsFor({ worldVersion: 2, challengeId: "challenge", breaksFrom: null })).toBe(false);
    expect(loaded().nations.nationsFor({ worldVersion: 1, challengeId: null, breaksFrom: null })).toBe(false);
    expect(loaded().nations.nationsFor({ worldVersion: 2, challengeId: null, breaksFrom: null })).toBe(true);
  });

  it("plays the first break as a step of its own, before the clubs' next date, and tells the screens before and after", async () => {
    const { matchday, view, players } = loaded();
    const [friday, tuesday] = breakWindows(WORLD_START_YEAR)[0].dates;
    // The clubs' dates before the break: the save stops at the last one.
    for (;;) {
      const next = await database().fixture.findFirst({ where: { saveId, played: false }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } });
      if (next === null || next.scheduledAt > friday) {
        break;
      }
      const summary = await matchday.playNextMatchday(saveId);
      expect(summary?.internationalBreak).toBeUndefined();
    }

    const before = await view.getManagedBreak(saveId);
    expect(before?.state).toBe("upcoming");
    expect(DAY(before?.from ?? new Date(0))).toBe(DAY(friday));
    expect(DAY(before?.to ?? new Date(0))).toBe(DAY(tuesday));
    const calledKeys = (before?.players ?? []).map((player) => player.playerKey);
    expect(calledKeys.length).toBeGreaterThan(0);
    // The players' sheets say it.
    const profiles = await players.getPlayerProfiles(saveId, { playerKey: { in: calledKeys } });
    expect(profiles.every((profile) => profile.international.calledFor !== null)).toBe(true);

    const summary = await matchday.playNextMatchday(saveId);
    expect(summary?.internationalBreak).toBeDefined();
    expect(summary?.fixtures).toBe(0);
    expect(DAY(summary?.date ?? new Date(0))).toBe(DAY(tuesday));
    // The managed club's players the nations called, the very ones the dashboard announced.
    expect(summary?.internationalBreak?.managed.map((player) => player.playerKey).sort()).toEqual([...calledKeys].sort());

    const save = await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
    expect(DAY(save.currentDate)).toBe(DAY(tuesday));
    const played = await database().internationalMatch.findMany({
      where: { saveId, scheduledAt: { lte: tuesday } },
      select: { played: true, homeGoals: true, awayGoals: true, goalTimes: true, scorers: true },
    });
    expect(played).toHaveLength(14);
    for (const match of played) {
      expect(match.played).toBe(true);
      expect(match.goalTimes).toHaveLength((match.homeGoals ?? 0) + (match.awayGoals ?? 0));
      expect(match.scorers).toHaveLength(match.goalTimes.length);
    }
    expect(await database().internationalMatch.count({ where: { saveId, played: false } })).toBe(42);
    // Caps and goals on the players of our clubs who played, the reserves' on their nation.
    const capped = await database().playerSave.findMany({ where: { saveId, caps: { gt: 0 } }, select: { caps: true, internationalGoals: true } });
    expect(capped.length).toBeGreaterThan(100);
    expect(capped.every((player) => player.caps <= 2)).toBe(true);
    const reserveCaps = await database().nationSave.findMany({ where: { saveId }, select: { reserveCaps: true } });
    expect(reserveCaps.flatMap((nation) => nation.reserveCaps).reduce((sum, caps) => sum + caps, 0)).toBeGreaterThan(0);

    const after = await view.getManagedBreak(saveId);
    expect(after?.state).toBe("back");
    expect(after?.players.map((player) => player.playerKey).sort()).toEqual([...calledKeys].sort());
    const nations = await view.getNationsView(saveId);
    expect(nations?.nations).toHaveLength(14);
    expect(nations?.nations.every((nation) => nation.players.length === 23)).toBe(true);
    expect(nations?.lastBreak?.results).toHaveLength(14);

    // The next step is the clubs' Saturday after the break.
    const next = await matchday.playNextMatchday(saveId);
    expect(next?.internationalBreak).toBeUndefined();
    expect(DAY(next?.date ?? new Date(0))).toBe(DAY(new Date(tuesday.getTime() + 4 * 86_400_000)));
  }, 120_000);
});
