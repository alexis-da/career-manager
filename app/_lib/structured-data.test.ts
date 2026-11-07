import { describe, expect, it } from "vitest";
import { realClubNames } from "@/prisma/seed/real-club-names";
import { LOCALES } from "@/src/i18n/locale";
import { MESSAGES } from "@/src/i18n/messages";
import { forbiddenNamesIn } from "@/src/lib/outward-names";
import { homeStructuredData, jsonLdText } from "./structured-data";

const SCREENSHOTS = ["/screenshots/lineup-fr.webp", "/screenshots/live-choice-fr.webp"];

/** Every key of a JSON value, at any depth. */
const keysOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap(keysOf)
    : typeof value === "object" && value !== null
      ? Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)])
      : [];

describe("the home page's structured data", () => {
  const description = MESSAGES.fr.seo.home.description;
  // Read back as a crawler reads it: the script's text, parsed.
  const data = JSON.parse(jsonLdText(homeStructuredData({ locale: "fr", description, screenshots: SCREENSHOTS })));

  it("is a schema.org graph of the site and the game, which belongs to it", () => {
    expect(data["@context"]).toBe("https://schema.org");
    const [site, game] = data["@graph"];
    expect(site).toEqual({
      "@type": "WebSite",
      "@id": "https://www.latewinner.app/#website",
      name: "Late Winner",
      url: "https://www.latewinner.app/",
      inLanguage: ["en", "fr"],
    });
    expect(game["@type"]).toEqual(["VideoGame", "WebApplication"]);
    expect(game.isPartOf).toEqual({ "@id": site["@id"] });
  });

  it("gives the game's name, address, description, languages, genre and platform, free", () => {
    const game = data["@graph"][1];
    expect(game).toMatchObject({
      name: "Late Winner",
      url: "https://www.latewinner.app/fr",
      description,
      inLanguage: ["en", "fr"],
      gamePlatform: "Web browser",
      applicationCategory: "GameApplication",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: 0, priceCurrency: "EUR" },
      image: "https://www.latewinner.app/opengraph-image",
      screenshot: ["https://www.latewinner.app/screenshots/lineup-fr.webp", "https://www.latewinner.app/screenshots/live-choice-fr.webp"],
    });
    expect(game.genre.length).toBeGreaterThan(0);
  });

  it("has no rating nor review", () => {
    for (const key of ["aggregateRating", "review", "reviewRating", "ratingValue"]) {
      expect(keysOf(data)).not.toContain(key);
    }
  });

  it("names no real club, brand or licensed competition, in either language", () => {
    for (const locale of LOCALES) {
      const text = jsonLdText(
        homeStructuredData({ locale, description: MESSAGES[locale].seo.home.description, screenshots: SCREENSHOTS }),
      );
      expect(forbiddenNamesIn(text, realClubNames())).toEqual([]);
    }
  });

  it("never lets a text close its script", () => {
    expect(jsonLdText({ description: "</script><script>alert(1)</script>" })).not.toContain("<");
    expect(JSON.parse(jsonLdText({ description: "</script>" }))).toEqual({ description: "</script>" });
  });
});
