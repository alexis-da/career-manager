import type { MatchEventView } from "@/src/db/calendar";
import { HALF_TIME_MINUTE, REGULATION_MINUTES } from "@/src/engine/balance";
import { countFor } from "./match-stats";

/** A moment of the match that is no event; its name is a message, live.marker. */
export type FeedMarker = "kickOff" | "halfTime" | "regulationEnd";

type Score = { home: number; away: number };

export type FeedEntry =
  | { kind: "event"; event: MatchEventView }
  | { kind: "marker"; marker: FeedMarker; minute: number; score: Score | null };

const KICK_OFF_MINUTE = 1;

const toEntry = (event: MatchEventView): FeedEntry => ({ kind: "event", event });

function marker(name: FeedMarker, minute: number, score: Score | null = null): FeedEntry {
  return { kind: "marker", marker: name, minute, score };
}

function scoreAfter(events: readonly MatchEventView[]): Score {
  const goals = events.filter((event) => event.type === "GOAL");
  return { home: countFor(goals, "home"), away: countFor(goals, "away") };
}

/**
 * What the match feed lists, newest first, from the events already shown: the kick-off, always last; half-time once 45' is
 * reached, between the first half's events (up to 45') and the second's (from 46', half-time substitutions included); and,
 * when the match goes to extra time, the end of normal time at 90', its stoppage time below it, extra time's events above.
 */
export function feedEntries(shown: readonly MatchEventView[], minute: number, extraTime: boolean): FeedEntry[] {
  const regular = shown.filter((event) => event.period === "REGULAR");
  const firstHalf = regular.filter((event) => event.minute <= HALF_TIME_MINUTE);
  const secondHalf = regular.filter((event) => event.minute > HALF_TIME_MINUTE);
  return [
    marker("kickOff", KICK_OFF_MINUTE),
    ...firstHalf.map(toEntry),
    ...(minute >= HALF_TIME_MINUTE ? [marker("halfTime", HALF_TIME_MINUTE, scoreAfter(firstHalf))] : []),
    ...secondHalf.map(toEntry),
    ...(extraTime && minute >= REGULATION_MINUTES ? [marker("regulationEnd", REGULATION_MINUTES, scoreAfter(regular))] : []),
    ...shown.filter((event) => event.period === "EXTRA_TIME").map(toEntry),
  ].toReversed();
}
