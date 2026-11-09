import type { DecisionView, MatchEventView } from "@/src/db/calendar";
import { HALF_TIME_MINUTE, REGULATION_MINUTES } from "@/src/engine/balance";
import { decisionMoment, withDecisions, type MatchLine, type MatchMoment } from "../../_lib/decisions";
import type { InstructionChange } from "../../_lib/instruction-changes";
import { countFor } from "./match-stats";

/** A moment of the match that is no event; its name is a message, live.marker. */
export type FeedMarker = "kickOff" | "halfTime" | "regulationEnd";

type Score = { home: number; away: number };

/** A line of the feed: an event, a decision of the managed club, or a moment of the match. */
export type FeedEntry = MatchLine | { kind: "marker"; marker: FeedMarker; minute: number; score: Score | null };

const KICK_OFF_MINUTE = 1;

function marker(name: FeedMarker, minute: number, score: Score | null = null): FeedEntry {
  return { kind: "marker", marker: name, minute, score };
}

function scoreAfter(events: readonly MatchEventView[]): Score {
  const goals = events.filter((event) => event.type === "GOAL");
  return { home: countFor(goals, "home"), away: countFor(goals, "away") };
}

/** Where a line falls in the match: an event's minute, or a decision's or a change's, the minute after its boundary. */
const momentOf = (line: MatchLine): MatchMoment =>
  line.kind === "event" ? line.event : line.kind === "decision" ? decisionMoment(line.decision) : line.change;

/**
 * What the match feed lists, newest first, from the events already shown and the managed club's decisions taken by then:
 * the kick-off, always last; half-time once 45' is reached, between the first half's events (up to 45') and the second's
 * (from 46', half-time substitutions included); and, when the match goes to extra time, the end of normal time at 90', its
 * stoppage time below it, extra time's events above. A decision and a change of instruction are at the minute after their
 * boundary, below the events of that minute, which a decision caused (withDecisions).
 */
export function feedEntries(
  shown: readonly MatchEventView[],
  decisions: readonly DecisionView[],
  minute: number,
  extraTime: boolean,
  changes: readonly InstructionChange[] = [],
): FeedEntry[] {
  const lines = withDecisions(shown, decisions, changes);
  const regular = lines.filter((line) => momentOf(line).period === "REGULAR");
  const regularEvents = shown.filter((event) => event.period === "REGULAR");
  return [
    marker("kickOff", KICK_OFF_MINUTE),
    ...regular.filter((line) => momentOf(line).minute <= HALF_TIME_MINUTE),
    ...(minute >= HALF_TIME_MINUTE
      ? [marker("halfTime", HALF_TIME_MINUTE, scoreAfter(regularEvents.filter((event) => event.minute <= HALF_TIME_MINUTE)))]
      : []),
    ...regular.filter((line) => momentOf(line).minute > HALF_TIME_MINUTE),
    ...(extraTime && minute >= REGULATION_MINUTES ? [marker("regulationEnd", REGULATION_MINUTES, scoreAfter(regularEvents))] : []),
    ...lines.filter((line) => momentOf(line).period === "EXTRA_TIME"),
  ].toReversed();
}
