import type { MatchEventView } from "@/src/db/calendar";
import type { MatchEventType } from "@/src/engine/match";
import type { Translator } from "@/src/i18n/translator";

export const REGULATION_MINUTES = 90;

// An event's name (« But », « Carton jaune »…) is a message: events.type.

export const EVENT_MARKS: Record<MatchEventType, string> = {
  GOAL: "⚽",
  YELLOW_CARD: "🟨",
  RED_CARD: "🟥",
  INJURY: "✚",
  SUBSTITUTION: "⇄",
  SHOOTOUT_GOAL: "◉",
  SHOOTOUT_MISS: "✕",
};

/** « 37' », « 90+3' » in stoppage time, « 104' » in extra time (whose minutes follow the 90th). */
export const formatMinute = (minute: number, period: MatchEventView["period"] = "REGULAR"): string =>
  period === "REGULAR" && minute > REGULATION_MINUTES ? `${REGULATION_MINUTES}+${minute - REGULATION_MINUTES}'` : `${minute}'`;

/** A shoot-out kick, with the shoot-out's score once it is taken. */
export type ShootoutKick = { event: MatchEventView; scored: boolean; home: number; away: number };

/** The kicks of a shoot-out in order, each with the running score. */
export function shootoutKicks(events: readonly MatchEventView[]): ShootoutKick[] {
  let home = 0;
  let away = 0;
  return events
    .filter((event) => event.period === "SHOOTOUT")
    .map((event) => {
      const scored = event.type === "SHOOTOUT_GOAL";
      if (scored) {
        if (event.side === "home") {
          home++;
        } else {
          away++;
        }
      }
      return { event, scored, home, away };
    });
}

/** The players of an event: scorer and assist provider, player coming on and going off, or the player alone. */
export function describeEvent(event: MatchEventView, t: Translator<"events">): string {
  if (event.type === "GOAL") {
    return event.relatedPlayerName === null
      ? event.playerName
      : t("goal", { player: event.playerName, assist: event.relatedPlayerName });
  }
  if (event.type === "SUBSTITUTION") {
    return event.relatedPlayerName === null
      ? t("substitutionOn", { player: event.playerName })
      : t("substitution", { player: event.playerName, replaced: event.relatedPlayerName });
  }
  return event.playerName;
}
