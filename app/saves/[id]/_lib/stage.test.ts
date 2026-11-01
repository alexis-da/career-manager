import { describe, expect, it } from "vitest";
import { testTranslator } from "@/src/i18n/test-intl";
import { cupLabel } from "./seasons";
import { cupRoundReached, extraTimeNote, matchResultFor, penaltiesNote, stageLabel } from "./stage";

const regulation = { decidedBy: null, homePenalties: null, awayPenalties: null };
const stage = { fr: testTranslator("fr", "stage"), en: testTranslator("en", "stage") };
const score = { fr: testTranslator("fr", "score"), en: testTranslator("en", "score") };

describe("match stage and cup notes", () => {
  it("names a cup tie by its round, never as a matchday", () => {
    expect(stageLabel({ round: 12, cup: false }, stage.fr)).toBe("Journée 12");
    expect([1, 2, 3, 4, 5, 6].map((round) => stageLabel({ round, cup: true }, stage.fr))).toEqual([
      "Coupe — Tour préliminaire",
      "Coupe — 16es",
      "Coupe — 8es",
      "Coupe — Quarts",
      "Coupe — Demi-finale",
      "Coupe — Finale",
    ]);
  });

  it("names them in English too", () => {
    expect(stageLabel({ round: 12, cup: false }, stage.en)).toBe("Matchday 12");
    expect([1, 2, 3, 4, 5, 6].map((round) => stageLabel({ round, cup: true }, stage.en))).toEqual([
      "Cup — Preliminary round",
      "Cup — Round of 32",
      "Cup — Round of 16",
      "Cup — Quarter-final",
      "Cup — Semi-final",
      "Cup — Final",
    ]);
    expect([cupRoundReached(4, stage.en), cupRoundReached(9, stage.en)]).toEqual(["quarter-finals", "round 9"]);
  });

  it("says how far the club went in the cup", () => {
    expect(cupLabel({ cupRound: 4, cupWinner: false }, stage.fr)).toBe("Coupe : quarts de finale");
    expect(cupLabel({ cupRound: 6, cupWinner: true }, stage.fr)).toBe("Vainqueur de la Coupe");
    expect(cupLabel({ cupRound: null, cupWinner: false }, stage.fr)).toBeNull();
    expect(cupLabel({ cupRound: 2, cupWinner: false }, stage.en)).toBe("Cup: round of 32");
  });

  it("notes extra time and the shoot-out, home first", () => {
    expect([extraTimeNote(regulation, score.fr), penaltiesNote(regulation, score.fr)]).toEqual([null, null]);
    expect(extraTimeNote({ ...regulation, decidedBy: "REGULATION" }, score.fr)).toBeNull();
    expect(extraTimeNote({ ...regulation, decidedBy: "EXTRA_TIME" }, score.fr)).toBe("a.p.");
    const shootout = { decidedBy: "PENALTIES" as const, homePenalties: 5, awayPenalties: 3 };
    expect([extraTimeNote(shootout, score.fr), penaltiesNote(shootout, score.fr)]).toEqual(["a.p.", "5-3 t.a.b."]);
    expect([extraTimeNote(shootout, score.en), penaltiesNote(shootout, score.en)]).toEqual(["a.e.t.", "5-3 pens"]);
  });

  it("gives a shoot-out's result to its winner, a league draw stays a draw", () => {
    const shootout = { decidedBy: "PENALTIES" as const, homePenalties: 3, awayPenalties: 5, homeGoals: 2, awayGoals: 2 };
    expect([matchResultFor(shootout, true), matchResultFor(shootout, false)]).toEqual(["L", "W"]);
    expect(matchResultFor({ ...regulation, homeGoals: 1, awayGoals: 1 }, true)).toBe("D");
    expect(matchResultFor({ ...regulation, decidedBy: "EXTRA_TIME", homeGoals: 3, awayGoals: 2 }, false)).toBe("L");
  });
});
