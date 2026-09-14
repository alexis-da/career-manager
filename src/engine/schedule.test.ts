import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { generateSchedule } from "./schedule";

const FIRST_MATCHDAY = new Date(Date.UTC(2024, 7, 17));
const WEEK_MS = 7 * 86_400_000;

const clubsOf = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `club-${String(index + 1).padStart(2, "0")}`);

describe.each([2, 4, 18, 20])("generateSchedule with %i clubs", (clubCount) => {
  const clubs = clubsOf(clubCount);
  const schedule = generateSchedule(clubs, FIRST_MATCHDAY, makeRng(`schedule-test:${clubCount}`));
  const roundCount = 2 * (clubCount - 1);

  it("has 2(n − 1) matchdays", () => {
    expect([...new Set(schedule.map((match) => match.round))].sort((a, b) => a - b)).toEqual(
      Array.from({ length: roundCount }, (_, index) => index + 1),
    );
    expect(schedule).toHaveLength(roundCount * (clubCount / 2));
  });

  it("makes every club meet every other club twice, once at home", () => {
    const expected = clubs.flatMap((home) => clubs.filter((away) => away !== home).map((away) => `${home} > ${away}`));

    expect(schedule.map((match) => `${match.home} > ${match.away}`).sort()).toEqual(expected.sort());
  });

  it("makes every club play exactly once per matchday", () => {
    for (let round = 1; round <= roundCount; round++) {
      const playing = schedule.filter((match) => match.round === round).flatMap((match) => [match.home, match.away]);
      expect(playing.sort()).toEqual([...clubs].sort());
    }
  });

  it("plays one matchday a week from the first matchday", () => {
    for (const match of schedule) {
      expect(match.scheduledAt.getTime()).toBe(FIRST_MATCHDAY.getTime() + (match.round - 1) * WEEK_MS);
    }
  });
});

describe("generateSchedule", () => {
  const clubs = clubsOf(20);

  it("returns the same schedule for the same seed and another one for a different seed", () => {
    const schedule = (seed: string) => generateSchedule(clubs, FIRST_MATCHDAY, makeRng(seed));

    expect(schedule("save-a")).toEqual(schedule("save-a"));
    expect(schedule("save-a")).not.toEqual(schedule("save-b"));
  });

  it("rejects an odd number of clubs and duplicates", () => {
    expect(() => generateSchedule(clubsOf(5), FIRST_MATCHDAY, makeRng("x"))).toThrow(RangeError);
    expect(() => generateSchedule(["a", "a"], FIRST_MATCHDAY, makeRng("x"))).toThrow(RangeError);
  });
});
