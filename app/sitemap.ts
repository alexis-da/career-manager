import type { MetadataRoute } from "next";
import { absoluteUrl, languageAlternates, PUBLIC_PAGE_NAMES, publicPath } from "@/src/i18n/public-pages";

/** English first: the site's default language (x-default). */
const SITEMAP_LOCALES = ["en", "fr"] as const;

/**
 * /sitemap.xml: every public page at its address in each language, each with all its languages (hreflang en, fr and
 * x-default), as its own metadata gives them. No save's page: a player's own.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGE_NAMES.flatMap((page) =>
    SITEMAP_LOCALES.map((locale) => ({
      url: absoluteUrl(publicPath(page, locale)),
      alternates: { languages: languageAlternates(page) },
    })),
  );
}
