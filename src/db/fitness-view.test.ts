import { describe, expect, it } from "vitest";
import { FITNESS_RECOVERY_PER_DAY, FULL_FITNESS } from "../engine/balance";
import { fitnessAtKickOff, wholeDaysBetween } from "./fitness-view";

const day = (date: number): Date => new Date(Date.UTC(2026, 7, date));

describe("wholeDaysBetween", () => {
  it("counts the days from one date to a later one, none to the same day or an earlier one", () => {
    expect(wholeDaysBetween(day(22), day(25))).toBe(3);
    expect(wholeDaysBetween(day(22), day(29))).toBe(7);
    expect(wholeDaysBetween(day(22), day(22))).toBe(0);
    expect(wholeDaysBetween(day(25), day(22))).toBe(0);
  });

  it("counts across a month's end", () => {
    expect(wholeDaysBetween(day(29), new Date(Date.UTC(2026, 8, 2)))).toBe(4);
  });
});

describe("fitnessAtKickOff", () => {
  it("gives a starter of today's match the days of rest before the next one", () => {
    expect(fitnessAtKickOff(70, day(22), day(25))).toBe(Math.min(FULL_FITNESS, 70 + 3 * FITNESS_RECOVERY_PER_DAY));
  });

  it("never goes past full fitness", () => {
    expect(fitnessAtKickOff(70, day(22), new Date(Date.UTC(2026, 9, 1)))).toBe(FULL_FITNESS);
    expect(fitnessAtKickOff(FULL_FITNESS, day(22), day(29))).toBe(FULL_FITNESS);
  });

  it("is today's fitness on the current date: without a match to come, no recovery", () => {
    expect(fitnessAtKickOff(70, day(22), day(22))).toBe(70);
  });
});
