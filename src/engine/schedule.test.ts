import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { generateBalancedSchedule, generateSchedule, matchdayDates } from "./schedule";

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

describe("matchdayDates (worldVersion 2)", () => {
  const DAY_MS = 86_400_000;
  const FIRST = new Date(Date.UTC(2026, 7, 15)); // third Saturday of August 2026
  const LAST = new Date(Date.UTC(2027, 4, 15)); // the 40th Saturday
  const weekday = (date: Date): number => date.getUTCDay();

  it.each([
    // [matchdays, Saturdays played, Tuesdays]
    [46, 40, 6],
    [42, 40, 2],
    [38, 38, 0],
    [34, 34, 0],
  ])("places %i matchdays on %i Saturdays and %i Tuesdays, from the first Saturday to the last", (rounds, saturdays, tuesdays) => {
    const dates = matchdayDates(rounds, 2026);

    expect(dates).toHaveLength(rounds);
    expect(dates[0]).toEqual(FIRST);
    expect(dates.at(-1)).toEqual(LAST);
    expect(dates.filter((date) => weekday(date) === 6)).toHaveLength(saturdays);
    expect(dates.filter((date) => weekday(date) === 2)).toHaveLength(tuesdays);
    expect(dates.every((date, index) => index === 0 || date > dates[index - 1])).toBe(true);
    // Three days at least between two matchdays: never two on the same weekend.
    expect(dates.every((date, index) => index === 0 || date.getTime() - dates[index - 1].getTime() >= 3 * DAY_MS)).toBe(true);
  });

  it("spreads the rest weeks and the midweeks over the season, never two in a row", () => {
    const gapsInWeeks = (rounds: number) => {
      const dates = matchdayDates(rounds, 2026);
      return dates.slice(1).map((date, index) => (date.getTime() - dates[index].getTime()) / (7 * DAY_MS));
    };
    // 34 matchdays: 6 rest weeks, each a gap of two weeks, apart from one another.
    const restGaps = gapsInWeeks(34).flatMap((gap, index) => (gap === 2 ? [index] : []));
    expect(restGaps).toHaveLength(6);
    expect(restGaps.every((index, position) => position === 0 || index - restGaps[position - 1] > 2)).toBe(true);
    expect(gapsInWeeks(34).every((gap) => gap === 1 || gap === 2)).toBe(true);
    // 46 matchdays: 6 Tuesdays, each between two Saturdays, apart from one another.
    const dates = matchdayDates(46, 2026);
    const tuesdays = dates.flatMap((date, index) => (weekday(date) === 2 ? [index] : []));
    expect(tuesdays.every((index, position) => position === 0 || index - tuesdays[position - 1] > 3)).toBe(true);
    expect(tuesdays.every((index) => weekday(dates[index - 1]) === 6 && weekday(dates[index + 1]) === 6)).toBe(true);
  });

  it("ends every season on the 40th Saturday, whatever the year", () => {
    for (const startYear of [2026, 2027, 2028]) {
      const lastSaturday = matchdayDates(34, startYear).at(-1);
      expect(matchdayDates(46, startYear).at(-1)).toEqual(lastSaturday);
      expect(lastSaturday?.getUTCMonth()).toBe(4); // May
    }
  });

  it("refuses a season it cannot place", () => {
    expect(() => matchdayDates(1, 2026)).toThrow(RangeError);
    expect(() => matchdayDates(80, 2026)).toThrow(RangeError);
  });
});

describe.each([18, 20, 22, 24])("generateBalancedSchedule with %i clubs (worldVersion 2)", (clubCount) => {
  const clubs = clubsOf(clubCount);
  const schedule = generateBalancedSchedule(clubs, FIRST_MATCHDAY, makeRng(`balanced-test:${clubCount}`));
  const roundCount = 2 * (clubCount - 1);
  const half = clubCount - 1;
  const pairKey = (a: string, b: string) => [a, b].sort().join("/");

  it("plays every club once per matchday, over 2(n − 1) weekly matchdays", () => {
    for (let round = 1; round <= roundCount; round++) {
      const matches = schedule.filter((match) => match.round === round);
      expect(matches).toHaveLength(clubCount / 2);
      expect(new Set(matches.flatMap((match) => [match.home, match.away])).size).toBe(clubCount);
      expect(new Set(matches.map((match) => match.scheduledAt.getTime())).size).toBe(1);
    }
    expect(schedule.at(-1)?.round).toBe(roundCount);
  });

  it("makes each pair meet once per half, home and away swapped in the second", () => {
    const firstHalf = schedule.filter((match) => match.round <= half);
    const secondHalf = schedule.filter((match) => match.round > half);
    const expectedPairs = (clubCount * (clubCount - 1)) / 2;

    expect(new Set(firstHalf.map((match) => pairKey(match.home, match.away))).size).toBe(expectedPairs);
    expect(new Set(secondHalf.map((match) => pairKey(match.home, match.away))).size).toBe(expectedPairs);
    const firstHome = new Map(firstHalf.map((match) => [pairKey(match.home, match.away), match.home]));
    for (const match of secondHalf) {
      expect(match.away).toBe(firstHome.get(pairKey(match.home, match.away)));
    }
  });

  it("never makes a club play more than two matches in a row at home or away, nor meet a club twice in a row", () => {
    for (const club of clubs) {
      const own = schedule.filter((match) => match.home === club || match.away === club).sort((a, b) => a.round - b.round);
      const venues = own.map((match) => (match.home === club ? "H" : "A")).join("");
      expect(venues, club).not.toMatch(/HHH|AAA/);
      const opponents = own.map((match) => (match.home === club ? match.away : match.home));
      expect(opponents.every((opponent, index) => index === 0 || opponent !== opponents[index - 1])).toBe(true);
    }
  });

  it("is the same for the same seed, and another for another seed", () => {
    expect(generateBalancedSchedule(clubs, FIRST_MATCHDAY, makeRng(`balanced-test:${clubCount}`))).toEqual(schedule);
    expect(generateBalancedSchedule(clubs, FIRST_MATCHDAY, makeRng("another-seed"))).not.toEqual(schedule);
  });
});
