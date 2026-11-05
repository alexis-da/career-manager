import { describe, expect, it } from "vitest";
import { FORMATION_PROFILES } from "@/src/engine/balance";
import { FORMATION_NAMES } from "@/src/engine/formations";
import { formatDecimal } from "@/src/lib/format";
import { formationProfile, PROFILE_SCALE, profileBarWidth, signedFigure } from "./formation-profile";

describe("a formation's profile on the lineup screen", () => {
  it("gives its attack and defense in whole percent of the engine's multipliers", () => {
    expect(formationProfile("3-4-3")).toMatchObject({ attack: 5, defense: -5 });
    expect(formationProfile("4-3-3")).toMatchObject({ attack: 3, defense: -3 });
    expect(formationProfile("4-2-3-1")).toMatchObject({ attack: 2, defense: -1 });
    expect(formationProfile("4-4-2")).toMatchObject({ attack: 0, defense: 0 });
    expect(formationProfile("5-3-2")).toMatchObject({ attack: -5, defense: 5 });
    for (const formation of FORMATION_NAMES) {
      const { attack, defense } = formationProfile(formation);
      expect(1 + attack / 100).toBeCloseTo(FORMATION_PROFILES[formation].attack, 10);
      expect(1 + defense / 100).toBeCloseTo(FORMATION_PROFILES[formation].defense, 10);
    }
  });

  it("words its lean by the spread between attack and defense, the same both ways", () => {
    const leans = Object.fromEntries(FORMATION_NAMES.map((formation) => [formation, formationProfile(formation).lean]));
    expect(leans).toEqual({
      "3-4-3": "VERY_ATTACKING", // 10 points
      "4-3-3-attacking": "VERY_ATTACKING", // 10
      "3-4-2-1": "VERY_ATTACKING", // 8
      "4-2-3-1-narrow": "MORE_ATTACKING", // 6
      "4-3-3": "MORE_ATTACKING", // 6
      "4-3-3-flat": "MORE_ATTACKING", // 4
      "4-2-3-1": "SLIGHTLY_ATTACKING", // 3
      "3-4-1-2": "MORE_ATTACKING", // 4
      "3-5-2": "SLIGHTLY_ATTACKING", // 2
      "4-4-2-diamond": "SLIGHTLY_ATTACKING", // 2
      "4-4-2": "BALANCED",
      "4-4-1-1": "BALANCED",
      "4-3-3-defensive": "SLIGHTLY_DEFENSIVE", // −2
      "4-1-4-1": "MORE_DEFENSIVE", // −4
      "4-4-2-defensive": "MORE_DEFENSIVE", // −6
      "5-3-2": "VERY_DEFENSIVE", // −10
      "5-4-1": "VERY_DEFENSIVE", // −12
    });
  });

  it("fills half a bar at the largest bonus or penalty of a formation, from the middle", () => {
    // The 5-4-1's 6 %.
    expect(PROFILE_SCALE).toBe(6);
    expect(profileBarWidth(6)).toBe("50%");
    expect(profileBarWidth(-3)).toBe("25%");
    expect(profileBarWidth(9)).toBe("50%");
    expect(profileBarWidth(0)).toBe("0%");
  });

  it("signs its figures with the true minus, and zero with nothing", () => {
    expect(signedFigure(3)).toBe("+3");
    expect(signedFigure(-3)).toBe("−3");
    expect(signedFigure(0)).toBe("0");
    expect(signedFigure(-0)).toBe("0");
    expect(signedFigure(0.4, (size) => formatDecimal(size, "fr"))).toBe("+0,4");
    expect(signedFigure(-1.2, (size) => formatDecimal(size, "en"))).toBe("−1.2");
  });
});
