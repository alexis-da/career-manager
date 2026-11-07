import { describe, expect, it } from "vitest";
import { realClubNames } from "@/prisma/seed/real-club-names";
import { LOCALES } from "@/src/i18n/locale";
import { MESSAGES } from "@/src/i18n/messages";
import { forbiddenNamesIn } from "@/src/lib/outward-names";

/** Every string of a message tree, one per line. */
const textOf = (value: unknown): string =>
  typeof value === "string"
    ? value
    : typeof value === "object" && value !== null
      ? Object.values(value).map(textOf).join("\n")
      : "";

// What the public pages say of themselves to people and to crawlers: their titles and descriptions (seo), the home page's
// sections (landing). No real club, no brand, no licensed competition (CLAUDE.md, « Communication sortante »).
describe("the public pages' own texts", () => {
  const clubs = realClubNames();

  for (const locale of LOCALES) {
    it(`name no real club, brand or licensed competition, in ${locale}`, () => {
      const { seo, landing } = MESSAGES[locale];
      expect(forbiddenNamesIn(textOf({ seo, landing }), clubs)).toEqual([]);
    });
  }
});
