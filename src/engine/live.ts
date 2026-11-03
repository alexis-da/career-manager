import { ChoiceError, decideChoice, openChoice, type Decision } from "./choices";
import {
  applyHalfTimeChoice,
  automaticHalfTimeChoice,
  HalfTimeChoiceError,
  nextSegment,
  playShootout,
  simulateSegment,
  type HalfTimeChoice,
  type MatchState,
  type Side,
} from "./match";

/**
 * Where the managed club's match waits for its manager: between two segments (IN_PLAY), at half-time, at the end of
 * regulation time of a cup tie level after 90 minutes, between the two periods of extra time.
 */
export type PausePhase = "IN_PLAY" | "HALF_TIME" | "REGULATION_END" | "EXTRA_TIME_BREAK";

/** A pause of a match: its phase and the minutes played. A resume names the one it plays on from. */
export type LivePause = { phase: PausePhase; minute: number };

const PAUSE_PHASES: readonly string[] = ["IN_PLAY", "HALF_TIME", "REGULATION_END", "EXTRA_TIME_BREAK"];

const isPausePhase = (phase: string): phase is PausePhase => PAUSE_PHASES.includes(phase);

/** The pause a match waits at; a match before kick-off or over waits at none. */
export function pauseOf(state: MatchState): LivePause | null {
  return isPausePhase(state.phase) ? { phase: state.phase, minute: state.played } : null;
}

/** What the manager brings to a pause: his changes at a break (null: the automatic ones), his decision on a choice event (null: the assistant's). */
export type PlayOnInput = { changes?: HalfTimeChoice | null; decision?: Decision | null };

/**
 * How far a match plays on: one segment ("segment": the next boundary, where the manager could ask for a pause), to the
 * next pause he must act at ("pause": a choice event, a break, the end), or to the next break, his assistant deciding the
 * choice events on the way ("break").
 */
export type PlayOnUntil = "segment" | "pause" | "break";

const SIDES: readonly Side[] = ["home", "away"];

/**
 * Plays the managed club's match on from where it waits, kick-off included: first what the manager brings to the pause,
 * his decision on the open choice event, his changes at half-time (the opponent's automatic ones with them, in the
 * order of a match played without a pause) or at the end of regulation time; then its segments, each boundary opening
 * the choice event planned there, up to where `until` says; a level extra time ends with the shoot-out at once. Taking
 * the automatic changes and the assistant's decisions at every pause plays the very match simulateMatch plays with
 * assistantChoices. Throws HalfTimeChoiceError for changes away from a break, ChoiceError for a decision without an open
 * event, as for an invalid choice.
 */
export function playOn(
  paused: MatchState,
  managedSide: Side,
  matchSeed: string,
  input: PlayOnInput = {},
  until: PlayOnUntil = "segment",
): MatchState {
  const changes = input.changes ?? null;
  const open = paused.choices?.pending ?? null;
  if (changes !== null && paused.phase !== "HALF_TIME" && paused.phase !== "REGULATION_END") {
    throw new HalfTimeChoiceError("not-half-time");
  }
  if (input.decision !== undefined && input.decision !== null && open === null) {
    throw new ChoiceError("no-event");
  }

  let state = paused;
  if (open !== null) {
    state = decideChoice(state, matchSeed, input.decision ?? null);
  } else if (state.phase === "HALF_TIME") {
    state = SIDES.reduce(
      (current, side) =>
        applyHalfTimeChoice(current, side, side === managedSide && changes !== null ? changes : automaticHalfTimeChoice(current, side)),
      state,
    );
  } else if (state.phase === "REGULATION_END" && changes !== null) {
    state = applyHalfTimeChoice(state, managedSide, changes);
  }

  for (;;) {
    state = simulateSegment(state, matchSeed, nextSegment(state));
    if (state.phase === "SHOOTOUT") {
      return playShootout(state, matchSeed);
    }
    if (state.phase === "FULL_TIME" || state.phase === "HALF_TIME" || state.phase === "REGULATION_END") {
      return state;
    }
    state = openChoice(state, matchSeed);
    if (state.choices?.pending) {
      if (until !== "break") {
        return state;
      }
      state = decideChoice(state, matchSeed, null);
    }
    if (until === "segment") {
      return state;
    }
  }
}
