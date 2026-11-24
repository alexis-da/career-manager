import { describe, expect, it } from "vitest";
import type { MatchResult } from "../engine/match";
import {
  ALL_THREE_TOKENS,
  LIVE_MISSIONS,
  MISSION_KINDS,
  MISSION_POOLS,
  MISSION_TIERS,
  MISSION_TOKENS,
  STREAK_DAY3_TOKENS,
  STREAK_DAY7_TOKENS,
  addDays,
  changedMissionKind,
  cycleDayOf,
  dailyMissionKind,
  dailyMissionKinds,
  matchFacts,
  missionStep,
  missionSteps,
  missionTarget,
  streakAfter,
  streakOn,
  tierOf,
  welcomeTokens,
  type MatchFacts,
  type MissionKind,
  type MissionMove,
  type MissionTier,
} from "./missions";

const USERS = Array.from({ length: 20 }, (_, index) => `user-${index}`);
const DAYS = Array.from({ length: 300 }, (_, index) => addDays("2026-11-17", index));
// Thousands of draws, each walking its ten days before: a second alone, more beside the other files.
const DRAWING_MS = 30_000;

const facts = (figures: Partial<MatchFacts> = {}): MatchFacts => ({
  live: false,
  won: false,
  cleanSheet: false,
  goalsFor: 0,
  coached: false,
  starters: [],
  players: [],
  ...figures,
});
const match = (figures: Partial<MatchFacts> = {}, youthPlayed: boolean | null = null): MissionMove => ({ kind: "match", facts: facts(figures), youthPlayed });

describe("the pools of the three missions", () => {
  it("share no mission, hold every one, weigh 100 each, and keep the hard ones live, most of the medium ones", () => {
    const pooled = MISSION_TIERS.flatMap((tier) => MISSION_POOLS[tier].map(([kind]) => kind));
    expect(new Set(pooled).size).toBe(pooled.length);
    expect([...pooled].sort()).toEqual([...MISSION_KINDS].sort());
    for (const tier of MISSION_TIERS) {
      expect(MISSION_POOLS[tier].reduce((sum, [, weight]) => sum + weight, 0), tier).toBe(100);
    }
    const liveShare = (tier: MissionTier) =>
      MISSION_POOLS[tier].filter(([kind]) => LIVE_MISSIONS.includes(kind)).reduce((sum, [, weight]) => sum + weight, 0);
    expect(liveShare("EASY")).toBe(0);
    expect(liveShare("MEDIUM")).toBe(70);
    expect(liveShare("HARD")).toBe(100);
    expect(tierOf("LIVE_WIN")).toBe("HARD");
    expect(missionTarget("PLAY_MATCHES")).toBe(3);
    expect(missionTarget("SCORE")).toBe(1);
    expect(MISSION_TOKENS).toEqual({ EASY: 10, MEDIUM: 20, HARD: 40 });
    expect(ALL_THREE_TOKENS).toBe(30);
  });
});

describe("the missions of the day", () => {
  it("are drawn from the day, the player and the tier only, one of each tier's pool", () => {
    expect(dailyMissionKinds("user-1", "2026-11-17")).toEqual(dailyMissionKinds("user-1", "2026-11-17"));
    const kinds = dailyMissionKinds("user-1", "2026-11-17");
    for (const tier of MISSION_TIERS) {
      expect(tierOf(kinds[tier])).toBe(tier);
    }
    expect(new Set(USERS.map((user) => dailyMissionKind(user, "2026-11-17", "MEDIUM"))).size).toBeGreaterThan(3);
  });

  it("never repeat the day before's in a tier, and follow each tier's weights", () => {
    const counts = new Map<MissionKind, number>();
    for (const tier of MISSION_TIERS) {
      for (const user of USERS) {
        const kinds = DAYS.map((day) => dailyMissionKind(user, day, tier));
        kinds.slice(1).forEach((kind, index) => expect(kind, `${user} ${tier} on ${DAYS[index + 1]}`).not.toBe(kinds[index]));
        for (const kind of kinds) {
          counts.set(kind, (counts.get(kind) ?? 0) + 1);
        }
      }
    }
    const draws = USERS.length * DAYS.length;
    // Without a repeat, the heaviest of a pool comes a little less often than its weight, the others a little more.
    for (const tier of MISSION_TIERS) {
      for (const [kind, weight] of MISSION_POOLS[tier]) {
        expect((counts.get(kind) ?? 0) / draws, kind).toBeGreaterThan(weight / 100 - 0.06);
        expect((counts.get(kind) ?? 0) / draws, kind).toBeLessThan(weight / 100 + 0.06);
      }
    }
  }, DRAWING_MS);

  it("change once a day to another of the tier, never the one replaced nor the day before's, always the same", () => {
    for (const user of USERS.slice(0, 8)) {
      for (const day of DAYS.slice(0, 40)) {
        for (const tier of MISSION_TIERS) {
          const current = dailyMissionKind(user, day, tier);
          const changed = changedMissionKind(user, day, tier, current);
          expect(changed).toBe(changedMissionKind(user, day, tier, current));
          expect(changed).not.toBe(current);
          expect(tierOf(changed)).toBe(tier);
          if (MISSION_POOLS[tier].length > 2) {
            expect(changed).not.toBe(dailyMissionKind(user, addDays(day, -1), tier));
          }
        }
      }
    }
  }, DRAWING_MS);
});

describe("the line-up mission, since the assistant makes the line-up", () => {
  it("is never drawn nor proposed as a change, yet keeps its tier", () => {
    for (const user of USERS.slice(0, 8)) {
      for (const day of DAYS.slice(0, 40)) {
        const easy = dailyMissionKind(user, day, "EASY");
        expect(easy).not.toBe("SAVE_LINEUP");
        expect(changedMissionKind(user, day, "EASY", easy)).not.toBe("SAVE_LINEUP");
      }
    }
    expect(tierOf("SAVE_LINEUP")).toBe("EASY");
  }, DRAWING_MS);
});

describe("a move's step toward a mission", () => {
  it("counts a match, a goal, a youngster who played and a line-up saved for the easy ones", () => {
    expect(missionStep("PLAY_MATCH", match())).toBe(1);
    expect(missionStep("PLAY_MATCH", { kind: "lineup" })).toBe(0);
    expect(missionStep("PLAY_MATCHES", match({ live: true }))).toBe(1);
    expect(missionStep("SCORE", match({ goalsFor: 1 }))).toBe(1);
    expect(missionStep("SCORE", match())).toBe(0);
    expect(missionStep("SAVE_LINEUP", { kind: "lineup" })).toBe(1);
    expect(missionStep("SAVE_LINEUP", match())).toBe(0);
    expect(missionStep("START_YOUTH", match({}, true))).toBe(1);
    expect(missionStep("START_YOUTH", match({}, false))).toBe(0);
  });

  it("counts a live match, the player's substitution, instruction and decision, a win and a clean sheet for the medium ones", () => {
    expect(missionStep("PLAY_LIVE", match({ live: true }))).toBe(1);
    expect(missionStep("PLAY_LIVE", match())).toBe(0);
    expect(missionStep("LIVE_SUBSTITUTION", { kind: "substitution" })).toBe(1);
    expect(missionStep("LIVE_INSTRUCTION", { kind: "instruction" })).toBe(1);
    expect(missionStep("LIVE_DECISION", { kind: "decision" })).toBe(1);
    expect(missionStep("LIVE_DECISION", { kind: "instruction" })).toBe(0);
    expect(missionStep("WIN", match({ won: true }))).toBe(1);
    expect(missionStep("CLEAN_SHEET", match({ cleanSheet: true }))).toBe(1);
  });

  it("asks a live match for the hard ones: a win, a win with a change of the player's, two goals, a clean sheet", () => {
    expect(missionStep("LIVE_WIN", match({ live: true, won: true }))).toBe(1);
    expect(missionStep("LIVE_WIN", match({ won: true }))).toBe(0);
    expect(missionStep("LIVE_WIN_COACHED", match({ live: true, won: true, coached: true }))).toBe(1);
    expect(missionStep("LIVE_WIN_COACHED", match({ live: true, won: true }))).toBe(0);
    expect(missionStep("LIVE_SCORE_TWO", match({ live: true, goalsFor: 2 }))).toBe(1);
    expect(missionStep("LIVE_SCORE_TWO", match({ live: true, goalsFor: 1 }))).toBe(0);
    expect(missionStep("LIVE_CLEAN_SHEET", match({ live: true, cleanSheet: true }))).toBe(1);
    expect(missionStep("LIVE_CLEAN_SHEET", match({ cleanSheet: true }))).toBe(0);
  });

  it("never brings more than what is left of the mission", () => {
    const moves = [match(), match(), match(), match()];
    expect(missionSteps("PLAY_MATCHES", moves, 3)).toBe(3);
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

  it("says a win, the goals, a clean sheet, a change of the player's in a live match, the starting eleven and who played", () => {
    expect(matchFacts(result({ homeGoals: 2 }), "home", true, true)).toEqual({
      live: true,
      won: true,
      cleanSheet: true,
      goalsFor: 2,
      coached: true,
      starters: ["h1", "h2"],
      players: ["h1", "h2", "h3"],
    });
    expect(matchFacts(result({ homeGoals: 2, awayGoals: 1 }), "away", false, true)).toMatchObject({ won: false, goalsFor: 1, coached: false });
  });

  it("decides a cup tie on its shoot-out, its goals those of play", () => {
    const shootOut = result({ homeGoals: 1, awayGoals: 1, decidedBy: "PENALTIES", homePenalties: 3, awayPenalties: 5 });
    expect(matchFacts(shootOut, "away", false)).toMatchObject({ won: true, goalsFor: 1, cleanSheet: false });
  });
});

describe("the streak", () => {
  const mark = (day: string, streak: number, cycles = 0, best = streak) => ({ day, streak, best, cycles });

  it("adds a day after yesterday's, starts again after a missed day, and keeps the record and the cycles done", () => {
    expect(streakAfter(null, "2026-11-17", false)).toMatchObject({ streak: 1, best: 1, cycles: 0, cycleDay: 1, tokens: 0, forgiven: null });
    expect(streakAfter(mark("2026-11-16", 1), "2026-11-17", false)).toMatchObject({ streak: 2, cycleDay: 2, tokens: 0 });
    expect(streakAfter(mark("2026-11-15", 4, 2, 9), "2026-11-17", false)).toMatchObject({ streak: 1, best: 9, cycles: 2 });
  });

  it("pays its cycle's third and seventh days, the seventh a lot of the cycles done in all", () => {
    expect(streakAfter(mark("2026-11-16", 2), "2026-11-17", false)).toMatchObject({ streak: 3, cycleDay: 3, tokens: STREAK_DAY3_TOKENS, lot: null });
    expect(streakAfter(mark("2026-11-16", 6, 0), "2026-11-17", false)).toMatchObject({ streak: 7, cycleDay: 7, cycles: 1, tokens: STREAK_DAY7_TOKENS, lot: 1 });
    // A second cycle after a break: its seventh day is the third cycle done in all.
    expect(streakAfter(mark("2026-11-16", 6, 2), "2026-11-17", false)).toMatchObject({ cycles: 3, lot: 3 });
    expect(streakAfter(mark("2026-11-16", 9, 1), "2026-11-17", false)).toMatchObject({ streak: 10, cycleDay: 3, tokens: STREAK_DAY3_TOKENS });
    expect([1, 3, 7, 8, 10, 14].map(cycleDayOf)).toEqual([1, 3, 7, 1, 3, 7]);
  });

  it("forgives one missed day with the shield in reserve, never two", () => {
    expect(streakAfter(mark("2026-11-15", 4), "2026-11-17", true)).toMatchObject({ streak: 5, forgiven: "2026-11-16" });
    expect(streakAfter(mark("2026-11-14", 4), "2026-11-17", true)).toMatchObject({ streak: 1, forgiven: null });
    expect(streakAfter(mark("2026-11-16", 4), "2026-11-17", true)).toMatchObject({ streak: 5, forgiven: null });
  });

  it("stays alive on screen while its last day is today's, yesterday's, or the day before's with a shield", () => {
    expect(streakOn(null, "2026-11-17", false)).toMatchObject({ current: 0, last: null, nextCycleDay: 1 });
    expect(streakOn(mark("2026-11-17", 3), "2026-11-17", false)).toMatchObject({ current: 3, counted: true, nextCycleDay: 3 });
    expect(streakOn(mark("2026-11-16", 6), "2026-11-17", false)).toMatchObject({ current: 6, counted: false, nextCycleDay: 7 });
    expect(streakOn(mark("2026-11-15", 6), "2026-11-17", true)).toMatchObject({ current: 6, shielded: true, nextCycleDay: 7 });
    expect(streakOn(mark("2026-11-15", 6), "2026-11-17", false)).toMatchObject({ current: 0, last: 6, nextCycleDay: 1 });
  });
});

describe("the v1 player's welcome", () => {
  it("pays 10 tokens a v1 mission done, at most 100", () => {
    expect([0, 1, 4, 10, 25].map(welcomeTokens)).toEqual([0, 10, 40, 100, 100]);
  });

  it("counts days across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
});
