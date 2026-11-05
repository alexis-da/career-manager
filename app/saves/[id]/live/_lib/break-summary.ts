import type { MatchEventView } from "@/src/db/calendar";
import type { Side } from "@/src/engine/match";
import { formatMinute } from "../../_lib/match-events";

/** A player's marks on the match at a break: his goals, or his red card, with their minutes (« 23' », « 90+2' »). */
export type BreakMark = { type: "GOAL" | "RED_CARD"; key: string; name: string; minutes: string[] };

/**
 * What a break's card says of one side under the score: each of its scorers once, with the minutes of his goals, then each
 * of its players sent off, in the order of the match. A player is told by his key when he has one: two players of a match
 * may share a name.
 */
export function breakMarks(events: readonly MatchEventView[], side: Side): BreakMark[] {
  const marks: BreakMark[] = [];
  for (const type of ["GOAL", "RED_CARD"] as const) {
    for (const event of events) {
      if (event.side !== side || event.type !== type || event.period === "SHOOTOUT") {
        continue;
      }
      const key = event.playerKey ?? event.playerName;
      const minute = formatMinute(event.minute, event.period);
      const mark = marks.find((candidate) => candidate.type === type && candidate.key === key);
      if (mark === undefined) {
        marks.push({ type, key, name: event.playerName, minutes: [minute] });
      } else {
        mark.minutes.push(minute);
      }
    }
  }
  return marks;
}
