import type { HistoryTier } from "@/src/engine/career-history";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { DEFAULT_COSMETIC } from "@/src/lib/cosmetics";

/**
 * The career card's drawing: bumped when the card changes, so that no browser nor the server keeps an old one (2: the
 * titles won as a national coach among the trophies).
 */
export const CAREER_CARD_VERSION = 2;

/**
 * Where the career card is drawn, in a language and a format ("square" for 1080 × 1080, 1200 × 630 otherwise), for a
 * count of completed seasons: the card shows the career as its last completed season left it, so an address always
 * gives the same image, which the browser and the server keep; the next season completed, a new address.
 */
export function careerCardPath(
  saveId: string,
  locale: Locale,
  completedSeasons: number,
  format: "landscape" | "square" = "landscape",
  dress: { frame: string | null; title: string | null } = { frame: null, title: null },
): string {
  const query = new URLSearchParams({ lang: locale, v: String(CAREER_CARD_VERSION), n: String(completedSeasons) });
  if (format === "square") {
    query.set("format", "square");
  }
  // The frame and title the player wears, when not the defaults: one image a dress, kept as the others.
  if (dress.frame !== null && dress.frame !== DEFAULT_COSMETIC.FRAME) {
    query.set("frame", dress.frame);
  }
  if (dress.title !== null && dress.title !== DEFAULT_COSMETIC.TITLE) {
    query.set("title", dress.title);
  }
  return `/saves/${saveId}/seasons/card?${query.toString()}`;
}

/** The name of a downloaded career card, in ASCII: late-winner-carriere.png, …-paysage.png in landscape. */
export function careerCardFileName(format: "landscape" | "square", t: Translator<"seasons">): string {
  return format === "landscape" ? t("history.cardFileLandscape") : t("history.cardFile");
}

/** The divisions a career went through, oldest first: « D2 → D1 → D2 »; null when it stayed in one. */
export function divisionsPath(path: readonly HistoryTier[]): string | null {
  return path.length < 2 ? null : path.map((tier) => `D${tier}`).join(" → ");
}
