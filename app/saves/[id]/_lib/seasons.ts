import { seasonLabel, seasonStartYear } from "@/src/engine/world";
import type { Translator } from "@/src/i18n/translator";
import { cupRoundReached } from "./stage";

/** « Champion » for the first, « 3e » otherwise (« Champions », « 3rd » in English). */
export function rankLabel(rank: number, t: Translator<"seasons">): string {
  return rank === 1 ? t("champion") : t("rank", { rank });
}

/** « Promu en Division 1 » or « Relégué en Division 2 » for the managed club's season, null when it stayed. */
export function moveLabel(season: { promoted: boolean; relegated: boolean }, t: Translator<"seasons">): string | null {
  if (season.promoted) {
    return t("promoted");
  }
  return season.relegated ? t("relegated") : null;
}

/** « Vainqueur de la Coupe », or the round reached: « Coupe : quarts de finale »; null without a cup that season. */
export function cupLabel(season: { cupRound: number | null; cupWinner: boolean }, t: Translator<"stage">): string | null {
  if (season.cupWinner) {
    return t("cupWinner");
  }
  return season.cupRound === null ? null : t("cupReached", { round: cupRoundReached(season.cupRound, t) });
}

/** Won, drawn, lost: « 24-8-6 ». */
export function recordLabel(season: { won: number; drawn: number; lost: number }): string {
  return `${season.won}-${season.drawn}-${season.lost}`;
}

/** Whether a completed season is a save's last: on the save's date, the season in progress is the one after it. */
export function isLastCompletedSeason(startYear: number, currentDate: Date): boolean {
  return seasonStartYear(currentDate) === startYear + 1;
}

/** Where a season's card is drawn; format "square" for 1080 × 1080, 1200 × 630 otherwise. */
export function seasonCardPath(saveId: string, seasonId: string, format: "landscape" | "square" = "landscape"): string {
  const path = `/saves/${saveId}/seasons/${seasonId}/card`;
  return format === "square" ? `${path}?format=square` : path;
}

/**
 * The name of a downloaded card, in ASCII: late-winner-saison-2026-27.png when square, …-paysage.png in landscape
 * (late-winner-season-2026-27.png and …-landscape.png in English).
 */
export function seasonCardFileName(startYear: number, format: "landscape" | "square", t: Translator<"seasons">): string {
  const season = seasonLabel(startYear);
  return format === "landscape" ? t("cardFileLandscape", { season }) : t("cardFile", { season });
}
