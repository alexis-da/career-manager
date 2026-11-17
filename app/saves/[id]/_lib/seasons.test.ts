import { describe, expect, it } from "vitest";
import { seasonEndDate, seasonStartDate } from "@/src/engine/world";
import { testTranslator } from "@/src/i18n/test-intl";
import { europeLabel, europeReviewLines, isLastCompletedSeason, SEASON_CARD_VERSION, seasonCardPath } from "./seasons";

const stage = { fr: testTranslator("fr", "stage"), en: testTranslator("en", "stage") };
const seasons = { fr: testTranslator("fr", "seasons"), en: testTranslator("en", "seasons") };

/** A season without a European run. */
const NO_EUROPE = { europeCode: null, europeStage: null, europeWinner: false };

describe("europeLabel", () => {
  it("says how far the club went in its European competition, or that it won it, as the cup's line does", () => {
    expect(europeLabel({ europeCode: "eu.1", europeStage: 3, europeWinner: false }, stage.fr)).toBe("Coupe des Lauriers : quarts de finale");
    expect(europeLabel({ europeCode: "eu.2", europeStage: 2, europeWinner: false }, stage.fr)).toBe("Coupe des Fanions : barrages");
    expect(europeLabel({ europeCode: "eu.1", europeStage: 5, europeWinner: true }, stage.fr)).toBe("Vainqueur de la Coupe des Lauriers");
    expect(europeLabel(NO_EUROPE, stage.fr)).toBeNull();
  });

  it("says it in English too", () => {
    expect(europeLabel({ europeCode: "eu.2", europeStage: 4, europeWinner: false }, stage.en)).toBe("Pennant Cup: semi-finals");
    expect(europeLabel({ europeCode: "eu.1", europeStage: 1, europeWinner: false }, stage.en)).toBe("Laurel Cup: league phase");
    expect(europeLabel({ europeCode: "eu.2", europeStage: 5, europeWinner: true }, stage.en)).toBe("Pennant Cup winners");
  });
});

describe("europeReviewLines", () => {
  const winners = [
    { code: "eu.1", club: "Club A", managed: false },
    { code: "eu.2", club: "Club B", managed: false },
  ];

  it("gives the club's run first, with its competition's winner, then the other competition's winner", () => {
    expect(europeReviewLines({ europeCode: "eu.2", europeStage: 3, europeWinner: false }, winners, stage.fr, seasons.fr)).toEqual([
      { code: "eu.2", text: "Coupe des Fanions : quarts de finale · vainqueur : Club B", won: false, own: true },
      { code: "eu.1", text: "Coupe des Lauriers · vainqueur : Club A", won: false, own: false },
    ]);
  });

  it("says the club's own title without naming the club", () => {
    const won = [{ code: "eu.1", club: "Mon club", managed: true }, winners[1]];
    expect(europeReviewLines({ europeCode: "eu.1", europeStage: 5, europeWinner: true }, won, stage.fr, seasons.fr)).toEqual([
      { code: "eu.1", text: "Vainqueur de la Coupe des Lauriers", won: true, own: true },
      { code: "eu.2", text: "Coupe des Fanions · vainqueur : Club B", won: false, own: false },
    ]);
  });

  it("names both winners for a club out of Europe that season, in English too, and nothing without a European season", () => {
    expect(europeReviewLines(NO_EUROPE, winners, stage.en, seasons.en).map(({ text }) => text)).toEqual([
      "Laurel Cup · winners: Club A",
      "Pennant Cup · winners: Club B",
    ]);
    expect(europeReviewLines(NO_EUROPE, [], stage.fr, seasons.fr)).toEqual([]);
  });

  it("says a title its result does not hold as the club's own (a row rebuilt lazily has no European run)", () => {
    expect(europeReviewLines(NO_EUROPE, [{ code: "eu.2", club: "Mon club", managed: true }], stage.fr, seasons.fr)).toEqual([
      { code: "eu.2", text: "Vainqueur de la Coupe des Fanions", won: true, own: false },
    ]);
  });

  it("keeps the club's run without a final played", () => {
    expect(europeReviewLines({ europeCode: "eu.1", europeStage: 2, europeWinner: false }, [], stage.fr, seasons.fr)).toEqual([
      { code: "eu.1", text: "Coupe des Lauriers : barrages", won: false, own: true },
    ]);
  });
});

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
