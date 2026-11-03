import type { FixtureWithEvents } from "@/src/db/calendar";
import type { HalfTimeTeam, LivePauseView, LiveStep } from "@/src/db/live-match";

/**
 * What the live page has of the managed club's match: its events and decisions up to where it is played, never further,
 * the pause it waits at (null once over) with its choice event, and the managed club there, for the Coaching panel.
 */
export type LiveData = { match: FixtureWithEvents; pause: LivePauseView | null; team: HalfTimeTeam | null };

/**
 * The page's data once a step is played: the step's events and decisions added, each once (the page may have read them
 * again meanwhile), the pause it waits at now, and how the match ended once over.
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
  };
}
