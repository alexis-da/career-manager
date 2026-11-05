import { describe, expect, it } from "vitest";
import { reputationAfterSeason, reputationRanks } from "./reputation";

describe("reputationRanks", () => {
  it("ranks a division by reputation, ties sharing the best rank", () => {
    const ranks = reputationRanks([
      { key: "a", reputation: 70 },
      { key: "b", reputation: 82 },
      { key: "c", reputation: 70 },
      { key: "d", reputation: 55 },
    ]);

    expect(Object.fromEntries(ranks)).toEqual({ b: 1, a: 2, c: 2, d: 4 });
  });
});

describe("reputationAfterSeason", () => {
  it("gains a point a place above the expected rank and loses one a place below, at most five", () => {
    expect(reputationAfterSeason(70, 8, 5, null)).toBe(73);
    expect(reputationAfterSeason(70, 8, 11, null)).toBe(67);
    expect(reputationAfterSeason(70, 8, 8, null)).toBe(70);
    expect(reputationAfterSeason(70, 18, 1, null)).toBe(75);
    expect(reputationAfterSeason(70, 1, 20, null)).toBe(65);
  });

  it("adds four for a promotion and takes four for a relegation, on top of the places", () => {
    expect(reputationAfterSeason(55, 6, 1, "PROMOTED")).toBe(64);
    expect(reputationAfterSeason(62, 15, 19, "RELEGATED")).toBe(54);
    expect(reputationAfterSeason(62, 20, 18, "RELEGATED")).toBe(60);
  });

  it("stays within 1–99", () => {
    expect(reputationAfterSeason(97, 10, 1, null)).toBe(99);
    expect(reputationAfterSeason(3, 1, 20, "RELEGATED")).toBe(1);
  });
});
