import { seasonLabel, seasonStartYear } from "@/src/engine/world";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { DEFAULT_COSMETIC } from "@/src/lib/cosmetics";
import { cupRoundReached, europeCompetitionName, europeStageReached } from "./stage";

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

/** A season's European run, as the managed club's SeasonResultView holds it. */
type EuropeRunOfSeason = { europeCode: string | null; europeStage: number | null; europeWinner: boolean };

/**
 * « Vainqueur de la Coupe des Lauriers », or the stage reached: « Coupe des Lauriers : quarts de finale »; null without a
 * European run that season.
 */
export function europeLabel(season: EuropeRunOfSeason, t: Translator<"stage">): string | null {
  if (season.europeCode === null) {
    return null;
  }
  const competition = europeCompetitionName(season.europeCode, t);
  if (season.europeWinner) {
    return t("europeWinner", { competition });
  }
  return season.europeStage === null ? null : t("europeReachedLine", { competition, round: europeStageReached(season.europeStage, t) });
}

/** A European competition's winner of a season, by its displayed name (getEuropeWinners, src/db/europe-results.ts). */
export type EuropeWinnerOfSeason = { code: string; club: string; managed: boolean };

/** A line of a season's review on Europe: the competition's code, its words, and whether it is the managed club's title or its own run. */
export type EuropeReviewLine = { code: string; text: string; won: boolean; own: boolean };

/**
 * The European lines of a season's review, as its cup line: the managed club's run first, with the winner when another
 * club won (« Coupe des Lauriers : quarts de finale · vainqueur : … »), then each other competition of that year with its
 * winner (« Coupe des Fanions · vainqueur : … »), in the order of the winners. A competition the managed club won without
 * its result saying so (a row rebuilt lazily, which has no European run) says it as its own title.
 */
export function europeReviewLines(
  season: EuropeRunOfSeason,
  winners: readonly EuropeWinnerOfSeason[],
  tStage: Translator<"stage">,
  t: Translator<"seasons">,
): EuropeReviewLine[] {
  const lines: EuropeReviewLine[] = [];
  const own = europeLabel(season, tStage);
  if (season.europeCode !== null && own !== null) {
    const winner = winners.find(({ code }) => code === season.europeCode);
    const won = season.europeWinner || winner?.managed === true;
    const text = won
      ? tStage("europeWinner", { competition: europeCompetitionName(season.europeCode, tStage) })
      : winner === undefined
        ? own
        : t("completed.europeWinner", { competition: own, club: winner.club });
    lines.push({ code: season.europeCode, text, won, own: true });
  }
  for (const winner of winners) {
    if (winner.code === season.europeCode) {
      continue;
    }
    const competition = europeCompetitionName(winner.code, tStage);
    lines.push({
      code: winner.code,
      text: winner.managed ? tStage("europeWinner", { competition }) : t("completed.europeWinner", { competition, club: winner.club }),
      won: winner.managed,
      own: false,
    });
  }
  return lines;
}

/** Won, drawn, lost: « 24-8-6 ». */
export function recordLabel(season: { won: number; drawn: number; lost: number }): string {
  return `${season.won}-${season.drawn}-${season.lost}`;
}

/** Whether a completed season is a save's last: on the save's date, the season in progress is the one after it. */
export function isLastCompletedSeason(startYear: number, currentDate: Date): boolean {
  return seasonStartYear(currentDate) === startYear + 1;
}

/**
 * The card's drawing: bumped when the card changes, so that no browser nor the server keeps an old one (3: the national
 * coach's line at its foot).
 */
export const SEASON_CARD_VERSION = 3;

/**
 * Where a season's card is drawn, in a language and a format ("square" for 1080 × 1080, 1200 × 630 otherwise): an
 * address that always gives the same image, which the browser and the server keep (the route's cache).
 */
export function seasonCardPath(
  saveId: string,
  seasonId: string,
  locale: Locale,
  format: "landscape" | "square" = "landscape",
  dress: { frame: string | null; title: string | null } = { frame: null, title: null },
): string {
  const query = new URLSearchParams({ lang: locale, v: String(SEASON_CARD_VERSION) });
  if (format === "square") {
    query.set("format", "square");
  }
  // The frame and title the player wears (missions v2), when not the defaults: one image a dress, kept as the others.
  if (dress.frame !== null && dress.frame !== DEFAULT_COSMETIC.FRAME) {
    query.set("frame", dress.frame);
  }
  if (dress.title !== null && dress.title !== DEFAULT_COSMETIC.TITLE) {
    query.set("title", dress.title);
  }
  return `/saves/${saveId}/seasons/${seasonId}/card?${query.toString()}`;
}

/**
 * The name of a downloaded card, in ASCII: late-winner-saison-2026-27.png when square, …-paysage.png in landscape
 * (late-winner-season-2026-27.png and …-landscape.png in English).
 */
export function seasonCardFileName(startYear: number, format: "landscape" | "square", t: Translator<"seasons">): string {
  const season = seasonLabel(startYear);
  return format === "landscape" ? t("cardFileLandscape", { season }) : t("cardFile", { season });
}
