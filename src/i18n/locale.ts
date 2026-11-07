// The game's two languages: French, its own, and English. A public page is in its address's (src/i18n/public-pages.ts);
// any other page in the player's language: the one they chose with the language switcher (the lw_lang cookie), else the
// one their browser prefers of the two (Accept-Language): negotiateLocale, read for each request by src/i18n/request.ts.
// Pure: no request, no cookie read here.

export const LOCALES = ["fr", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** The tags Intl formats each language with: British English for dates and amounts. */
export const INTL_LOCALES: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

/** The comfort cookie that keeps the language a player chose (app/privacy): « fr » or « en », for a year. */
export const LOCALE_COOKIE = "lw_lang";

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

type Rank = { quality: number; index: number };

/**
 * The best rank an Accept-Language header gives a language, any region of it: its highest quality, then its first
 * position. Null when the header does not accept it: not named, a quality of 0, or one that cannot be read. A wildcard
 * names no language in particular.
 */
function rankOf(header: string, language: Locale): Rank | null {
  let best: Rank | null = null;
  for (const [index, part] of header.split(",").entries()) {
    const [range, ...parameters] = part.split(";").map((piece) => piece.trim().toLowerCase());
    if (range.split("-")[0] !== language) {
      continue;
    }
    const q = parameters.find((parameter) => parameter.startsWith("q="));
    const quality = q === undefined ? 1 : Number(q.slice(2));
    if (!(quality > 0 && quality <= 1)) {
      continue;
    }
    if (best === null || quality > best.quality) {
      best = { quality, index };
    }
  }
  return best;
}

/**
 * The language a visitor would rather read, when they say so: the one they chose (lw_lang), else the one their browser
 * prefers of the two, when it sends Accept-Language. Null without either: a crawler, which sends neither, is offered no
 * other language than its page's (app/_components/language-banner.tsx).
 */
export function preferredLocale(cookie: string | undefined, acceptLanguage: string | null): Locale | null {
  if (isLocale(cookie)) {
    return cookie;
  }
  return acceptLanguage === null || acceptLanguage.trim() === "" ? null : negotiateLocale(undefined, acceptLanguage);
}

/**
 * The player's language: the one they chose (the lw_lang cookie, when it holds one), else French when their browser
 * prefers it to English (by quality, then by order), else English, a browser that names neither included.
 */
export function negotiateLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) {
    return cookie;
  }
  const french = rankOf(acceptLanguage ?? "", "fr");
  const english = rankOf(acceptLanguage ?? "", "en");
  if (french === null) {
    return "en";
  }
  const prefersFrench =
    english === null ||
    french.quality > english.quality ||
    (french.quality === english.quality && french.index < english.index);
  return prefersFrench ? "fr" : "en";
}
