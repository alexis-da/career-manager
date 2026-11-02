import type { MatchEventType, Side } from "@/src/engine/match";

/** The events the live screen compares, in its order; a shoot-out's kicks are not among them. */
const STAT_TYPES = ["GOAL", "YELLOW_CARD", "RED_CARD", "SUBSTITUTION", "INJURY"] as const satisfies readonly MatchEventType[];

/** What each side has of an event; its name is a message, live.stats. */
export type MatchStat = { type: (typeof STAT_TYPES)[number]; home: number; away: number };

/** How many of these are a side's. */
export const countFor = (items: readonly { side: Side }[], side: Side): number => items.filter((item) => item.side === side).length;

/** The two sides' counts of the events given: those already shown, so that the figures follow the clock. */
export function matchStats(events: readonly { type: MatchEventType; side: Side }[]): MatchStat[] {
  return STAT_TYPES.map((type) => {
    const ofType = events.filter((event) => event.type === type);
    return { type, home: countFor(ofType, "home"), away: countFor(ofType, "away") };
  });
}
