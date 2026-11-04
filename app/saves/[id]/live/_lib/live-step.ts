import type { FixtureWithEvents } from "@/src/db/calendar";
import type { HalfTimeTeam, LivePauseView, LiveStep } from "@/src/db/live-match";
import type { InstructionSpan } from "@/src/engine/instructions";

/**
 * What the live page has of the managed club's match: its events and decisions up to where it is played, never further,
 * the instructions the club has played its segments with (null for a match over read again: its state, which kept them,
 * is gone), the pause it waits at (null once over) with its choice event, and the managed club there, for the Coaching
 * panel.
 */
export type LiveData = {
  match: FixtureWithEvents;
  pause: LivePauseView | null;
  team: HalfTimeTeam | null;
  instructions: InstructionSpan[] | null;
};

/**
 * The page's data once a step is played: the step's events and decisions added, each once (the page may have read them
 * again meanwhile), the instructions played so far, the pause it waits at now, and how the match ended once over.
 */
export function withStep(data: LiveData, step: LiveStep): LiveData {
  const known = new Set(data.match.events.map((event) => event.id));
  const decided = new Set(data.match.decisions.map((decision) => decision.sequence));
  return {
    match: {
      ...data.match,
      events: [...data.match.events, ...step.events.filter((event) => !known.has(event.id))],
      decisions: [...data.match.decisions, ...step.decisions.filter((decision) => !decided.has(decision.sequence))],
      ...(step.result === null ? {} : { played: true, ...step.result }),
    },
    pause: step.pause,
    team: step.team,
    instructions: step.instructions,
  };
}

/**
 * The page's data once the server has read it again (a step refused, or the match over): the server's, but for the
 * instructions of a match over, which it no longer has: those the page's steps brought to the final whistle stay, for
 * the clock still running through its last segment. Taken to its end from another tab, the match has none: the page's
 * would stop where its steps did.
 */
export function readAgain(data: LiveData, read: LiveData): LiveData {
  const ended = data.pause === null && read.instructions === null && read.match.id === data.match.id;
  return ended ? { ...read, instructions: data.instructions } : read;
}
