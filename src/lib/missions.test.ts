import { describe, expect, it } from "vitest";
import type { MatchResult } from "../engine/match";
import {
  LIVE_MISSIONS,
  MISSION_KINDS,
  MISSION_TARGETS,
  MISSION_WEIGHTS,
  addDays,
  dailyMissionKind,
  matchFacts,
  missionStep,
  missionSteps,
  streakAfter,
  streakOn,
  type MatchFacts,
  type MissionKind,
  type MissionMove,
} from "./missions";

const USERS = Array.from({ length: 20 }, (_, index) => `user-${index}`);
const DAYS = Array.from({ length: 300 }, (_, index) => addDays("2026-11-17", index));
// Thousands of draws, each walking its ten days before: a second alone, more beside the other files.
const DRAWING_MS = 20_000;

const facts = (figures: Partial<MatchFacts> = {}): MatchFacts => ({ live: false, won: false, cleanSheet: false, starters: [], ...figures });
const match = (figures: Partial<MatchFacts> = {}, youthStarted: boolean | null = null): MissionMove => ({ kind: "match", facts: facts(figures), youthStarted });

describe("the mission of the day", () => {
  it("is drawn from the day and the player only: the same every time, another for another player or day", () => {
    expect(dailyMissionKind("user-1", "2026-11-17")).toBe(dailyMissionKind("user-1", "2026-11-17"));
    const ofDay = new Set(USERS.map((user) => dailyMissionKind(user, "2026-11-17")));
    const ofUser = new Set(DAYS.slice(0, 30).map((day) => dailyMissionKind("user-1", day)));
    expect(ofDay.size).toBeGreaterThan(4);
    expect(ofUser.size).toBeGreaterThan(4);
  });

  it("is never the day before's", () => {
    for (const user of USERS) {
      const kinds = DAYS.map((day) => dailyMissionKind(user, day));
      kinds.slice(1).forEach((kind, index) => expect(kind, `${user} on ${DAYS[index + 1]}`).not.toBe(kinds[index]));
    }
  }, DRAWING_MS);

  it("leads to a live match more than every other day, each mission drawn", () => {
    const counts = new Map<MissionKind, number>();
    for (const user of USERS) {
      for (const day of DAYS) {
        const kind = dailyMissionKind(user, day);
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
      }
    }
    const total = USERS.length * DAYS.length;
    const live = LIVE_MISSIONS.reduce((sum, kind) => sum + (counts.get(kind) ?? 0), 0);
    expect(live / total).toBeGreaterThan(0.5);
    expect(live / total).toBeLessThan(0.6);
    for (const kind of MISSION_KINDS) {
      expect(counts.get(kind) ?? 0, kind).toBeGreaterThan(total * 0.07);
    }
    expect(Object.values(MISSION_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
    expect(LIVE_MISSIONS.reduce((sum, kind) => sum + MISSION_WEIGHTS[kind], 0)).toBe(55);
  }, DRAWING_MS);
});

describe("a move's step toward a mission", () => {
  it("counts a live match to its end, and a substitution or an instruction of the player's at a live match's pause", () => {
    expect(missionStep("PLAY_LIVE", match({ live: true }))).toBe(1);
    expect(missionStep("PLAY_LIVE", match())).toBe(0);
    expect(missionStep("LIVE_SUBSTITUTION", { kind: "substitution" })).toBe(1);
    expect(missionStep("LIVE_SUBSTITUTION", match({ live: true }))).toBe(0);
    expect(missionStep("LIVE_INSTRUCTION", { kind: "instruction" })).toBe(1);
    expect(missionStep("LIVE_INSTRUCTION", { kind: "substitution" })).toBe(0);
  });

  it("counts a win, live or not as the mission says, a clean sheet, any match, and a starter of 21 or younger", () => {
    expect(missionStep("LIVE_WIN", match({ live: true, won: true }))).toBe(1);
    expect(missionStep("LIVE_WIN", match({ won: true }))).toBe(0);
    expect(missionStep("WIN", match({ won: true }))).toBe(1);
    expect(missionStep("WIN", match({ live: true, won: true }))).toBe(1);
    expect(missionStep("WIN", match())).toBe(0);
    expect(missionStep("CLEAN_SHEET", match({ cleanSheet: true }))).toBe(1);
    expect(missionStep("CLEAN_SHEET", match({ won: true }))).toBe(0);
    expect(missionStep("PLAY_MATCHES", match())).toBe(1);
    expect(missionStep("PLAY_MATCHES", { kind: "instruction" })).toBe(0);
    expect(missionStep("START_YOUTH", match({}, true))).toBe(1);
    expect(missionStep("START_YOUTH", match({}, false))).toBe(0);
    expect(missionStep("START_YOUTH", match())).toBe(0);
  });

  it("never brings more than what is left of the mission", () => {
    const moves = [match(), match(), match(), match()];
    expect(missionSteps("PLAY_MATCHES", moves, MISSION_TARGETS.PLAY_MATCHES)).toBe(3);
    expect(missionSteps("PLAY_MATCHES", moves, 1)).toBe(1);
    expect(missionSteps("WIN", moves, 1)).toBe(0);
  });
});

describe("a finished match's facts", () => {
  const result = (figures: Partial<MatchResult>): MatchResult => ({
    homeGoals: 0,
    awayGoals: 0,
    homeHalfTimeGoals: 0,
    awayHalfTimeGoals: 0,
    fullTime: 90,
    events: [],
    appearances: [
      { playerId: "h1", side: "home", slot: "GK", from: 0, to: 90, minutes: 90 },
      { playerId: "h2", side: "home", slot: "ST", from: 0, to: 60, minutes: 60 },
      { playerId: "h3", side: "home", slot: "ST", from: 61, to: 90, minutes: 30 },
      { playerId: "a1", side: "away", slot: "GK", from: 0, to: 90, minutes: 90 },
    ],
    injuries: [],
    ...figures,
  });

  it("says a win, a clean sheet and the starting eleven of the managed club's side", () => {
    expect(matchFacts(result({ homeGoals: 2 }), "home", true)).toEqual({ live: true, won: true, cleanSheet: true, starters: ["h1", "h2"] });
    expect(matchFacts(result({ homeGoals: 2, awayGoals: 1 }), "away", false)).toEqual({ live: false, won: false, cleanSheet: false, starters: ["a1"] });
  });

  it("decides a cup tie on its shoot-out, and keeps a goalless draw a clean sheet", () => {
    const shootOut = result({ decidedBy: "PENALTIES", homePenalties: 3, awayPenalties: 5 });
    expect(matchFacts(shootOut, "away", false)).toMatchObject({ won: true, cleanSheet: true });
    expect(matchFacts(shootOut, "home", false)).toMatchObject({ won: false, cleanSheet: true });
  });
});

describe("the streak of completed missions", () => {
  it("adds a day to a streak of yesterday's, starts again after a missed day, and keeps the record", () => {
    expect(streakAfter(null, "2026-11-17")).toEqual({ streak: 1, best: 1 });
    expect(streakAfter({ day: "2026-11-16", streak: 3, best: 5 }, "2026-11-17")).toEqual({ streak: 4, best: 5 });
    expect(streakAfter({ day: "2026-11-16", streak: 5, best: 5 }, "2026-11-17")).toEqual({ streak: 6, best: 6 });
    expect(streakAfter({ day: "2026-11-15", streak: 4, best: 4 }, "2026-11-17")).toEqual({ streak: 1, best: 4 });
  });

  it("stays alive while its latest mission is today's or yesterday's, and says the last one once it ended", () => {
    expect(streakOn(null, "2026-11-17")).toEqual({ current: 0, best: 0, last: null });
    expect(streakOn({ day: "2026-11-17", streak: 2, best: 4 }, "2026-11-17")).toEqual({ current: 2, best: 4, last: null });
    expect(streakOn({ day: "2026-11-16", streak: 2, best: 4 }, "2026-11-17")).toEqual({ current: 2, best: 4, last: null });
    expect(streakOn({ day: "2026-11-15", streak: 3, best: 4 }, "2026-11-17")).toEqual({ current: 0, best: 4, last: 3 });
  });

  it("counts days across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
});
