import { SITE_URL } from "../config/site";
import { LOCALES, type Locale } from "./locale";

// The pages open to everyone, each in both languages at an address of its own: English at the root, the site's default
// (x-default), French under /fr, in French words. Such a page is in the language of its address, whatever the visitor's
// (proxy.ts sets PAGE_LOCALE_HEADER, src/i18n/request.ts reads it); a save's pages keep the player's language (lw_lang,
// else Accept-Language). Pure: no request is read here.

/** Each public page, by name: the language switcher sends its name, never an address (setLanguageAction). */
export const PUBLIC_PAGE_NAMES = ["home", "howToPlay", "challenge", "changelog", "about", "privacy"] as const;

export type PublicPageName = (typeof PUBLIC_PAGE_NAMES)[number];

/** A public page's address in each language. Never change one without a redirect: links to it are out there. */
export const PUBLIC_PAGES: Record<PublicPageName, Record<Locale, string>> = {
  home: { en: "/", fr: "/fr" },
  howToPlay: { en: "/how-to-play", fr: "/fr/comment-jouer" },
  challenge: { en: "/challenge", fr: "/fr/defi" },
  changelog: { en: "/changelog", fr: "/fr/nouveautes" },
  about: { en: "/about", fr: "/fr/a-propos" },
  privacy: { en: "/privacy", fr: "/fr/confidentialite" },
};

/** The language of the addresses at the root, offered to a visitor whose language is neither (hreflang x-default). */
export const DEFAULT_PUBLIC_LOCALE: Locale = "en";

/** The request header proxy.ts sets to the language of a public page's address; a forged one is removed. */
export const PAGE_LOCALE_HEADER = "x-lw-page-locale";

export function publicPath(page: PublicPageName, locale: Locale): string {
  return PUBLIC_PAGES[page][locale];
}

/** The public page an address is, and in which language, or null for any other address (a save's, a missing page…). */
export function publicPageOf(pathname: string): { page: PublicPageName; locale: Locale } | null {
  for (const page of PUBLIC_PAGE_NAMES) {
    const locale = LOCALES.find((candidate) => PUBLIC_PAGES[page][candidate] === pathname);
    if (locale !== undefined) {
      return { page, locale };
    }
  }
  return null;
}

/**
 * The language an address is in: a public page's own; French for any other address under /fr, a missing page there
 * included; null for the rest, in the player's language.
 */
export function pageLocaleOf(pathname: string): Locale | null {
  const page = publicPageOf(pathname);
  if (page !== null) {
    return page.locale;
  }
  return pathname === "/fr" || pathname.startsWith("/fr/") ? "fr" : null;
}

/** An address of the site, absolute: what the canonical link, hreflang, the sitemap and the structured data give. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/** A page's address in each language, absolute, and x-default, the English one: its hreflang, in its metadata and the sitemap. */
export function languageAlternates(page: PublicPageName): Record<Locale | "x-default", string> {
  return {
    en: absoluteUrl(PUBLIC_PAGES[page].en),
    fr: absoluteUrl(PUBLIC_PAGES[page].fr),
    "x-default": absoluteUrl(PUBLIC_PAGES[page][DEFAULT_PUBLIC_LOCALE]),
  };
}
