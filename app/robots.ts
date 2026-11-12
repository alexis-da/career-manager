import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/src/i18n/public-pages";

/** What no crawler reads: a save's pages (a player's own), the API, the administrator's page, a resume link's page. */
export const ROBOTS_DISALLOW = ["/saves/", "/api/", "/admin", "/resume"];

/**
 * The crawlers let in by name: those of search and answer engines (OAI-SearchBot, PerplexityBot, Claude-SearchBot,
 * Claude-User) and those that read for model training (GPTBot, ClaudeBot, Google-Extended), by decision. A crawler with
 * a group of its own reads that group only: theirs repeats everyone's rules.
 */
export const NAMED_CRAWLERS = [
  "OAI-SearchBot",
  "PerplexityBot",
  "Claude-SearchBot",
  "Claude-User",
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
];

/** /robots.txt: everything but a save's pages, the API and the admin page, for everyone; and where the sitemap is. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ROBOTS_DISALLOW },
      { userAgent: NAMED_CRAWLERS, allow: "/", disallow: ROBOTS_DISALLOW },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
