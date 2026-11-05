import type { MatchBreak } from "@/src/db/live-match";
import { EXTRA_TIME_END_MINUTE, HALF_TIME_MINUTE, REGULATION_MINUTES } from "@/src/engine/balance";
import type { LivePause, PausePhase } from "@/src/engine/live";
import type { DecidedBy } from "@/src/engine/match";

// The server plays the managed club's match one segment of 15 minutes at a time, and the page only ever has what is
// played: its clock runs up to where the stored match waits (a pause), then asks for what follows.

/**
 * How long the ways on of a stop stay out of reach once its card or its Coaching panel opens: on a phone they come right
 * under the bar's buttons, and a second tap meant for them, or one that came as the clock reached the stop, would resume
 * the match for good.
 */
export const RESUME_GUARD_MS = 500;

/**
 * The breaks of a match, where it stops by itself with a card of their own: half-time, and the end of regulation time of
 * a cup tie level after 90 minutes. Between two segments, it stops on a choice event, or where the player asked for his
 * Coaching panel. The panel never opens by itself: at a break, from its card or the bar; after a choice event, from its
 * card; at a stop asked for, there, since he asked.
 */
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

/** How far the server plays from a pause: its next segment, on to the next pause the player acts at, or to the next break. */
export type StepUntil = "segment" | "pause" | "break";

/**
 * One segment while the clock runs, the player watching, who may ask for a pause at its end; without motion, on to the
 * next pause he acts at, a choice event or a break, shown at once; once « live-skip » is pressed, on to the next break or
 * the end, his assistant deciding the choice events on the way.
 */
export function stepUntil(skipping: boolean, reducedMotion: boolean): StepUntil {
  return skipping ? "break" : reducedMotion ? "pause" : "segment";
}

/**
 * Where the Coaching button stops the match while its clock runs: the next boundary not played yet, the pause the clock
 * runs to, between two segments (15', 30', 60', 75') or the two periods of extra time (105'). Half-time stops by itself,
 * its card offering the panel. None in the last segment of regular time or of extra time, whatever follows it: a cup tie level after 90
 * minutes stops there by itself, and a button that said so would tell a draw before it is played.
 */
export type CoachingTarget = { minute: number } | "halfTime" | null;

export function coachingTarget(pause: LivePause | null): CoachingTarget {
  if (pause === null || pause.phase === "REGULATION_END") {
    return null;
  }
  return pause.phase === "HALF_TIME" ? "halfTime" : { minute: pause.minute };
}
