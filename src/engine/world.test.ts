import { describe, expect, it } from "vitest";
import { firstMatchdayDate, seasonEndDate, seasonStartDate, seasonStartYear, WORLD_START_DATE } from "./world";

describe("world calendar", () => {
  it("plays the first matchday on the third Saturday of August", () => {
    expect(firstMatchdayDate(2024).toISOString()).toBe("2024-08-17T00:00:00.000Z");
    expect(firstMatchdayDate(2025).toISOString()).toBe("2025-08-16T00:00:00.000Z");
    for (let year = 2024; year < 2050; year++) {
      const date = firstMatchdayDate(year);
      expect(date.getUTCDay()).toBe(6);
      expect(date.getUTCMonth()).toBe(7);
      expect(date.getUTCDate()).toBeGreaterThanOrEqual(15);
      expect(date.getUTCDate()).toBeLessThanOrEqual(21);
    }
  });

  it("runs seasons from 1 July to 30 June", () => {
    expect(WORLD_START_DATE.toISOString()).toBe("2024-07-01T00:00:00.000Z");
    expect(seasonStartDate(2025).toISOString()).toBe("2025-07-01T00:00:00.000Z");
    expect(seasonEndDate(2024).toISOString()).toBe("2025-06-30T00:00:00.000Z");
    expect(seasonStartYear(seasonEndDate(2024))).toBe(2024);
    expect(seasonStartYear(seasonStartDate(2025))).toBe(2025);
  });
});
