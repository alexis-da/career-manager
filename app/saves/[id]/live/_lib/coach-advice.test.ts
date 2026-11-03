import { describe, expect, it } from "vitest";
import { MAX_SUBSTITUTIONS } from "@/src/engine/balance";
import { formationPositions } from "@/src/engine/formations";
import { testTranslator } from "@/src/i18n/test-intl";
import { coachAdvice, type MatchSituation } from "./coach-advice";
import type { ChangeReason, HalfTimeRules, HalfTimeState, SuggestedChange } from "./half-time-moves";

const t = testTranslator("fr", "halfTime");
const tEnglish = testTranslator("en", "halfTime");

// A 4-3-3 eleven, s0 to s10, named after their slot, and three substitutes.
const STARTERS = formationPositions("4-3-3").map((_, slot) => `s${slot}`);
const BENCH = ["b1", "b2", "b3"];
const PLAYERS = new Map([...STARTERS, ...BENCH].map((key) => [key, { lastName: key.toUpperCase() }]));

const STATE: HalfTimeState = { formation: "4-3-3", starters: STARTERS, bench: BENCH, off: [], substitutions: [] };
const RULES: HalfTimeRules = { injured: new Set(), sentOffSlots: new Set(), substitutionsBefore: 0, maxSubstitutions: MAX_SUBSTITUTIONS };

const situation = (overrides: Partial<MatchSituation> = {}): MatchSituation => ({
  phase: "HALF_TIME",
  goalDifference: 0,
  state: STATE,
  rules: RULES,
  suggestion: null,
  booked: [],
  players: PLAYERS,
  ...overrides,
});

const change = (out: string, incoming: string, reason: ChangeReason = "level"): SuggestedChange => ({
  slot: 1,
  position: "RB",
  out,
  in: incoming,
  reason,
  gain: 2,
});

/** The assistant's sentences, in order. */
const said = (overrides: Partial<MatchSituation> = {}): string[] => coachAdvice(situation(overrides), t).map((line) => line.text);

const line = (topic: string, overrides: Partial<MatchSituation> = {}, translator = t): string | undefined =>
  coachAdvice(situation(overrides), translator).find((candidate) => candidate.topic === topic)?.text;

describe("what the assistant says", () => {
  it("says the score from the managed club's side, and the extra time to come", () => {
    expect(line("score", { goalDifference: 2 })).toBe("On mène.");
    expect(line("score", { goalDifference: 0 })).toBe("C'est à égalité.");
    expect(line("score", { goalDifference: -1 })).toBe("On est menés.");
    expect(line("score", { phase: "REGULATION_END" })).toBe("À égalité après 90 minutes : prolongation, puis tirs au but s'il le faut.");
    expect(line("score", { goalDifference: 1 }, tEnglish)).toBe("We're ahead.");
  });

  it("gives the reason of the change, naming both players", () => {
    expect(line("change", { suggestion: change("s1", "b1") })).toBe("B1 ferait mieux que S1 à ce poste.");
    expect(line("change", { suggestion: change("s1", "b1", "form") })).toBe("B1 est plus en forme que S1 : il ferait mieux à ce poste.");
    expect(line("change", { suggestion: change("s1", "b1", "injured") })).toBe("B1 est le mieux placé pour remplacer S1.");
    expect(line("change", { suggestion: change("s1", "b1") }, tEnglish)).toBe("B1 would do better than S1 in this position.");
  });

  it("says when the substitute is chosen for his freshness", () => {
    expect(line("change", { suggestion: change("s1", "b1", "fitness") })).toBe("B1 est plus frais que S1 : il ferait mieux à ce poste.");
    expect(line("change", { suggestion: change("s1", "b1", "fitness") }, tEnglish)).toBe(
      "B1 is fresher than S1: he would do better in this position.",
    );
  });

  it("says why there is no change: nobody better, none left, or nobody on the bench", () => {
    expect(line("change")).toBe("Personne sur le banc ne ferait mieux.");
    expect(line("change", { rules: { ...RULES, substitutionsBefore: MAX_SUBSTITUTIONS } })).toBe("Il ne te reste aucun remplacement.");
    expect(line("change", { state: { ...STATE, bench: [] } })).toBe("Plus aucun remplaçant.");
  });

  it("does not claim the bench has nobody better once the manager has made his own changes", () => {
    const changed = { ...STATE, substitutions: [{ in: "b1", out: "s1" }], bench: ["b2", "b3"], off: ["s1"] };

    expect(line("change", { state: changed })).toBe("Je ne changerais rien d'autre.");
  });

  it("names an injured player, and promises a substitute only if one can come on", () => {
    const injured = { ...RULES, injured: new Set(["s4"]) };
    const expected = "S4 est sorti blessé : sans changement de ta part, le meilleur remplaçant au poste entre.";

    expect(line("injured", { rules: injured })).toBe(expected);
    expect(line("injured", { rules: { ...injured, substitutionsBefore: 3 } })).toBe(expected);
    expect(line("injured", { rules: { ...injured, injured: new Set(["s4", "s7"]) } })).toBe(
      "S4, S7 sont sortis blessés : sans changement de ta part, le meilleur remplaçant au poste entre.",
    );
    expect(line("injured", { rules: { ...injured, substitutionsBefore: MAX_SUBSTITUTIONS } })).toBe(
      "S4 est sorti blessé et ne peut pas être remplacé : on repart à dix.",
    );
    expect(line("injured", { rules: injured, state: { ...STATE, bench: [] } })).toBe("S4 est sorti blessé et ne peut pas être remplacé : on repart à dix.");
    expect(line("injured", { rules: { ...injured, injured: new Set(["s4", "s7"]), substitutionsBefore: 4 } })).toBe(
      "S4, S7 sont sortis blessés et ne peuvent pas tous être remplacés : on repart à dix.",
    );
  });

  it("promises no substitute at the end of regulation time, where resuming without a change brings nobody on", () => {
    const injured = { ...RULES, injured: new Set(["s4"]), substitutionsBefore: MAX_SUBSTITUTIONS, maxSubstitutions: MAX_SUBSTITUTIONS + 1 };

    expect(line("injured", { phase: "REGULATION_END", rules: injured })).toBe("S4 est sorti blessé.");
  });

  it("forgets an injured player once he is replaced", () => {
    const replaced = { ...STATE, starters: STARTERS.map((key) => (key === "s4" ? "b1" : key)), bench: ["b2", "b3"], substitutions: [{ in: "b1", out: "s4" }] };

    expect(line("injured", { state: replaced, rules: { ...RULES, injured: new Set(["s4"]) } })).toBeUndefined();
  });

  it("counts the players left after a red card", () => {
    const tenMen = STARTERS.map((key, slot) => (slot === 7 ? null : key));
    const nineMen = tenMen.map((key, slot) => (slot === 9 ? null : key));

    expect(line("sentOff", { state: { ...STATE, starters: tenMen }, rules: { ...RULES, sentOffSlots: new Set([7]) } })).toBe("Tu joues à dix.");
    expect(line("sentOff", { state: { ...STATE, starters: nineMen }, rules: { ...RULES, sentOffSlots: new Set([7, 9]) } })).toBe("Tu joues à neuf.");
    expect(line("sentOff", { state: { ...STATE, starters: tenMen }, rules: { ...RULES, sentOffSlots: new Set([7]) } }, tEnglish)).toBe("You're down to ten men.");
    expect(line("sentOff")).toBeUndefined();
  });

  it("warns of the booked players still on the pitch, with the number a second yellow leaves", () => {
    expect(line("booked", { booked: ["s4"] })).toBe("S4 a déjà un jaune : un second et on finit à dix.");
    expect(line("booked", { booked: ["s7", "s4"] })).toBe("S4, S7 ont déjà un jaune : un second et on finit à dix.");

    const tenMen = { state: { ...STATE, starters: STARTERS.map((key, slot) => (slot === 7 ? null : key)) }, rules: { ...RULES, sentOffSlots: new Set([7]) } };
    expect(line("booked", { ...tenMen, booked: ["s4"] })).toBe("S4 a déjà un jaune : un second et on finit à neuf.");

    // Taken off, or off injured: no longer a risk.
    const replaced = { ...STATE, starters: STARTERS.map((key) => (key === "s4" ? "b1" : key)), bench: ["b2", "b3"], off: ["s4"], substitutions: [{ in: "b1", out: "s4" }] };
    expect(line("booked", { state: replaced, booked: ["s4"] })).toBeUndefined();
    expect(line("booked", { rules: { ...RULES, injured: new Set(["s4"]) }, booked: ["s4"] })).toBeUndefined();
    // A player who left the match earlier is no one on the pitch.
    expect(line("booked", { booked: ["gone"] })).toBeUndefined();
  });

  it("says it all in order", () => {
    const tenMen = STARTERS.map((key, slot) => (slot === 7 ? null : key));

    expect(
      said({
        state: { ...STATE, starters: tenMen },
        rules: { ...RULES, injured: new Set(["s4"]), sentOffSlots: new Set([7]) },
        goalDifference: 1,
        suggestion: change("s4", "b1", "injured"),
        booked: ["s9"],
      }),
    ).toEqual([
      "S4 est sorti blessé : sans changement de ta part, le meilleur remplaçant au poste entre.",
      "Tu joues à dix.",
      "On mène.",
      "B1 est le mieux placé pour remplacer S4.",
      "S9 a déjà un jaune : un second et on finit à neuf.",
    ]);
  });

  it("speaks of the side at the restart once, when an injured player cannot be replaced after a red card", () => {
    const tenMen = STARTERS.map((key, slot) => (slot === 7 ? null : key));
    const lines = coachAdvice(
      situation({
        state: { ...STATE, starters: tenMen, bench: [] },
        rules: { ...RULES, injured: new Set(["s4"]), sentOffSlots: new Set([7]) },
      }),
      t,
    );

    expect(lines.map((entry) => entry.topic)).toEqual(["injured", "score", "change"]);
    expect(lines[0].text).toBe("S4 est sorti blessé et ne peut pas être remplacé : on repart à neuf.");
  });
});
