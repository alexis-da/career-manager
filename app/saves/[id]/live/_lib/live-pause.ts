import type { MatchBreak } from "@/src/db/live-match";
import { EXTRA_TIME_END_MINUTE, HALF_TIME_MINUTE, REGULATION_MINUTES } from "@/src/engine/balance";
import type { LivePause, PausePhase } from "@/src/engine/live";
import type { DecidedBy } from "@/src/engine/match";

// The server plays the managed club's match one segment of 15 minutes at a time, and the page only ever has what is
// played: its clock runs up to where the stored match waits (a pause), then asks for what follows.

/** The pauses with the Coaching panel: half-time, and the end of regulation time of a cup tie level after 90 minutes. */
export function isMatchBreak(phase: PausePhase): phase is MatchBreak {
  return phase === "HALF_TIME" || phase === "REGULATION_END";
}

/** A pause's identity, « IN_PLAY:15 »: what follows it is asked for once. */
export const pauseKey = ({ phase, minute }: LivePause): string => `${phase}:${minute}`;

/**
 * The minute the clock starts from: kick-off with ?rejouer=1 (« Jouer la journée »); without it, the minute the match
 * waits at, where the player left it; kick-off again for a match over, replayed whole.
 */
export function startMinute(pause: LivePause | null, replay: boolean): number {
  return replay || pause === null ? 0 : pause.minute;
}

/**
 * Whether the match runs past the 90th minute, as far as the page knows: waiting at the end of regulation time or
 * between the two periods of extra time, or decided after extra time. A match waiting before the 90th never says so.
 */
export function goesToExtraTime(pause: LivePause | null, decidedBy: DecidedBy | null): boolean {
  return pause === null
    ? decidedBy === "EXTRA_TIME" || decidedBy === "PENALTIES"
    : pause.phase === "REGULATION_END" || pause.phase === "EXTRA_TIME_BREAK";
}

/** The minute the clock runs up to: the pause the match waits at; once over, the 90th, or the 120th after extra time. */
export function endMinute(pause: LivePause | null, decidedBy: DecidedBy | null): number {
  if (pause !== null) {
    return pause.minute;
  }
  return goesToExtraTime(null, decidedBy) ? EXTRA_TIME_END_MINUTE : REGULATION_MINUTES;
}

/**
 * Where « live-skip » leads: to half-time while the match has not reached it, to the result after. A cup tie level
 * after 90 minutes still stops at the end of regulation time on the way, but the button never announces that break:
 * it would tell a draw before the minutes that make it are played.
 */
export type SkipTarget = "halfTime" | "result";

export function skipTarget(pause: LivePause | null): SkipTarget {
  return pause !== null && pause.minute <= HALF_TIME_MINUTE ? "halfTime" : "result";
}

/** How far the server plays from a pause between two segments: its next segment, or on to the next break or the end. */
export type StepUntil = "segment" | "break";

/**
 * One segment while the clock runs, the player watching; on to the next break, or the end, once « live-skip » is
 * pressed, or without motion, which shows the breaks and the end at once.
 */
export function stepUntil(skipping: boolean, reducedMotion: boolean): StepUntil {
  return skipping || reducedMotion ? "break" : "segment";
}
