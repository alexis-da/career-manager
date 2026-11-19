import { describe, expect, it } from "vitest";
import type { CoachStage } from "@/src/engine/national-coach";
import { NATION_CODES } from "@/src/engine/nations";
import type { TournamentCode } from "@/src/engine/tournaments";
import type { Locale } from "@/src/i18n/locale";
import { testTranslator } from "@/src/i18n/test-intl";
import { dayRange, exceededLine, nationalStage, nationIn, nationsIn, objectiveLine, tournamentName } from "./coach-names";

/** The translators the national coach's names take, in a language. */
const namesIn = (locale: Locale) => ({
  tCoach: testTranslator(locale, "coachOffer"),
  tNations: testTranslator(locale, "nations"),
  tWorld: testTranslator(locale, "world"),
});

describe("the national coach's names", () => {
  it("gives each of the 14 nations its article in French, and the Netherlands theirs in English", () => {
    const fr = namesIn("fr");
    expect(NATION_CODES.map((code) => nationIn(code, "of", fr.tCoach, fr.tWorld))).toEqual([
      "d'Allemagne",
      "d'Angleterre",
      "d'Espagne",
      "de France",
      "d'Italie",
      "du Portugal",
      "des Pays-Bas",
      "de Belgique",
      "de Croatie",
      "du Brésil",
      "d'Argentine",
      "du Maroc",
      "du Sénégal",
      "de Côte d'Ivoire",
    ]);
    expect(NATION_CODES.map((code) => nationIn(code, "the", fr.tCoach, fr.tWorld))).toEqual([
      "l'Allemagne",
      "l'Angleterre",
      "l'Espagne",
      "la France",
      "l'Italie",
      "le Portugal",
      "les Pays-Bas",
      "la Belgique",
      "la Croatie",
      "le Brésil",
      "l'Argentine",
      "le Maroc",
      "le Sénégal",
      "la Côte d'Ivoire",
    ]);
    expect(nationsIn(["POR", "NED"], "the", fr.tCoach, fr.tWorld, "fr")).toBe("le Portugal et les Pays-Bas");

    const en = namesIn("en");
    expect(nationIn("NED", "of", en.tCoach, en.tWorld)).toBe("the Netherlands");
    expect(nationIn("CIV", "the", en.tCoach, en.tWorld)).toBe("Ivory Coast");
    expect(nationsIn(["POR", "NED"], "the", en.tCoach, en.tWorld, "en")).toBe("Portugal and the Netherlands");
  });

  it("names a tournament, with its year when given, and the stage of a national match", () => {
    const { tNations } = namesIn("fr");
    expect(tournamentName("int.world", 2030, tNations)).toBe("Coupe des Hémisphères 2030");
    expect(tournamentName("int.eu", null, tNations)).toBe("Coupe du Vieux Continent");
    expect(nationalStage({ competition: "int.qual.eu", round: 3, pool: null }, tNations)).toBe("Éliminatoires, 3e journée");
    expect(nationalStage({ competition: "int.friendly", round: 1, pool: null }, tNations)).toBe("Match amical");
    expect(nationalStage({ competition: "int.world", round: 2, pool: 1 }, tNations)).toBe("Groupe B, 2e journée");
    expect(nationalStage({ competition: "int.world", round: 4, pool: null }, tNations)).toBe("Demi-finale");
    expect(nationalStage({ competition: "int.eu", round: 5, pool: null }, tNations)).toBe("Finale");
    expect(nationalStage({ competition: "int.qual.world", round: 1, pool: null }, namesIn("en").tNations)).toBe("Qualifiers, matchday 1");
  });

  it("words the federation's objective and what goes past it, or a nation without a tournament this cycle", () => {
    const fr = namesIn("fr");
    const line = (objective: CoachStage | null, tournament: TournamentCode = "int.world") =>
      objectiveLine({ code: "POR", objective, tournament, year: 2030 }, fr);
    expect(line(1)).toBe("Objectif : se qualifier pour la Coupe des Hémisphères 2030");
    expect(line(2)).toBe("Objectif : se qualifier pour la Coupe des Hémisphères 2030, puis atteindre les demi-finales");
    expect(line(3)).toBe("Objectif : se qualifier pour la Coupe des Hémisphères 2030, puis atteindre la finale");
    expect(objectiveLine({ code: "MAR", objective: null, tournament: "int.eu", year: 2028 }, fr)).toBe(
      "Pas de tournoi pour le Maroc ce cycle : prépare le suivant",
    );
    expect(exceededLine(1, fr.tCoach)).toBe("Dépassé : les demi-finales");
    expect(exceededLine(2, fr.tCoach)).toBe("Dépassé : la finale");
    expect(exceededLine(3, fr.tCoach)).toBe("Dépassé : le titre");
    expect(exceededLine(null, fr.tCoach)).toBeNull();
    expect(fr.tCoach("rank", { rank: 4 })).toBe("4e nation par la force");
    expect(fr.tCoach("rank", { rank: 1 })).toBe("1re nation par la force");

    const en = namesIn("en");
    expect(objectiveLine({ code: "NED", objective: 2, tournament: "int.eu", year: 2028 }, en)).toBe(
      "Objective: qualify for the Old Continent Cup 2028, then reach the semi-finals",
    );
    expect(objectiveLine({ code: "MAR", objective: null, tournament: "int.eu", year: 2028 }, en)).toBe(
      "No tournament for Morocco this cycle: prepare for the next one",
    );
    expect(exceededLine(2, en.tCoach)).toBe("Exceeded: the final");
    expect(en.tCoach("rank", { rank: 4 })).toBe("4th nation by strength");
  });

  it("writes a break's days « du 4 au 8 sept. », both months when it spans two", () => {
    const day = (month: number, date: number) => new Date(Date.UTC(2026, month, date));
    expect(dayRange(day(8, 4), day(8, 8), "fr")).toEqual({ from: "4", to: "8 sept." });
    expect(dayRange(day(8, 1), day(8, 5), "fr")).toEqual({ from: "1er", to: "5 sept." });
    expect(dayRange(day(8, 30), day(9, 4), "fr")).toEqual({ from: "30 sept.", to: "4 oct." });
    expect(dayRange(day(8, 1), day(8, 5), "en")).toEqual({ from: "1", to: "5 Sept" });
    expect(namesIn("fr").tCoach("firstBreak", dayRange(day(8, 4), day(8, 8), "fr"))).toBe("Première trêve : du 4 au 8 sept.");
    expect(namesIn("en").tCoach("firstBreak", dayRange(day(8, 4), day(8, 8), "en"))).toBe("First break: 4 to 8 Sept");
  });
});
