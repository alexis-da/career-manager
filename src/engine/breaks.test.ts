import { describe, expect, it } from "vitest";
import { cupDates } from "./cup";
import { europeDates } from "./europe";
import { BREAK_SEASON_TUESDAY_WEEKS, BREAK_WEEKS, breakWindows, matchdayDates, SEASON_SATURDAYS } from "./schedule";
import { firstMatchdayDate } from "./world";

// The calendar of a season with international breaks (docs/design/selections.md § 3): the breaks' weeks free of every
// club, the leagues, the cups and the European competitions moved around them, the season's first and last days kept.

const DAY_MS = 86_400_000;
const iso = (date: Date): string => date.toISOString().slice(0, 10);

/** The week of a date in its season: 0 for the week of the first matchday, Saturday to Friday. */
const weekOf = (date: Date, startYear: number): number =>
  Math.floor((date.getTime() - firstMatchdayDate(startYear).getTime()) / (7 * DAY_MS));
const weekdayOf = (date: Date): number => date.getUTCDay();
const SATURDAY = 6;
const TUESDAY = 2;
const WEDNESDAY = 3;

describe("breakWindows", () => {
  it("has four breaks, a Friday and the Tuesday after, early September, mid-October, mid-November, late March", () => {
    expect(breakWindows(2026).map((window) => window.dates.map(iso))).toEqual([
      ["2026-09-04", "2026-09-08"],
      ["2026-10-09", "2026-10-13"],
      ["2026-11-13", "2026-11-17"],
      ["2027-03-26", "2027-03-30"],
    ]);
    for (const startYear of [2026, 2027, 2028, 2031]) {
      for (const { dates } of breakWindows(startYear)) {
        expect(dates.map(weekdayOf)).toEqual([5, TUESDAY]);
      }
    }
  });
});

describe.each([2026, 2027, 2028])("a season with breaks starting in %i", (startYear) => {
  // The days no club plays, as days since the first matchday: from the Sunday after the Saturday of the week before a
  // break (its Wednesday excluded) to the Friday before the next Saturday.
  const clubFree = (date: Date): boolean => {
    const day = Math.round((date.getTime() - firstMatchdayDate(startYear).getTime()) / DAY_MS);
    return BREAK_WEEKS.some((week) => day >= week * 7 - 3 && day <= week * 7 + 4);
  };

  it.each([34, 38, 42, 46])("places %i matchdays: same first and last Saturdays, no club on a break, Tuesdays as needed", (rounds) => {
    const dates = matchdayDates(rounds, startYear, true);
    expect(dates).toHaveLength(rounds);
    expect(dates[0].getTime()).toBe(firstMatchdayDate(startYear).getTime());
    expect(weekOf(dates[rounds - 1], startYear)).toBe(SEASON_SATURDAYS - 1);
    expect(dates.every((date, index) => index === 0 || date > dates[index - 1])).toBe(true);
    expect(dates.filter(clubFree)).toEqual([]);
    const tuesdays = dates.filter((date) => weekdayOf(date) === TUESDAY);
    expect(tuesdays).toHaveLength(Math.max(0, rounds - (SEASON_SATURDAYS - BREAK_WEEKS.length)));
    expect(tuesdays.map((date) => weekOf(date, startYear)).sort((a, b) => a - b)).toEqual(
      BREAK_SEASON_TUESDAY_WEEKS.slice(0, tuesdays.length).sort((a, b) => a - b),
    );
    expect(dates.filter((date) => weekdayOf(date) !== SATURDAY && weekdayOf(date) !== TUESDAY)).toEqual([]);
  });

  it("moves the cup's round of 32 and two European matchdays off the breaks, never a Wednesday in a week with a Tuesday, nor the week before one", () => {
    const cup = cupDates(startYear, true);
    const europe = europeDates(startYear, true);
    const wednesdays = [...cup.slice(0, -1), ...europe.slice(0, -1)];
    expect(wednesdays.every((date) => weekdayOf(date) === WEDNESDAY)).toBe(true);
    expect(wednesdays.filter(clubFree)).toEqual([]);
    const tuesdayWeeks = new Set(matchdayDates(46, startYear, true).filter((date) => weekdayOf(date) === TUESDAY).map((date) => weekOf(date, startYear)));
    expect(wednesdays.filter((date) => tuesdayWeeks.has(weekOf(date, startYear)))).toEqual([]);
    expect(wednesdays.filter((date) => tuesdayWeeks.has(weekOf(date, startYear) + 1))).toEqual([]);
    // The cup's final and the European finals do not move: the Saturdays after the last matchday.
    expect(cup.at(-1)?.getTime()).toBe(cupDates(startYear).at(-1)?.getTime());
    expect(europe.at(-1)?.getTime()).toBe(europeDates(startYear).at(-1)?.getTime());
  });
});

describe("a season with breaks, 2026-27", () => {
  it("plays the cup's round of 32 on 2 December and the 3rd and 4th European matchdays on 21 October and 4 November", () => {
    expect(cupDates(2026, true).map(iso)).toEqual(["2026-09-23", "2026-12-02", "2027-01-06", "2027-02-17", "2027-04-07", "2027-05-22"]);
    expect(europeDates(2026, true).slice(2, 4).map(iso)).toEqual(["2026-10-21", "2026-11-04"]);
    // The leagues of 20 clubs play two Tuesdays: 29 December and 16 March.
    expect(matchdayDates(38, 2026, true).filter((date) => weekdayOf(date) === TUESDAY).map(iso)).toEqual(["2026-12-29", "2027-03-16"]);
  });

  // A club's dates in a season with breaks: its league's, the cup's up to the final and, for the clubs that play it, a
  // European competition's (a second division's cup winner too). Never two the same day, never three in less than a week.
  it.each([34, 38, 42, 46])("never has a club of a %i-matchday league play three matches in less than seven days", (rounds) => {
    const dates = [...matchdayDates(rounds, 2026, true), ...cupDates(2026, true), ...europeDates(2026, true)]
      .map((date) => date.getTime())
      .sort((a, b) => a - b);
    expect(new Set(dates).size).toBe(dates.length);
    for (let index = 2; index < dates.length; index++) {
      expect(dates[index] - dates[index - 2], new Date(dates[index]).toISOString()).toBeGreaterThanOrEqual(7 * DAY_MS);
    }
  });

  it("keeps the season's number of dates of the clubs: 36 Saturdays and 10 Tuesdays instead of 40 and 6", () => {
    const dates = (withBreaks: boolean) =>
      new Set([...matchdayDates(46, 2026, withBreaks), ...matchdayDates(38, 2026, withBreaks), ...matchdayDates(34, 2026, withBreaks)].map(iso)).size;
    expect(dates(false)).toBe(46);
    expect(dates(true)).toBe(46);
  });

  it("refuses more matchdays than a season with breaks can place", () => {
    expect(() => matchdayDates(47, 2026, true)).toThrow(RangeError);
  });
});
