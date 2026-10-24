import { describe, expect, it } from "vitest";
import { extraTimeNote, matchResultFor, penaltiesNote, stageLabel, stageShortLabel } from "./stage";

const regulation = { decidedBy: null, homePenalties: null, awayPenalties: null };

describe("match stage and cup notes", () => {
  it("names a cup tie by its round, never as a matchday", () => {
    expect(stageLabel({ round: 12, cup: false })).toBe("Journée 12");
    expect([1, 2, 3, 4, 5, 6].map((round) => stageLabel({ round, cup: true }))).toEqual([
      "Coupe — Tour préliminaire",
      "Coupe — 16es",
      "Coupe — 8es",
      "Coupe — Quarts",
      "Coupe — Demi-finale",
      "Coupe — Finale",
    ]);
    expect(stageShortLabel({ round: 7, cup: false })).toBe("J7");
    expect(stageShortLabel({ round: 4, cup: true })).toBe("Coupe — Quarts");
  });

  it("notes extra time and the shoot-out, home first", () => {
    expect([extraTimeNote(regulation), penaltiesNote(regulation)]).toEqual([null, null]);
    expect(extraTimeNote({ ...regulation, decidedBy: "REGULATION" })).toBeNull();
    expect(extraTimeNote({ ...regulation, decidedBy: "EXTRA_TIME" })).toBe("a.p.");
    const shootout = { decidedBy: "PENALTIES" as const, homePenalties: 5, awayPenalties: 3 };
    expect([extraTimeNote(shootout), penaltiesNote(shootout)]).toEqual(["a.p.", "5-3 t.a.b."]);
  });

  it("gives a shoot-out's result to its winner, a league draw stays a draw", () => {
    const shootout = { decidedBy: "PENALTIES" as const, homePenalties: 3, awayPenalties: 5, homeGoals: 2, awayGoals: 2 };
    expect([matchResultFor(shootout, true), matchResultFor(shootout, false)]).toEqual(["L", "W"]);
    expect(matchResultFor({ ...regulation, homeGoals: 1, awayGoals: 1 }, true)).toBe("D");
    expect(matchResultFor({ ...regulation, decidedBy: "EXTRA_TIME", homeGoals: 3, awayGoals: 2 }, false)).toBe("L");
  });
});
