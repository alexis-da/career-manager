import type { Locale } from "@/src/i18n/locale";
import { absoluteUrl, publicPath } from "@/src/i18n/public-pages";
import { SHARE_IMAGE_PATH } from "@/src/og/share-image";

/** The languages the game is played in: both, whatever the page's. */
const GAME_LANGUAGES = ["en", "fr"];

/**
 * What the home page tells search engines of the site and the game (JSON-LD, schema.org), in the page's language: the
 * site, then the game as a free video game and web application played in a browser, with its description, its languages,
 * its genres, its share image and the page's screenshots. No rating, no review: the game has none to show.
 */
export function homeStructuredData({
  locale,
  description,
  screenshots,
}: {
  locale: Locale;
  description: string;
  screenshots: string[]; // the page's screenshots, as the page names them (/screenshots/…)
}) {
  const site = absoluteUrl(publicPath("home", "en"));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${site}#website`,
        name: "Late Winner",
        url: site,
        inLanguage: GAME_LANGUAGES,
      },
      {
        "@type": ["VideoGame", "WebApplication"],
        "@id": `${site}#game`,
        name: "Late Winner",
        url: absoluteUrl(publicPath("home", locale)),
        description,
        inLanguage: GAME_LANGUAGES,
        genre: ["Sports", "Management simulation"],
        gamePlatform: "Web browser",
        applicationCategory: "GameApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: 0, priceCurrency: "EUR" },
        image: absoluteUrl(SHARE_IMAGE_PATH),
        screenshot: screenshots.map(absoluteUrl),
        isPartOf: { "@id": `${site}#website` },
      },
    ],
  };
}

/** Structured data as a script's text: JSON, its « < » escaped so that no text in it ever closes the script. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
