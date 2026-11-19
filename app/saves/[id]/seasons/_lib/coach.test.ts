import { describe, expect, it } from "vitest";
import type { CoachHistory, CoachSpellView } from "@/src/db/national-view";
import { NATION_CODES } from "@/src/engine/nations";
import type { Locale } from "@/src/i18n/locale";
import { testTranslator } from "@/src/i18n/test-intl";
import { coachSpellLine, coachTrophyTiles, ofNation } from "./coach";

const words = (locale: Locale) =>
  [testTranslator(locale, "seasons"), testTranslator(locale, "world"), testTranslator(locale, "nations")] as const;

/** A mission's line as the History reads it: its head, then its parts after « · ». */
const lineOf = (spell: CoachSpellView, locale: Locale = "fr"): string => {
  const { head, parts } = coachSpellLine(spell, ...words(locale));
  return [head, ...parts.map((part) => part.text)].join(" · ");
};

const PORTUGAL: CoachSpellView = {
  code: "POR",
  fromYear: 2027,
  toYear: 2029,
  outcome: "MISSED",
  tournaments: [
    { tournament: "int.eu", year: 2028, stage: 2 },
    { tournament: "int.world", year: 2030, stage: 1 },
  ],
};

describe("the national coach's career", () => {
  it("tells a mission with its seasons, its tournaments and how it ended", () => {
    expect(lineOf(PORTUGAL)).toBe(
      "Sélectionneur du Portugal, 2027-28 → 2029-30 · Coupe du Vieux Continent 2028 : demi-finale · Coupe des Hémisphères 2030 : phase de groupes · fin de mission : objectif manqué",
    );
    expect(lineOf(PORTUGAL, "en")).toBe(
      "National coach of Portugal, 2027-28 → 2029-30 · Old Continent Cup 2028: semi-final · Hemispheres Cup 2030: group stage · mission ended: objective missed",
    );
  });

  it("says a title as a win, a mission in post since its first season, one of a single season by it", () => {
    const won: CoachSpellView = { code: "NED", fromYear: 2027, toYear: null, outcome: null, tournaments: [{ tournament: "int.world", year: 2030, stage: 4 }] };
    expect(lineOf(won)).toBe("Sélectionneur des Pays-Bas, depuis 2027-28 · vainqueur de la Coupe des Hémisphères 2030");
    expect(lineOf(won, "en")).toBe("National coach of the Netherlands, since 2027-28 · won the Hemispheres Cup 2030");
    expect(coachSpellLine(won, ...words("fr")).parts.map((part) => part.won)).toEqual([true]);

    const short: CoachSpellView = { code: "FRA", fromYear: 2028, toYear: 2028, outcome: "NOT_QUALIFIED", tournaments: [] };
    expect(lineOf(short)).toBe("Sélectionneur de la France, 2028-29 · fin de mission : pas qualifié");
    expect(lineOf({ ...short, code: "GER", outcome: "RESIGNED" }, "en")).toBe("National coach of Germany, 2028-29 · resigned");
    expect(lineOf({ ...short, code: "GER", outcome: "RESIGNED" })).toBe("Sélectionneur de l'Allemagne, 2028-29 · démission");
  });

  it("names each of the 14 nations as its coach's title does, in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const [t, tWorld] = words(locale);
      for (const code of NATION_CODES) {
        const name = ofNation(code, t, tWorld);
        // The nation's own name after its preposition: « de l'Espagne », « of the Netherlands ».
        expect(name, `${locale} ${code}`).toContain(tWorld(`nationalities.${code}`));
        expect(name, `${locale} ${code}`).toMatch(locale === "fr" ? /^(du |de la |de l'|des )/ : /^of /);
      }
    }
    const [t, tWorld] = words("fr");
    expect((["POR", "ESP", "CIV", "BRA"] as const).map((code) => ofNation(code, t, tWorld))).toEqual([
      "du Portugal",
      "de l'Espagne",
      "de la Côte d'Ivoire",
      "du Brésil",
    ]);
  });

  it("gives the trophy room both summer tournaments from a first mission, the years won the most recent first", () => {
    const history: Pick<CoachHistory, "titles"> = {
      titles: [
        { tournament: "int.world", year: 2030, code: "POR" },
        { tournament: "int.world", year: 2034, code: "FRA" },
      ],
    };
    expect(coachTrophyTiles(history)).toEqual([
      { tournament: "int.eu", years: [], toConquer: true },
      { tournament: "int.world", years: [2034, 2030], toConquer: false },
    ]);
    expect(coachTrophyTiles({ titles: [] }).map((tile) => tile.toConquer)).toEqual([true, true]);
    expect(coachTrophyTiles(null)).toEqual([]);
  });
});
