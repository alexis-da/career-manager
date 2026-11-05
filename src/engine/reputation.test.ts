import { describe, expect, it } from "vitest";
import { reputationAfterSeason, reputationRanks } from "./reputation";

describe("reputationRanks", () => {
  it("ranks a division by reputation, one club a rank: equal reputations by wage budget, then by slug", () => {
    const ranks = reputationRanks([
      { key: "a", reputation: 70, wageBudget: 40_000_000, slug: "zeta" },
      { key: "b", reputation: 82, wageBudget: 90_000_000, slug: "beta" },
      { key: "c", reputation: 70, wageBudget: 55_000_000, slug: "gamma" },
      { key: "d", reputation: 70, wageBudget: 40_000_000, slug: "alpha" },
      { key: "e", reputation: 55, wageBudget: 20_000_000, slug: "delta" },
    ]);

    expect(Object.fromEntries(ranks)).toEqual({ b: 1, c: 2, d: 3, a: 4, e: 5 });
  });

  it("gives the same ranks whatever the order of the clubs", () => {
    const clubs = [
      { key: 1, reputation: 60, wageBudget: 10, slug: "b" },
      { key: 2, reputation: 60, wageBudget: 10, slug: "a" },
      { key: 3, reputation: 61, wageBudget: 5, slug: "c" },
    ];

    expect(reputationRanks(clubs)).toEqual(reputationRanks([...clubs].reverse()));
    expect(Object.fromEntries(reputationRanks(clubs))).toEqual({ 3: 1, 2: 2, 1: 3 });
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
