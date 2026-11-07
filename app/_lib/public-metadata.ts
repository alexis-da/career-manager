import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/src/i18n/locale";
import { absoluteUrl, languageAlternates, publicPath, type PublicPageName } from "@/src/i18n/public-pages";
import { SHARE_IMAGE_ALT, SHARE_IMAGE_PATH, SHARE_IMAGE_SIZE } from "@/src/og/share-image";

/**
 * The share image, named by every page: a page's own openGraph replaces its parent's, the image of app/opengraph-image.tsx
 * with it, which only the root's page keeps.
 */
const SHARE_IMAGE = { url: absoluteUrl(SHARE_IMAGE_PATH), alt: SHARE_IMAGE_ALT, ...SHARE_IMAGE_SIZE };

/** What link previews are told of each language: British English, French of France. */
const OPEN_GRAPH_LOCALES: Record<Locale, string> = { en: "en_GB", fr: "fr_FR" };

/**
 * A public page's metadata, in the language of its address: its own title and description (the « seo » messages), its
 * absolute address as the canonical one, its address in each language (hreflang en, fr and x-default, the English one),
 * and what a link preview shows, with the share image of every page (app/opengraph-image.tsx). No club name in any of it
 * (CLAUDE.md, « Communication sortante »).
 */
export async function publicPageMetadata(page: PublicPageName, locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "seo" });
  const title = t(`${page}.title`);
  const description = t(`${page}.description`);
  const url = absoluteUrl(publicPath(page, locale));
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url, languages: languageAlternates(page) },
    openGraph: {
      type: "website",
      siteName: "Late Winner",
      url,
      title,
      description,
      locale: OPEN_GRAPH_LOCALES[locale],
      alternateLocale: OPEN_GRAPH_LOCALES[locale === "en" ? "fr" : "en"],
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [SHARE_IMAGE] },
  };
}
