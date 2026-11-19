import { describe, expect, it } from "vitest";
import type { SeasonBestPlayer, SeasonResultView } from "@/src/db/season-results";
import type { Locale } from "@/src/i18n/locale";
import { testTranslator } from "@/src/i18n/test-intl";
import { frameStyleOf } from "@/src/lib/cosmetics";
import { seasonCardFileName } from "../../../_lib/seasons";
import {
  CARD_SIZES,
  cardBadge,
  coachLine,
  europeLine,
  objectivesLine,
  seasonCardResponse,
  type CardCoach,
  type CardDress,
  type CardFormat,
  type CardObjectives,
  type CardTranslators,
} from "./season-card";

/** The card's words in a language, as its route gets them. */
function translators(locale: Locale): CardTranslators {
  return {
    positions: testTranslator(locale, "positions"),
    world: testTranslator(locale, "world"),
    seasons: testTranslator(locale, "seasons"),
    seasonCard: testTranslator(locale, "seasonCard"),
    objectives: testTranslator(locale, "objectives"),
    stage: testTranslator(locale, "stage"),
    nations: testTranslator(locale, "nations"),
  };
}

const LYON = { primary: "#1B3E8F", secondary: "#E2001A" };

const BEST_PLAYER: SeasonBestPlayer = {
  playerKey: "olympique-lyonnais#9",
  name: "Prénom Nom",
  position: "ST",
  goals: 24,
  assists: 6,
  rating: 7.6,
  age: 27,
};

const CHAMPION: SeasonResultView = {
  seasonId: "season",
  startYear: 2027,
  competitionCode: "fr.1",
  rank: 1,
  champion: true,
  promoted: false,
  relegated: false,
  cupRound: 5,
  cupWinner: false,
  europeCode: null,
  europeStage: null,
  europeWinner: false,
  points: 84,
  played: 34,
  won: 26,
  drawn: 6,
  lost: 2,
  goalsFor: 81,
  goalsAgainst: 25,
  formation: "4-3-3",
  bestPlayer: BEST_PLAYER,
};

/** Width and height of a PNG, from its IHDR chunk; throws when the bytes are not a PNG. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** A test that draws a card: the first drawing loads the fonts and the image engine, more than 5 s on a busy machine. */
const DRAWING_TIMEOUT_MS = 15_000;

async function render(
  season: SeasonResultView,
  format: CardFormat,
  locale: Locale = "fr",
  objectives: CardObjectives | null = null,
  dress?: CardDress,
  coach: CardCoach | null = null,
): Promise<Buffer> {
  const response = await seasonCardResponse(season, LYON, format, translators(locale), locale, objectives, dress, coach);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toBe("private, max-age=0");
  return Buffer.from(await response.arrayBuffer());
}

// Rendering only: the images themselves are checked by eye (the drawing of a face is tested in player-face.test.tsx).
describe("seasonCardResponse", () => {
  it.each(["landscape", "square"] as const)("draws a champion's %s card at its size", async (format) => {
    expect(pngSize(await render(CHAMPION, format))).toEqual(CARD_SIZES[format]);
  }, DRAWING_TIMEOUT_MS);

  it.each([
    ["a second division champion, promoted", { rank: 1, champion: true, promoted: true }],
    ["a club promoted from second place", { rank: 2, champion: false, promoted: true }],
    ["a relegated club", { rank: 18, champion: false, relegated: true }],
  ] as const)("draws the card of %s in both formats", async (_, change) => {
    const season = { ...CHAMPION, competitionCode: "fr.2", ...change };
    for (const format of ["landscape", "square"] as const) {
      expect(pngSize(await render(season, format))).toEqual(CARD_SIZES[format]);
    }
  }, DRAWING_TIMEOUT_MS);

  it("shows the double, the cup or the league, then a promotion", () => {
    const season = { rank: 1, promoted: false, relegated: false, cupWinner: false, europeCode: null, europeWinner: false };
    const t = translators("fr");
    expect(cardBadge({ ...season, cupWinner: true }, t)).toEqual({ badge: "DOUBLÉ", line: "Championnat et Coupe" });
    expect(cardBadge({ ...season, cupWinner: true, promoted: true }, t)).toEqual({
      badge: "DOUBLÉ",
      line: "Championnat et Coupe · Promu en Division 1",
    });
    expect(cardBadge(season, t)).toEqual({ badge: "CHAMPION", line: null });
    expect(cardBadge({ ...season, rank: 4, cupWinner: true }, t)).toEqual({ badge: "COUPE", line: "4e place" });
    expect(cardBadge({ ...season, rank: 2, cupWinner: true, promoted: true }, t)).toEqual({
      badge: "COUPE",
      line: "2e place · promu",
    });
    expect(cardBadge({ ...season, rank: 3, promoted: true }, t)).toEqual({ badge: "PROMU", line: "3e place" });
    expect(cardBadge({ ...season, rank: 9 }, t)).toBeNull();
  });

  it("shows them in English too, the rank as an English ordinal", () => {
    const season = { rank: 1, promoted: false, relegated: false, cupWinner: false, europeCode: null, europeWinner: false };
    const t = translators("en");
    expect(cardBadge({ ...season, cupWinner: true, promoted: true }, t)).toEqual({
      badge: "DOUBLE",
      line: "League and Cup · Promoted to Division 1",
    });
    expect(cardBadge(season, t)).toEqual({ badge: "CHAMPIONS", line: null });
    expect(cardBadge({ ...season, rank: 2, cupWinner: true, promoted: true }, t)).toEqual({
      badge: "CUP",
      line: "2nd place · promoted",
    });
    expect(cardBadge({ ...season, rank: 3, promoted: true }, t)).toEqual({ badge: "PROMOTED", line: "3rd place" });
    expect(cardBadge({ ...season, rank: 11, cupWinner: true }, t)).toEqual({ badge: "CUP", line: "11th place" });
    expect(cardBadge({ ...season, rank: 9 }, t)).toBeNull();
  });

  it("shows a European title alone or with the league and the cup: EUROPE, DOUBLÉ, TRIPLÉ, each title named", () => {
    const season = { rank: 1, promoted: false, relegated: false, cupWinner: false, europeCode: "eu.1", europeWinner: true };
    const t = translators("fr");
    expect(cardBadge({ ...season, cupWinner: true }, t)).toEqual({ badge: "TRIPLÉ", line: "Championnat, Coupe et Coupe des Lauriers" });
    expect(cardBadge({ ...season, cupWinner: true, europeCode: "eu.2", promoted: true }, t)).toEqual({
      badge: "TRIPLÉ",
      line: "Championnat, Coupe et Coupe des Fanions · Promu en Division 1",
    });
    expect(cardBadge(season, t)).toEqual({ badge: "DOUBLÉ", line: "Championnat et Coupe des Lauriers" });
    expect(cardBadge({ ...season, rank: 3, cupWinner: true }, t)).toEqual({ badge: "DOUBLÉ", line: "Coupe et Coupe des Lauriers · 3e place" });
    expect(cardBadge({ ...season, rank: 5 }, t)).toEqual({ badge: "EUROPE", line: "Coupe des Lauriers · 5e place" });
    expect(cardBadge({ ...season, rank: 2, europeCode: "eu.2", promoted: true }, t)).toEqual({
      badge: "EUROPE",
      line: "Coupe des Fanions · 2e place · promu",
    });
  });

  it("shows the European titles in English too", () => {
    const season = { rank: 1, promoted: false, relegated: false, cupWinner: true, europeCode: "eu.1", europeWinner: true };
    const t = translators("en");
    expect(cardBadge(season, t)).toEqual({ badge: "TREBLE", line: "League, Cup and Laurel Cup" });
    expect(cardBadge({ ...season, cupWinner: false, europeCode: "eu.2" }, t)).toEqual({ badge: "DOUBLE", line: "League and Pennant Cup" });
    expect(cardBadge({ ...season, rank: 4 }, t)).toEqual({ badge: "DOUBLE", line: "Cup and Laurel Cup · 4th place" });
    expect(cardBadge({ ...season, rank: 7, cupWinner: false }, t)).toEqual({ badge: "EUROPE", line: "Laurel Cup · 7th place" });
  });

  it("changes no badge for a European run without the title, which its own line says under the competition", () => {
    const run = { rank: 1, promoted: false, relegated: false, cupWinner: true, europeCode: "eu.1", europeWinner: false };
    const t = translators("fr");
    expect(cardBadge(run, t)).toEqual({ badge: "DOUBLÉ", line: "Championnat et Coupe" });
    expect(cardBadge({ ...run, rank: 6, cupWinner: false }, t)).toBeNull();
    expect(europeLine({ europeCode: "eu.1", europeStage: 3, europeWinner: false }, t)).toBe("Coupe des Lauriers : quarts de finale");
    expect(europeLine({ europeCode: "eu.2", europeStage: 1, europeWinner: false }, t)).toBe("Coupe des Fanions : phase de ligue");
    expect(europeLine({ europeCode: "eu.2", europeStage: 5, europeWinner: false }, translators("en"))).toBe("Pennant Cup: final");
    // A title's competition is named by the badge; a season without Europe has no line.
    expect(europeLine({ europeCode: "eu.1", europeStage: 5, europeWinner: true }, t)).toBeNull();
    expect(europeLine({ europeCode: null, europeStage: null, europeWinner: false }, t)).toBeNull();
  });

  it("draws the cards of a double and of a cup winner in both formats", async () => {
    for (const change of [{ cupWinner: true, cupRound: 6 }, { rank: 5, champion: false, cupWinner: true, cupRound: 6 }]) {
      for (const format of ["landscape", "square"] as const) {
        expect(pngSize(await render({ ...CHAMPION, ...change }, format))).toEqual(CARD_SIZES[format]);
      }
    }
  }, DRAWING_TIMEOUT_MS);

  it("draws the European cards in both formats and languages, a run's line under the tallest headline too", async () => {
    // The double of a promoted club with a European run under its competition: the most the headline holds.
    const run = { ...CHAMPION, competitionCode: "fr.2", cupWinner: true, cupRound: 6, promoted: true, europeCode: "eu.2", europeStage: 4 };
    const treble = { ...CHAMPION, cupWinner: true, cupRound: 6, europeCode: "eu.1", europeStage: 5, europeWinner: true };
    for (const season of [run, treble]) {
      for (const locale of ["fr", "en"] as const) {
        for (const format of ["landscape", "square"] as const) {
          expect(pngSize(await render(season, format, locale, { met: 3, total: 4 }))).toEqual(CARD_SIZES[format]);
        }
      }
    }
  }, DRAWING_TIMEOUT_MS);

  it("draws the card in the European title's frame, its compass roses at the corners, in both formats", async () => {
    const europe = { ...CHAMPION, rank: 5, champion: false, europeCode: "eu.1", europeStage: 5, europeWinner: true };
    const dress: CardDress = { frame: frameStyleOf("frame-compass-rose"), title: "Tacticien" };
    expect(dress.frame.ornament).toBe("compass");
    for (const format of ["landscape", "square"] as const) {
      expect(pngSize(await render(europe, format, "fr", null, dress))).toEqual(CARD_SIZES[format]);
    }
  }, DRAWING_TIMEOUT_MS);

  it("draws a card without a best player", async () => {
    const season = { ...CHAMPION, rank: 14, champion: false, bestPlayer: null };
    expect(pngSize(await render(season, "landscape"))).toEqual(CARD_SIZES.landscape);
  }, DRAWING_TIMEOUT_MS);

  it("draws the cards in English, a rank as a badge and as an ordinal, in both formats", async () => {
    const cupWinner = { ...CHAMPION, rank: 2, champion: false, cupWinner: true };
    const midTable = { ...CHAMPION, rank: 13, champion: false };
    for (const season of [CHAMPION, cupWinner, midTable]) {
      for (const format of ["landscape", "square"] as const) {
        expect(pngSize(await render(season, format, "en"))).toEqual(CARD_SIZES[format]);
      }
    }
  }, DRAWING_TIMEOUT_MS);

  it("says the nation its manager coached at the card's foot, and its summer tournament, in capitals and without a club", () => {
    const fr = translators("fr");
    const en = translators("en");
    const semi: CardCoach = { code: "POR", tournament: { tournament: "int.world", stage: 2 } };
    expect(coachLine(semi, fr, "fr")).toBe("SÉLECTIONNEUR DU PORTUGAL · COUPE DES HÉMISPHÈRES : DEMI-FINALE");
    expect(coachLine(semi, en, "en")).toBe("NATIONAL COACH OF PORTUGAL · HEMISPHERES CUP: SEMI-FINAL");
    expect(coachLine({ code: "NED", tournament: { tournament: "int.eu", stage: 4 } }, fr, "fr")).toBe(
      "SÉLECTIONNEUR DES PAYS-BAS · VAINQUEUR DE LA COUPE DU VIEUX CONTINENT",
    );
    expect(coachLine({ code: "NED", tournament: { tournament: "int.eu", stage: 4 } }, en, "en")).toBe(
      "NATIONAL COACH OF THE NETHERLANDS · OLD CONTINENT CUP WINNERS",
    );
    expect(coachLine({ code: "CIV", tournament: { tournament: "int.world", stage: 1 } }, fr, "fr")).toBe(
      "SÉLECTIONNEUR DE LA CÔTE D'IVOIRE · COUPE DES HÉMISPHÈRES : PHASE DE GROUPES",
    );
    expect(coachLine({ code: "ITA", tournament: { tournament: "int.eu", stage: 3 } }, fr, "fr")).toBe(
      "SÉLECTIONNEUR DE L'ITALIE · COUPE DU VIEUX CONTINENT : FINALE",
    );
    // A season without a tournament: the nation alone; without a nation, no line.
    expect(coachLine({ code: "FRA", tournament: null }, fr, "fr")).toBe("SÉLECTIONNEUR DE LA FRANCE");
    expect(coachLine(null, fr, "fr")).toBeNull();
  });

  it("draws the national coach's line under the tallest headline, the longest line, in both formats and languages", async () => {
    // The double of a promoted club with a European run, its objectives beside the season, a frame and a title.
    const run = { ...CHAMPION, competitionCode: "fr.2", cupWinner: true, cupRound: 6, promoted: true, europeCode: "eu.2", europeStage: 4 };
    const dress: CardDress = { frame: frameStyleOf("frame-gold-laurels"), title: "L'Insubmersible" };
    const groups: CardCoach = { code: "CIV", tournament: { tournament: "int.world", stage: 1 } };
    for (const locale of ["fr", "en"] as const) {
      for (const format of ["landscape", "square"] as const) {
        expect(pngSize(await render(run, format, locale, { met: 3, total: 4 }, dress, groups))).toEqual(CARD_SIZES[format]);
      }
    }
    expect(pngSize(await render({ ...CHAMPION, rank: 9, champion: false }, "landscape", "fr", null, undefined, { code: "POR", tournament: null }))).toEqual(
      CARD_SIZES.landscape,
    );
  }, DRAWING_TIMEOUT_MS);

  it("counts the season's objectives met in the screens' words, nothing for a season without them", () => {
    expect(objectivesLine({ met: 2, total: 3 }, translators("fr"))).toBe("Objectifs : 2/3");
    expect(objectivesLine({ met: 0, total: 2 }, translators("fr"))).toBe("Objectifs : 0/2");
    expect(objectivesLine({ met: 3, total: 3 }, translators("en"))).toBe("Objectives: 3/3");
    expect(objectivesLine(null, translators("fr"))).toBeNull();
  });

  it("draws the objectives beside the season in both formats and languages, the tallest headline and the widest stats too", async () => {
    // The double of a promoted club: a badge with its line, the most the headline holds.
    const double = { ...CHAMPION, competitionCode: "fr.2", cupWinner: true, promoted: true };
    // A second division of 24 clubs: three figures, and a name over two lines beside them in landscape.
    const wide = {
      ...CHAMPION,
      competitionCode: "en.2",
      rank: 22,
      champion: false,
      points: 102,
      won: 18,
      drawn: 10,
      lost: 18,
      goalsFor: 102,
      goalsAgainst: 88,
      bestPlayer: { ...BEST_PLAYER, name: "Jean-Christophe Lemaire-Dubois" },
    };
    for (const [season, objectives] of [
      [double, { met: 2, total: 3 }],
      [wide, { met: 0, total: 2 }],
    ] as const) {
      for (const locale of ["fr", "en"] as const) {
        for (const format of ["landscape", "square"] as const) {
          expect(pngSize(await render(season, format, locale, objectives))).toEqual(CARD_SIZES[format]);
        }
      }
    }
  }, DRAWING_TIMEOUT_MS);
});

describe("seasonCardFileName", () => {
  it("names a downloaded card in ASCII, in the player's language", () => {
    const [fr, en] = [testTranslator("fr", "seasons"), testTranslator("en", "seasons")];
    expect(seasonCardFileName(2026, "square", fr)).toBe("late-winner-saison-2026-27.png");
    expect(seasonCardFileName(2026, "landscape", fr)).toBe("late-winner-saison-2026-27-paysage.png");
    expect(seasonCardFileName(2026, "square", en)).toBe("late-winner-season-2026-27.png");
    expect(seasonCardFileName(2026, "landscape", en)).toBe("late-winner-season-2026-27-landscape.png");
  });
});
