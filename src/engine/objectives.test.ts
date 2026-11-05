import { describe, expect, it } from "vitest";
import { budgetCoefficient, divisionOf, rankingObjective, rankingOutcome } from "./objectives";

const ENGLAND_1 = divisionOf("en.1", 1, 20, 2); // three relegated
const ENGLAND_2 = divisionOf("en.2", 2, 24, 2); // three promoted
const FRANCE_1 = divisionOf("fr.1", 1, 18, 2); // two relegated
const FRANCE_2 = divisionOf("fr.2", 2, 18, 2); // two promoted
const ENGLAND_ALONE = divisionOf("en.1", 1, 20, 1); // a worldVersion 1 save: one division, nobody goes down

describe("divisionOf", () => {
  it("gives a worldVersion 2 league its country's places going up or down, a worldVersion 1 league none", () => {
    expect(ENGLAND_1).toEqual({ clubCount: 20, tier: 1, promotionPlaces: 0, relegationPlaces: 3 });
    expect(FRANCE_2).toEqual({ clubCount: 18, tier: 2, promotionPlaces: 2, relegationPlaces: 0 });
    expect(ENGLAND_ALONE).toEqual({ clubCount: 20, tier: 1, promotionPlaces: 0, relegationPlaces: 0 });
  });
});

describe("rankingObjective", () => {
  it("asks the three best expected of a first division for the top three, the title exceeding it", () => {
    expect(rankingObjective(1, ENGLAND_1)).toEqual({ variant: "TOP", target: 3, exceed: 1 });
    expect(rankingObjective(3, FRANCE_1)).toEqual({ variant: "TOP", target: 3, exceed: 1 });
    expect(rankingObjective(2, ENGLAND_ALONE)).toEqual({ variant: "TOP", target: 3, exceed: 1 });
  });

  it("asks the four best expected of a second division to go up, its title exceeding it", () => {
    expect(rankingObjective(4, ENGLAND_2)).toEqual({ variant: "PROMOTION", target: 3, exceed: 1 });
    expect(rankingObjective(1, FRANCE_2)).toEqual({ variant: "PROMOTION", target: 2, exceed: 1 });
  });

  it("asks those expected in the relegation zone or just above it to stay up, three places above the zone exceeding it", () => {
    expect(rankingObjective(15, ENGLAND_1)).toEqual({ variant: "SURVIVAL", target: 17, exceed: 15 });
    expect(rankingObjective(20, ENGLAND_1)).toEqual({ variant: "SURVIVAL", target: 17, exceed: 15 });
    expect(rankingObjective(14, FRANCE_1)).toEqual({ variant: "SURVIVAL", target: 16, exceed: 14 });
  });

  it("asks the others for their expected rank plus two in a first division, plus three in a second, never the last place", () => {
    expect(rankingObjective(14, ENGLAND_1)).toEqual({ variant: "FINISH", target: 16, exceed: 13 });
    expect(rankingObjective(4, ENGLAND_1)).toEqual({ variant: "FINISH", target: 6, exceed: 3 });
    expect(rankingObjective(5, ENGLAND_2)).toEqual({ variant: "FINISH", target: 8, exceed: 5 });
    expect(rankingObjective(23, ENGLAND_2)).toEqual({ variant: "FINISH", target: 23, exceed: 20 });
    expect(rankingObjective(20, ENGLAND_ALONE)).toEqual({ variant: "FINISH", target: 19, exceed: 16 });
  });
});

describe("rankingOutcome", () => {
  it("exceeds at or above the exceeding rank, achieves at or above the target, misses below it", () => {
    const objective = { target: 8, exceed: 5 };

    expect(rankingOutcome(objective, 5)).toBe("EXCEEDED");
    expect(rankingOutcome(objective, 6)).toBe("ACHIEVED");
    expect(rankingOutcome(objective, 8)).toBe("ACHIEVED");
    expect(rankingOutcome(objective, 9)).toBe("MISSED");
  });
});

describe("budgetCoefficient", () => {
  it("adds each outcome's hundredths to 100", () => {
    expect(budgetCoefficient({})).toBe(100);
    expect(budgetCoefficient({ ranking: "EXCEEDED" })).toBe(120);
    expect(budgetCoefficient({ ranking: "ACHIEVED" })).toBe(110);
    expect(budgetCoefficient({ ranking: "MISSED" })).toBe(85);
    expect(budgetCoefficient({ ranking: "ACHIEVED", cup: "MISSED", chosen: "ACHIEVED" })).toBe(115);
  });

  it("stays within 70 and 140", () => {
    expect(budgetCoefficient({ ranking: "EXCEEDED", cup: "EXCEEDED", chosen: "ACHIEVED" })).toBe(140);
    expect(budgetCoefficient({ ranking: "MISSED", cup: "MISSED", chosen: "MISSED" })).toBe(80);
  });
});
