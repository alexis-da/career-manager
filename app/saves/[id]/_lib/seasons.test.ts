import { describe, expect, it } from "vitest";
import { seasonEndDate, seasonStartDate } from "@/src/engine/world";
import { isLastCompletedSeason, SEASON_CARD_VERSION, seasonCardPath } from "./seasons";

describe("seasonCardPath", () => {
  it("names the card's language, its drawing's version and its format, one address for one image", () => {
    expect(seasonCardPath("save", "season", "fr")).toBe(`/saves/save/seasons/season/card?lang=fr&v=${SEASON_CARD_VERSION}`);
    expect(seasonCardPath("save", "season", "en", "square")).toBe(`/saves/save/seasons/season/card?lang=en&v=${SEASON_CARD_VERSION}&format=square`);
  });
});

describe("isLastCompletedSeason", () => {
  it("holds from the first day of the next season, where moving on leaves the save, to its last", () => {
    expect(isLastCompletedSeason(2026, seasonStartDate(2027))).toBe(true);
    expect(isLastCompletedSeason(2026, seasonEndDate(2027))).toBe(true);
  });

  it("does not hold for an older season", () => {
    expect(isLastCompletedSeason(2026, seasonStartDate(2028))).toBe(false);
  });

  it("does not hold for the season of the save's date", () => {
    expect(isLastCompletedSeason(2026, seasonEndDate(2026))).toBe(false);
  });
});
