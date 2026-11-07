import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { realClubNames } from "@/prisma/seed/real-club-names";
import { LOCALES } from "@/src/i18n/locale";
import { absoluteUrl, PUBLIC_PAGE_NAMES, publicPath } from "@/src/i18n/public-pages";
import { forbiddenNamesIn } from "@/src/lib/outward-names";
import robots, { NAMED_CRAWLERS, ROBOTS_DISALLOW } from "../robots";
import sitemap from "../sitemap";

/** Every public page's absolute address, in each language. */
const PUBLIC_URLS = PUBLIC_PAGE_NAMES.flatMap((page) => LOCALES.map((locale) => absoluteUrl(publicPath(page, locale)))).sort();

describe("robots.txt", () => {
  it("lets every crawler read all but a save's pages, the API and the admin page, and says where the sitemap is", () => {
    const { rules, sitemap: sitemapUrl } = robots();
    expect(ROBOTS_DISALLOW).toEqual(["/saves/", "/api/", "/admin"]);
    expect(rules).toEqual([
      { userAgent: "*", allow: "/", disallow: ROBOTS_DISALLOW },
      { userAgent: NAMED_CRAWLERS, allow: "/", disallow: ROBOTS_DISALLOW },
    ]);
    expect(sitemapUrl).toBe("https://www.latewinner.app/sitemap.xml");
  });

  it("names the search, answer and training crawlers let in, each with everyone's rules", () => {
    expect(NAMED_CRAWLERS).toEqual([
      "OAI-SearchBot",
      "PerplexityBot",
      "Claude-SearchBot",
      "Claude-User",
      "GPTBot",
      "ClaudeBot",
      "Google-Extended",
    ]);
  });
});

describe("sitemap.xml", () => {
  const entries = sitemap();

  it("lists every public page in each language, and nothing else", () => {
    expect(entries.map(({ url }) => url).sort()).toEqual(PUBLIC_URLS);
    for (const { url } of entries) {
      expect(url.startsWith("https://www.latewinner.app/")).toBe(true);
      expect(url).not.toContain("/saves");
    }
  });

  it("gives each address all its languages, English the default, as the page's own metadata does", () => {
    for (const page of PUBLIC_PAGE_NAMES) {
      const languages = { en: absoluteUrl(publicPath(page, "en")), fr: absoluteUrl(publicPath(page, "fr")) };
      for (const locale of LOCALES) {
        const entry = entries.find(({ url }) => url === languages[locale]);
        expect(entry?.alternates?.languages).toEqual({ ...languages, "x-default": languages.en });
      }
    }
  });
});

describe("llms.txt", () => {
  const text = readFileSync(join(process.cwd(), "public", "llms.txt"), "utf8");

  it("says what the game is, and links every public page in both languages, nothing else", () => {
    expect(text.startsWith("# Late Winner\n\n> ")).toBe(true);
    const links = [...text.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)].map(([, url]) => url);
    expect(links.sort()).toEqual(PUBLIC_URLS);
  });

  it("names no real club, no brand, no licensed competition", () => {
    expect(forbiddenNamesIn(text, realClubNames())).toEqual([]);
  });
});
