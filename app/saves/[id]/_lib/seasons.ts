import { seasonLabel } from "@/src/engine/world";
import { CUP_ROUND_REACHED } from "./stage";

/** « Champion » for the first, « 3e » otherwise. */
export function rankLabel(rank: number): string {
  return rank === 1 ? "Champion" : `${rank}e`;
}

/** « Promu en Division 1 » or « Relégué en Division 2 » for the managed club's season, null when it stayed. */
export function moveLabel(season: { promoted: boolean; relegated: boolean }): string | null {
  if (season.promoted) {
    return "Promu en Division 1";
  }
  return season.relegated ? "Relégué en Division 2" : null;
}

/** « Vainqueur de la Coupe », or the round reached: « Coupe : quarts de finale »; null without a cup that season. */
export function cupLabel(season: { cupRound: number | null; cupWinner: boolean }): string | null {
  if (season.cupWinner) {
    return "Vainqueur de la Coupe";
  }
  return season.cupRound === null ? null : `Coupe : ${CUP_ROUND_REACHED[season.cupRound] ?? `tour ${season.cupRound}`}`;
}

/** Won, drawn, lost: « 24-8-6 ». */
export function recordLabel(season: { won: number; drawn: number; lost: number }): string {
  return `${season.won}-${season.drawn}-${season.lost}`;
}

/** Where a season's card is drawn; format "square" for 1080 × 1080, 1200 × 630 otherwise. */
export function seasonCardPath(saveId: string, seasonId: string, format: "landscape" | "square" = "landscape"): string {
  const path = `/saves/${saveId}/seasons/${seasonId}/card`;
  return format === "square" ? `${path}?format=square` : path;
}

/** The name of a downloaded card: late-winner-saison-2026-27.png when square, …-paysage.png in landscape. */
export function seasonCardFileName(startYear: number, format: "landscape" | "square" = "square"): string {
  const suffix = format === "landscape" ? "-paysage" : "";
  return `late-winner-saison-${seasonLabel(startYear)}${suffix}.png`;
}
