import { describe, expect, it } from "vitest";
import { isLocale, negotiateLocale } from "./locale";

describe("negotiateLocale", () => {
  it("keeps the language the player chose, whatever the browser prefers", () => {
    expect(negotiateLocale("en", "fr-FR,fr;q=0.9")).toBe("en");
    expect(negotiateLocale("fr", "en-US,en;q=0.9")).toBe("fr");
    expect(negotiateLocale("fr", null)).toBe("fr");
  });

  it("ignores a cookie that holds no language of the game", () => {
    expect(negotiateLocale("de", "fr-FR")).toBe("fr");
    expect(negotiateLocale("", "en-GB")).toBe("en");
    expect(negotiateLocale("FR", "en-GB")).toBe("en");
  });

  it("speaks French to a browser that prefers it to English", () => {
    expect(negotiateLocale(undefined, "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("fr");
    expect(negotiateLocale(undefined, "fr-CA")).toBe("fr");
    expect(negotiateLocale(undefined, "FR-be ; q=0.8")).toBe("fr");
    // French named, English not: French is preferred to it.
    expect(negotiateLocale(undefined, "de-DE,de;q=0.9,fr;q=0.5")).toBe("fr");
    expect(negotiateLocale(undefined, "en;q=0.4,fr;q=0.6")).toBe("fr");
  });

  it("speaks English otherwise", () => {
    expect(negotiateLocale(undefined, "en-US,en;q=0.9,fr;q=0.8")).toBe("en");
    expect(negotiateLocale(undefined, "de-DE,de;q=0.9")).toBe("en");
    expect(negotiateLocale(undefined, "*")).toBe("en");
    expect(negotiateLocale(undefined, "")).toBe("en");
    expect(negotiateLocale(undefined, null)).toBe("en");
  });

  it("settles equal qualities by order, and drops what it cannot accept", () => {
    expect(negotiateLocale(undefined, "fr;q=0.5,en;q=0.5")).toBe("fr");
    expect(negotiateLocale(undefined, "en;q=0.5,fr;q=0.5")).toBe("en");
    // A quality of 0 refuses the language; one that cannot be read does not count.
    expect(negotiateLocale(undefined, "fr;q=0,de")).toBe("en");
    expect(negotiateLocale(undefined, "fr;q=abc,en;q=0.1")).toBe("en");
    expect(negotiateLocale(undefined, "fr;q=2,en;q=0.1")).toBe("en");
    // A language's best quality counts, wherever it comes.
    expect(negotiateLocale(undefined, "en;q=0.8,fr-CA;q=0.3,fr;q=0.9")).toBe("fr");
  });
});

describe("isLocale", () => {
  it("accepts the game's two languages only", () => {
    expect(["fr", "en", "de", "", undefined, 1].map(isLocale)).toEqual([true, true, false, false, false, false]);
  });
});
