import { describe, expect, it } from "vitest";
import { seasonEndDate, seasonStartDate } from "@/src/engine/world";
import { isLastCompletedSeason } from "./seasons";

describe("isLastCompletedSeason", () => {
  it("holds from the first day of the next season, where moving on leaves the save, to its last", () => {
    expect(isLastCompletedSeason(2026, seasonStartDate(2027))).toBe(true);
    expect(isLastCompletedSeason(2026, seasonEndDate(2027))).toBe(true);
  });

  it("does not hold for an older season", () => {
    expect(isLastCompletedSeason(2026, seasonStartDate(2028))).toBe(false);
  });

  it("does not hold for the season of the save's date", () => {
    expect(isLastCompletedSeason(2026, seasonEndDate(2026))).toBe(false);
  });
});
