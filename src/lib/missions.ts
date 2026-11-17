import type { MatchResult, Side } from "../engine/match";
import { makeRng, weightedIndex } from "./rng";

// The mission of the day (CLAUDE.md « Mission du jour »): one a player a UTC day, drawn from the day and the player, the
// same in every career of theirs but a challenge one, done in any of them, and nothing it brings changes the game. Pure:
// the catalogue, the draw, what each move of the player brings to a mission, and the streak its completions make. Their
// rows are src/db/missions.ts's; never anything of the simulation, which they only read once a move is played.

/** The missions, those that lead to a live match first. A name is kept with each day's mission: never rename one. */
export const MISSION_KINDS = [
  "PLAY_LIVE",
  "LIVE_SUBSTITUTION",
  "LIVE_INSTRUCTION",
  "LIVE_WIN",
  "WIN",
  "CLEAN_SHEET",
  "PLAY_MATCHES",
  "START_YOUTH",
] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];

/** The missions played in a live match: the draw gives them LIVE_MISSIONS_SHARE of the days. */
export const LIVE_MISSIONS: readonly MissionKind[] = ["PLAY_LIVE", "LIVE_SUBSTITUTION", "LIVE_INSTRUCTION", "LIVE_WIN"];

/**
 * Each mission's weight in the draw, in hundredths of the days: 55 for those of a live match, its first step, playing
 * one, the most often; 45 for the others, each doable simulated in a short session.
 */
export const MISSION_WEIGHTS: Readonly<Record<MissionKind, number>> = {
  PLAY_LIVE: 19,
  LIVE_SUBSTITUTION: 12,
  LIVE_INSTRUCTION: 12,
  LIVE_WIN: 12,
  WIN: 12,
  CLEAN_SHEET: 11,
  PLAY_MATCHES: 11,
  START_YOUTH: 11,
};

/** How many times a mission's move must happen: three matches, once for every other. */
export const MISSION_TARGETS: Readonly<Record<MissionKind, number>> = {
  PLAY_LIVE: 1,
  LIVE_SUBSTITUTION: 1,
  LIVE_INSTRUCTION: 1,
  LIVE_WIN: 1,
  WIN: 1,
  CLEAN_SHEET: 1,
  PLAY_MATCHES: 3,
  START_YOUTH: 1,
};

/** The oldest age, at the match's date, of a player START_YOUTH asks to start, as the season's youth objective. */
export const YOUTH_MAX_AGE = 21;

/**
 * The days before a mission the draw walks from, each excluding the day before's: two days in a row never have the same
 * mission, but where the walks from two days apart have not met yet (once in about a hundred thousand days).
 */
const DRAW_LOOKBACK_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC day `days` after `day` (before when negative), both « YYYY-MM-DD ». */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * A day's draw for a player: a mission by weight, from the day and the player only; when it is `excluded` (the day
 * before's), another of the rest, from the same stream. The day before's mission only matters when the first draw is it.
 */
function drawOn(userId: string, day: string, excluded: MissionKind | null): MissionKind {
  const rng = makeRng(`mission:${userId}:${day}`);
  const first = MISSION_KINDS[weightedIndex(rng, MISSION_KINDS.map((kind) => MISSION_WEIGHTS[kind]))];
  if (first !== excluded) {
    return first;
  }
  const others = MISSION_KINDS.filter((kind) => kind !== excluded);
  return others[weightedIndex(rng, others.map((kind) => MISSION_WEIGHTS[kind]))];
}

/** The mission of a player on a UTC day: the same for every career of theirs, and never the day before's. */
export function dailyMissionKind(userId: string, day: string): MissionKind {
  let kind: MissionKind | null = null;
  for (let back = DRAW_LOOKBACK_DAYS; back >= 0; back--) {
    kind = drawOn(userId, addDays(day, -back), kind);
  }
  if (kind === null) {
    throw new Error("The draw walks at least the day itself");
  }
  return kind;
}

/** What a finished match of the managed club says to a mission. */
export type MatchFacts = {
  live: boolean; // played live to its end
  won: boolean; // on the shoot-out when there was one
  cleanSheet: boolean; // no goal conceded, extra time included
  starters: string[]; // the managed club's starting eleven, by player key
};

/**
 * A move of the player in a career but a challenge one: a match of the managed club played to its end (`youthStarted`:
 * a starter of YOUTH_MAX_AGE or younger at its date, looked up only for START_YOUTH, null otherwise), or, at a pause of
 * a live match, a substitution or an instruction of theirs.
 */
export type MissionMove =
  | { kind: "match"; facts: MatchFacts; youthStarted: boolean | null }
  | { kind: "substitution" }
  | { kind: "instruction" };

/** What a move brings to a mission: one step of its target, or nothing. */
export function missionStep(kind: MissionKind, move: MissionMove): number {
  const match = move.kind === "match" ? move.facts : null;
  switch (kind) {
    case "PLAY_LIVE":
      return match?.live === true ? 1 : 0;
    case "LIVE_SUBSTITUTION":
      return move.kind === "substitution" ? 1 : 0;
    case "LIVE_INSTRUCTION":
      return move.kind === "instruction" ? 1 : 0;
    case "LIVE_WIN":
      return match?.live === true && match.won ? 1 : 0;
    case "WIN":
      return match?.won === true ? 1 : 0;
    case "CLEAN_SHEET":
      return match?.cleanSheet === true ? 1 : 0;
    case "PLAY_MATCHES":
      return match === null ? 0 : 1;
    case "START_YOUTH":
      return move.kind === "match" && move.youthStarted === true ? 1 : 0;
  }
}

/** The steps a player's moves bring to a mission, at most what is left of it. */
export function missionSteps(kind: MissionKind, moves: readonly MissionMove[], left: number): number {
  return Math.min(
    left,
    moves.reduce((sum, move) => sum + missionStep(kind, move), 0),
  );
}

/** What a finished match of the managed club, on its side, says to a mission. */
export function matchFacts(result: MatchResult, side: Side, live: boolean): MatchFacts {
  const other: Side = side === "home" ? "away" : "home";
  const goals = { home: result.homeGoals, away: result.awayGoals };
  const penalties = { home: result.homePenalties ?? 0, away: result.awayPenalties ?? 0 };
  const decider = result.decidedBy === "PENALTIES" ? penalties : goals;
  return {
    live,
    won: decider[side] > decider[other],
    cleanSheet: goals[other] === 0,
    starters: result.appearances.filter((appearance) => appearance.side === side && appearance.from === 0).map((appearance) => appearance.playerId),
  };
}

/** A completed mission's place in its player's streak: its day, the days in a row it makes, and the record then. */
export type StreakMark = { day: string; streak: number; best: number };

/** The streak a mission completed on `day` makes, after the player's latest completed one before it (null: none). */
export function streakAfter(previous: StreakMark | null, day: string): { streak: number; best: number } {
  const streak = previous !== null && previous.day === addDays(day, -1) ? previous.streak + 1 : 1;
  return { streak, best: Math.max(previous?.best ?? 0, streak) };
}

/**
 * The player's streak on `today`, from their latest completed mission: alive while it was today's or yesterday's, the
 * last one's length otherwise (`last`, null without one), and their record.
 */
export type StreakView = { current: number; best: number; last: number | null };

export function streakOn(latest: StreakMark | null, today: string): StreakView {
  if (latest === null) {
    return { current: 0, best: 0, last: null };
  }
  const alive = latest.day === today || latest.day === addDays(today, -1);
  return { current: alive ? latest.streak : 0, best: latest.best, last: alive ? null : latest.streak };
}
