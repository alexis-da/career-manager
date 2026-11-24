import type { MatchResult, Side } from "../engine/match";
import { makeRng, weightedIndex } from "./rng";

// The missions of the day, v2 (docs/design/missions-v2.md, CLAUDE.md « Missions du jour »): three a player a UTC day, an
// easy, a medium and a hard one, each drawn from its tier's pool by the day, the player and the tier, the same in every
// career of theirs but a challenge one, done in any of them. Pure: the pools, the draws (the day's and « Changer de
// mission »'s), what each move of the player brings to a mission, the tokens they earn, and the streak with its cycles
// and its shield. Their rows are src/db/missions.ts's; nothing of the simulation, which they only read once a move is
// played.

/** Every mission, v1's eight first. A name is kept with each day's missions: never rename one. */
export const MISSION_KINDS = [
  "PLAY_LIVE",
  "LIVE_SUBSTITUTION",
  "LIVE_INSTRUCTION",
  "LIVE_WIN",
  "WIN",
  "CLEAN_SHEET",
  "PLAY_MATCHES",
  "START_YOUTH",
  "PLAY_MATCH",
  "SCORE",
  "SAVE_LINEUP",
  "LIVE_DECISION",
  "LIVE_WIN_COACHED",
  "LIVE_SCORE_TWO",
  "LIVE_CLEAN_SHEET",
] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];

export const MISSION_TIERS = ["EASY", "MEDIUM", "HARD"] as const;
export type MissionTier = (typeof MISSION_TIERS)[number];

/**
 * Each tier's missions and their weight in its draw, in hundredths of its days: the easy ones done simulated in a minute
 * or two, the medium ones 70 % live, the hard ones all live. The pools never share a mission.
 */
export const MISSION_POOLS: Readonly<Record<MissionTier, readonly (readonly [MissionKind, number])[]>> = {
  // SAVE_LINEUP never drawn since the assistant makes the line-up (docs/design/simplification.md § 9): saving one's own
  // would take it from him. Weight 0, first of its pool (weightedIndex's rounding falls back on the last one): it keeps
  // its tier, for a mission of the day already drawn and for /admin.
  EASY: [
    ["SAVE_LINEUP", 0],
    ["PLAY_MATCH", 30],
    ["PLAY_MATCHES", 25],
    ["SCORE", 25],
    ["START_YOUTH", 20],
  ],
  MEDIUM: [
    ["PLAY_LIVE", 25],
    ["LIVE_SUBSTITUTION", 15],
    ["LIVE_INSTRUCTION", 15],
    ["LIVE_DECISION", 15],
    ["WIN", 15],
    ["CLEAN_SHEET", 15],
  ],
  HARD: [
    ["LIVE_WIN", 35],
    ["LIVE_WIN_COACHED", 25],
    ["LIVE_SCORE_TWO", 20],
    ["LIVE_CLEAN_SHEET", 20],
  ],
};

/** The missions played in a live match. */
export const LIVE_MISSIONS: readonly MissionKind[] = [
  "PLAY_LIVE",
  "LIVE_SUBSTITUTION",
  "LIVE_INSTRUCTION",
  "LIVE_DECISION",
  "LIVE_WIN",
  "LIVE_WIN_COACHED",
  "LIVE_SCORE_TWO",
  "LIVE_CLEAN_SHEET",
];

/** How many times a mission's move must happen: three matches, once for every other. */
export function missionTarget(kind: MissionKind): number {
  return kind === "PLAY_MATCHES" ? 3 : 1;
}

/** The tokens a mission of each tier earns once done. */
export const MISSION_TOKENS: Readonly<Record<MissionTier, number>> = { EASY: 10, MEDIUM: 20, HARD: 40 };

/** The tokens the third mission of a day adds. */
export const ALL_THREE_TOKENS = 30;

/** A streak's cycle, in counted days, and the tokens of its third and seventh days. */
export const STREAK_CYCLE_DAYS = 7;
export const STREAK_DAY3_TOKENS = 50;
export const STREAK_DAY7_TOKENS = 150;

/** The tokens a v1 mission done earns once, at the first view of v2, and their most. */
export const WELCOME_TOKENS_PER_V1_MISSION = 10;
export const WELCOME_TOKENS_MAX = 100;

/** The oldest age, at the match's date, of a player START_YOUTH asks to start, as the season's youth objective. */
export const YOUTH_MAX_AGE = 21;

/**
 * The days before a mission the draw walks from, each excluding the day before's in its tier: two days in a row never
 * have the same mission in a tier, but where the walks from two days apart have not met yet. A walk keeps apart from the
 * one a day earlier at most 60 % of the days in the hard tier's four missions: thirty days leave about one chance in five
 * million, for some ninety draws a day, a fraction of a millisecond.
 */
const DRAW_LOOKBACK_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC day `days` after `day` (before when negative), both « YYYY-MM-DD ». */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The tier of a mission. */
export function tierOf(kind: MissionKind): MissionTier {
  const tier = MISSION_TIERS.find((candidate) => MISSION_POOLS[candidate].some(([member]) => member === kind));
  if (tier === undefined) {
    throw new Error(`${kind} is in no tier`);
  }
  return tier;
}

/** A draw by weight in a pool, from a stream, leaving out the missions excluded. */
function drawFrom(rng: () => number, pool: readonly (readonly [MissionKind, number])[], excluded: readonly MissionKind[]): MissionKind {
  const open = pool.filter(([kind]) => !excluded.includes(kind));
  return open[weightedIndex(rng, open.map(([, weight]) => weight))][0];
}

/**
 * A day's draw in a tier for a player: a mission by weight, from the day, the player and the tier only; when it is
 * `excluded` (the day before's), another of the rest, from the same stream.
 */
function drawOn(userId: string, day: string, tier: MissionTier, excluded: MissionKind | null): MissionKind {
  const rng = makeRng(`mission:${userId}:${day}:${tier}`);
  const first = drawFrom(rng, MISSION_POOLS[tier], []);
  return first === excluded ? drawFrom(rng, MISSION_POOLS[tier], [first]) : first;
}

/** The mission of a player in a tier on a UTC day: the same for every career of theirs, and never the day before's. */
export function dailyMissionKind(userId: string, day: string, tier: MissionTier): MissionKind {
  let kind: MissionKind | null = null;
  for (let back = DRAW_LOOKBACK_DAYS; back >= 0; back--) {
    kind = drawOn(userId, addDays(day, -back), tier, kind);
  }
  if (kind === null) {
    throw new Error("The draw walks at least the day itself");
  }
  return kind;
}

/** The three missions of a player on a UTC day, easy, medium and hard. */
export function dailyMissionKinds(userId: string, day: string): Record<MissionTier, MissionKind> {
  return {
    EASY: dailyMissionKind(userId, day, "EASY"),
    MEDIUM: dailyMissionKind(userId, day, "MEDIUM"),
    HARD: dailyMissionKind(userId, day, "HARD"),
  };
}

/**
 * « Changer de mission »: the mission that takes the place of `current` in its tier, from a stream of its own, never
 * `current` nor the day before's in the tier. The same however often it is asked: one change a day.
 */
export function changedMissionKind(userId: string, day: string, tier: MissionTier, current: MissionKind): MissionKind {
  const rng = makeRng(`mission:${userId}:${day}:${tier}:change`);
  const yesterday = dailyMissionKind(userId, addDays(day, -1), tier);
  const excluded = MISSION_POOLS[tier].length > 2 ? [current, yesterday] : [current];
  return drawFrom(rng, MISSION_POOLS[tier], excluded);
}

/** What a finished match of the managed club says to a mission. */
export type MatchFacts = {
  live: boolean; // played live to its end
  won: boolean; // on the shoot-out when there was one
  cleanSheet: boolean; // no goal conceded, extra time included
  goalsFor: number; // extra time included, the shoot-out's aside
  coached: boolean; // live, with a substitution of the player's (TeamLive.manual)
  starters: string[]; // the managed club's starting eleven, by player key
  players: string[]; // every player of the managed club who played, starters and substitutes, by player key
};

/**
 * A move of the player in a career but a challenge one: a match of the managed club played to its end (`youthPlayed`: a
 * player of YOUTH_MAX_AGE or younger at its date played in it, from the start or coming on, looked up only for
 * START_YOUTH, null otherwise); at a pause of a live match, a substitution, an instruction or a choice event's decision of
 * theirs; a line-up saved.
 */
export type MissionMove =
  | { kind: "match"; facts: MatchFacts; youthPlayed: boolean | null }
  | { kind: "substitution" }
  | { kind: "instruction" }
  | { kind: "decision" }
  | { kind: "lineup" };

/** What a move brings to a mission: one step of its target, or nothing. */
export function missionStep(kind: MissionKind, move: MissionMove): number {
  const match = move.kind === "match" ? move.facts : null;
  const live = match?.live === true;
  switch (kind) {
    case "PLAY_MATCH":
    case "PLAY_MATCHES":
      return match === null ? 0 : 1;
    case "SCORE":
      return match !== null && match.goalsFor >= 1 ? 1 : 0;
    case "SAVE_LINEUP":
      return move.kind === "lineup" ? 1 : 0;
    // « Fais jouer un joueur de 21 ans ou moins » since the assistant makes the line-up (§ 9): a substitution at a
    // pause of a live match does it, its key unchanged.
    case "START_YOUTH":
      return move.kind === "match" && move.youthPlayed === true ? 1 : 0;
    case "PLAY_LIVE":
      return live ? 1 : 0;
    case "LIVE_SUBSTITUTION":
      return move.kind === "substitution" ? 1 : 0;
    case "LIVE_INSTRUCTION":
      return move.kind === "instruction" ? 1 : 0;
    case "LIVE_DECISION":
      return move.kind === "decision" ? 1 : 0;
    case "WIN":
      return match?.won === true ? 1 : 0;
    case "CLEAN_SHEET":
      return match?.cleanSheet === true ? 1 : 0;
    case "LIVE_WIN":
      return live && match.won ? 1 : 0;
    case "LIVE_WIN_COACHED":
      return live && match.won && match.coached ? 1 : 0;
    case "LIVE_SCORE_TWO":
      return live && match.goalsFor >= 2 ? 1 : 0;
    case "LIVE_CLEAN_SHEET":
      return live && match.cleanSheet ? 1 : 0;
  }
}

/** The steps a player's moves bring to a mission, at most what is left of it. */
export function missionSteps(kind: MissionKind, moves: readonly MissionMove[], left: number): number {
  return Math.max(
    0,
    Math.min(
      left,
      moves.reduce((sum, move) => sum + missionStep(kind, move), 0),
    ),
  );
}

/** What a finished match of the managed club, on its side, says to a mission. */
export function matchFacts(result: MatchResult, side: Side, live: boolean, coached = false): MatchFacts {
  const other: Side = side === "home" ? "away" : "home";
  const goals = { home: result.homeGoals, away: result.awayGoals };
  const penalties = { home: result.homePenalties ?? 0, away: result.awayPenalties ?? 0 };
  const decider = result.decidedBy === "PENALTIES" ? penalties : goals;
  return {
    live,
    won: decider[side] > decider[other],
    cleanSheet: goals[other] === 0,
    goalsFor: goals[side],
    coached: live && coached,
    starters: result.appearances.filter((appearance) => appearance.side === side && appearance.from === 0).map((appearance) => appearance.playerId),
    players: result.appearances.filter((appearance) => appearance.side === side).map((appearance) => appearance.playerId),
  };
}

/**
 * A counted day's place in its player's streak: the day, the days in a row it makes, the record then, and the cycles of
 * STREAK_CYCLE_DAYS done in all then (never lost).
 */
export type StreakMark = { day: string; streak: number; best: number; cycles: number };

/** What a day's first mission done makes of the streak: its figures, the shield used, the bonus and the cycle's lot. */
export type StreakStep = {
  streak: number;
  best: number;
  cycles: number;
  cycleDay: number; // 1 to STREAK_CYCLE_DAYS
  forgiven: string | null; // the day missed the shield forgave, null when none was used
  tokens: number; // the bonus of the cycle's third or seventh day, 0 otherwise
  lot: number | null; // the seventh day: the cycles done in all, the exclusive cosmetics' rank
};

/** The day of its cycle a streak is at. */
export const cycleDayOf = (streak: number): number => ((streak - 1) % STREAK_CYCLE_DAYS) + 1;

/**
 * The streak a day counted (its first mission done) makes after the player's latest counted day before it (null: none):
 * one more after yesterday's; one more after the day before yesterday's when a shield is in reserve, the day between
 * forgiven; 1 otherwise. The cycles done carry on whatever happened in between.
 */
export function streakAfter(previous: StreakMark | null, day: string, shield: boolean): StreakStep {
  const continued = previous !== null && previous.day === addDays(day, -1);
  const forgiven = !continued && shield && previous !== null && previous.day === addDays(day, -2) ? addDays(day, -1) : null;
  const streak = previous !== null && (continued || forgiven !== null) ? previous.streak + 1 : 1;
  const cycleDay = cycleDayOf(streak);
  const cycles = (previous?.cycles ?? 0) + (cycleDay === STREAK_CYCLE_DAYS ? 1 : 0);
  return {
    streak,
    best: Math.max(previous?.best ?? 0, streak),
    cycles,
    cycleDay,
    forgiven,
    tokens: cycleDay === 3 ? STREAK_DAY3_TOKENS : cycleDay === STREAK_CYCLE_DAYS ? STREAK_DAY7_TOKENS : 0,
    lot: cycleDay === STREAK_CYCLE_DAYS ? cycles : null,
  };
}

/** The streak as the screens show it on `today`. */
export type StreakView = {
  current: number; // days in a row, today's included once counted; 0 when it ran out
  best: number;
  cycles: number; // done in all
  counted: boolean; // today already counts
  nextCycleDay: number; // the cycle's day today counts as, or counted as
  shielded: boolean; // alive only thanks to the shield in reserve: one day was missed
  last: number | null; // the streak that ran out, null while one runs
};

/**
 * The player's streak on `today`, from their latest counted day: alive while it was today's or yesterday's, or the day
 * before yesterday's with a shield in reserve; the one that ran out otherwise.
 */
export function streakOn(latest: StreakMark | null, today: string, shield: boolean): StreakView {
  if (latest === null) {
    return { current: 0, best: 0, cycles: 0, counted: false, nextCycleDay: 1, shielded: false, last: null };
  }
  const counted = latest.day === today;
  const alive = counted || latest.day === addDays(today, -1);
  const shielded = !alive && shield && latest.day === addDays(today, -2);
  const running = alive || shielded;
  return {
    current: running ? latest.streak : 0,
    best: latest.best,
    cycles: latest.cycles,
    counted,
    nextCycleDay: counted ? cycleDayOf(latest.streak) : running ? cycleDayOf(latest.streak + 1) : 1,
    shielded,
    last: running ? null : latest.streak,
  };
}

/** The tokens of a v1 player's welcome: 10 a v1 mission done, at most 100. */
export function welcomeTokens(v1MissionsDone: number): number {
  return Math.min(WELCOME_TOKENS_MAX, Math.max(0, v1MissionsDone) * WELCOME_TOKENS_PER_V1_MISSION);
}
