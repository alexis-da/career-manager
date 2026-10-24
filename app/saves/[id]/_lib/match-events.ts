import type { MatchEventView } from "@/src/db/calendar";
import type { MatchEventType } from "@/src/engine/match";

export const REGULATION_MINUTES = 90;

export const EVENT_LABELS: Record<MatchEventType, string> = {
  GOAL: "But",
  YELLOW_CARD: "Carton jaune",
  RED_CARD: "Carton rouge",
  INJURY: "Blessure",
  SUBSTITUTION: "Remplacement",
  SHOOTOUT_GOAL: "Tir au but réussi",
  SHOOTOUT_MISS: "Tir au but manqué",
};

export const EVENT_MARKS: Record<MatchEventType, string> = {
  GOAL: "⚽",
  YELLOW_CARD: "🟨",
  RED_CARD: "🟥",
  INJURY: "✚",
  SUBSTITUTION: "⇄",
  SHOOTOUT_GOAL: "◉",
  SHOOTOUT_MISS: "✕",
};

/** « 37' », or « 90+3' » in stoppage time. */
export const formatMinute = (minute: number): string =>
  minute > REGULATION_MINUTES ? `${REGULATION_MINUTES}+${minute - REGULATION_MINUTES}'` : `${minute}'`;

/** The players of an event: scorer and assist provider, player coming on and going off, or the player alone. */
export function describeEvent(event: MatchEventView): string {
  if (event.type === "GOAL") {
    return event.relatedPlayerName === null ? event.playerName : `${event.playerName} (passe de ${event.relatedPlayerName})`;
  }
  if (event.type === "SUBSTITUTION") {
    return event.relatedPlayerName === null
      ? `Entrée de ${event.playerName}`
      : `${event.playerName} remplace ${event.relatedPlayerName}`;
  }
  return event.playerName;
}
