import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { HeroFormation } from "./hero-formation";

/** The hero's line, its text, apostrophes as written. */
const lineOf = (byAssistant: boolean, locale: Locale = "fr"): string =>
  renderToStaticMarkup(inLanguage(<HeroFormation formation="4-3-3" byAssistant={byAssistant} />, locale))
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'");

describe("the hero's eleven", () => {
  it("says the assistant's eleven while he makes it, in the club's formation", () => {
    expect(lineOf(true)).toBe("Onze de l'adjoint · 4-3-3 sentinelle");
    expect(lineOf(true, "en")).toBe("Assistant's eleven · 4-3-3 holding");
  });

  it("says the formation alone once the player makes his own", () => {
    expect(lineOf(false)).toBe("Onze en 4-3-3 sentinelle");
    expect(lineOf(false, "en")).toBe("Formation 4-3-3 holding");
  });

  it("says who makes it on the element, for the tests", () => {
    expect(renderToStaticMarkup(inLanguage(<HeroFormation formation="4-4-2" byAssistant />))).toContain(
      'data-testid="hero-formation" data-by-assistant="true"',
    );
  });
});
