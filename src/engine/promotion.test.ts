import { describe, expect, it } from "vitest";
import { PROMOTION_RELEGATION } from "./balance";
import { applyPromotionRelegation, countryOf, type CompetitionStanding } from "./promotion";
import { computeStandings, type MatchScore } from "./standings";

/** A final table of `size` clubs "<code>-01" (first) to "<code>-NN" (last). */
function table(code: string, size: number): CompetitionStanding["table"] {
  return Array.from({ length: size }, (_, index) => ({ club: `${code}-${String(index + 1).padStart(2, "0")}`, rank: index + 1 }));
}

const standing = (code: string, size: number): CompetitionStanding => ({
  code,
  tier: code.endsWith(".1") ? 1 : 2,
  table: table(code, size),
});

describe("applyPromotionRelegation", () => {
  it("swaps the 3 last of the first division with the 3 first of the second (England)", () => {
    const moves = applyPromotionRelegation([standing("en.1", 20), standing("en.2", 24)], PROMOTION_RELEGATION);

    expect(moves).toEqual([
      { club: "en.1-18", from: "en.1", to: "en.2", reason: "RELEGATED", rank: 18 },
      { club: "en.1-19", from: "en.1", to: "en.2", reason: "RELEGATED", rank: 19 },
      { club: "en.1-20", from: "en.1", to: "en.2", reason: "RELEGATED", rank: 20 },
      { club: "en.2-01", from: "en.2", to: "en.1", reason: "PROMOTED", rank: 1 },
      { club: "en.2-02", from: "en.2", to: "en.1", reason: "PROMOTED", rank: 2 },
      { club: "en.2-03", from: "en.2", to: "en.1", reason: "PROMOTED", rank: 3 },
    ]);
  });

  it("swaps 2 and 2 in Germany and France, 3 and 3 in Spain and Italy, keeping every division's size", () => {
    const sizes: [string, number][] = [
      ["de.1", 18], ["de.2", 18], ["en.1", 20], ["en.2", 24], ["es.1", 20],
      ["es.2", 22], ["fr.1", 18], ["fr.2", 18], ["it.1", 20], ["it.2", 20],
    ];
    const moves = applyPromotionRelegation(sizes.map(([code, size]) => standing(code, size)), PROMOTION_RELEGATION);
    const count = (country: string, reason: string) =>
      moves.filter((move) => countryOf(move.from) === country && move.reason === reason).length;

    expect(["de", "en", "es", "fr", "it"].map((country) => [count(country, "RELEGATED"), count(country, "PROMOTED")])).toEqual([
      [2, 2],
      [3, 3],
      [3, 3],
      [2, 2],
      [3, 3],
    ]);
    for (const [code, size] of sizes) {
      const after = size - moves.filter((move) => move.from === code).length + moves.filter((move) => move.to === code).length;
      expect(after).toBe(size);
    }
  });

  it("moves no club in a country with a single division, as in a worldVersion 1 save", () => {
    const firstDivisions = ["de.1", "en.1", "es.1", "fr.1", "it.1"].map((code) => standing(code, 20));

    expect(applyPromotionRelegation(firstDivisions, PROMOTION_RELEGATION)).toEqual([]);
    expect(applyPromotionRelegation([standing("fr.2", 18)], PROMOTION_RELEGATION)).toEqual([]);
  });

  it("breaks a tie on points as the league table does: goal difference, then goals scored, then key", () => {
    // Second division of four: b and c finish on 4 points; c has the better goal difference and goes up with a.
    const scores: MatchScore[] = [
      { home: "a", away: "d", homeGoals: 3, awayGoals: 0 },
      { home: "a", away: "b", homeGoals: 1, awayGoals: 0 },
      { home: "a", away: "c", homeGoals: 1, awayGoals: 0 },
      { home: "b", away: "d", homeGoals: 1, awayGoals: 0 },
      { home: "c", away: "d", homeGoals: 4, awayGoals: 0 },
      { home: "b", away: "c", homeGoals: 1, awayGoals: 1 },
    ];
    const lower = computeStandings(scores);
    const upper = table("fr.1", 4);

    expect(lower.filter((row) => row.points === 4).map((row) => row.club)).toEqual(["c", "b"]);
    expect(
      applyPromotionRelegation(
        [
          { code: "fr.1", tier: 1, table: upper },
          { code: "fr.2", tier: 2, table: lower },
        ],
        { fr: 2 },
      ).filter((move) => move.reason === "PROMOTED"),
    ).toEqual([
      { club: "a", from: "fr.2", to: "fr.1", reason: "PROMOTED", rank: 1 },
      { club: "c", from: "fr.2", to: "fr.1", reason: "PROMOTED", rank: 2 },
    ]);
  });

  it("refuses a country without a rule, or too small for its rule", () => {
    expect(() => applyPromotionRelegation([standing("pt.1", 18), standing("pt.2", 18)], PROMOTION_RELEGATION)).toThrow(/pt/);
    expect(() => applyPromotionRelegation([standing("fr.1", 2), standing("fr.2", 18)], PROMOTION_RELEGATION)).toThrow(RangeError);
  });
});
