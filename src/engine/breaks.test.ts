import { describe, expect, it } from "vitest";
import { cupDates } from "./cup";
import { europeDates } from "./europe";
import {
  BREAK_SEASON_TUESDAY_WEEKS,
  BREAK_WEEKS,
  breakWindows,
  hasWinterBreak,
  matchdayDates,
  SEASON_SATURDAYS,
  WINTER_BREAK_COUNTRIES,
  WINTER_BREAK_TUESDAY_WEEKS,
  winterBreakDates,
} from "./schedule";
import { firstMatchdayDate } from "./world";

// The calendar of a season with international breaks (docs/design/selections.md § 3): the breaks' weeks free of every
// club, the leagues, the cups and the European competitions moved around them, the season's first and last days kept.
// With the winter break, the leagues of Spain, Italy, Germany and France stop from 21 December to 3 January, England's
// play on: the same first and last days, every matchday kept.

const DAY_MS = 86_400_000;
const iso = (date: Date): string => date.toISOString().slice(0, 10);
const ascending = (a: number, b: number): number => a - b;

/** The week of a date in its season: 0 for the week of the first matchday, Saturday to Friday. */
const weekOf = (date: Date, startYear: number): number =>
  Math.floor((date.getTime() - firstMatchdayDate(startYear).getTime()) / (7 * DAY_MS));
const weekdayOf = (date: Date): number => date.getUTCDay();
const SATURDAY = 6;
const TUESDAY = 2;
const WEDNESDAY = 3;

/**
 * The days no club plays in a season with breaks, as days since its first matchday: from the Wednesday before a break's
 * Saturday to the Wednesday after it, both included, its Friday and Tuesday between.
 */
const clubFreeIn =
  (startYear: number) =>
  (date: Date): boolean => {
    const day = Math.round((date.getTime() - firstMatchdayDate(startYear).getTime()) / DAY_MS);
    return BREAK_WEEKS.some((week) => day >= week * 7 - 3 && day <= week * 7 + 4);
  };

/** Whether a date is in the winter break of the season starting in startYear, both days included. */
const inWinterBreakOf =
  (startYear: number) =>
  (date: Date): boolean => {
    const { from, to } = winterBreakDates(startYear);
    return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
  };

/** The ten leagues' matchdays: 2 × (n − 1), n their clubs in the seed. */
const LEAGUE_MATCHDAYS: Readonly<Record<string, number>> = {
  "en.1": 38,
  "en.2": 46,
  "es.1": 38,
  "es.2": 42,
  "it.1": 38,
  "it.2": 38,
  "de.1": 34,
  "de.2": 34,
  "fr.1": 34,
  "fr.2": 34,
};

/** The years of the winter break's tests: its Saturdays are weeks 19 and 20 in 2026 and 2031, 18 and 19 in the others. */
const WINTER_BREAK_YEARS = [2026, 2027, 2028, 2030, 2031];

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
  const clubFree = clubFreeIn(startYear);

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
    // The leagues of 20 clubs without the winter break, England's, play two Tuesdays: 29 December and 16 March.
    expect(matchdayDates(38, 2026, true).filter((date) => weekdayOf(date) === TUESDAY).map(iso)).toEqual(["2026-12-29", "2027-03-16"]);
  });

  it("keeps the season's number of dates of the clubs: 36 Saturdays and 10 Tuesdays instead of 40 and 6", () => {
    const dates = (withBreaks: boolean) =>
      new Set([...matchdayDates(46, 2026, withBreaks), ...matchdayDates(38, 2026, withBreaks), ...matchdayDates(34, 2026, withBreaks)].map(iso)).size;
    expect(dates(false)).toBe(46);
    expect(dates(true)).toBe(46);
  });

  it("keeps them with the winter break too: England's leagues play the dates the others leave", () => {
    const dates = Object.entries(LEAGUE_MATCHDAYS).flatMap(([code, rounds]) => matchdayDates(rounds, 2026, true, hasWinterBreak(code)));
    expect(new Set(dates.map(iso)).size).toBe(46);
  });

  it("refuses more matchdays than a season with breaks can place: 46, 43 with the winter break", () => {
    expect(() => matchdayDates(47, 2026, true)).toThrow(RangeError);
    expect(matchdayDates(43, 2026, true, true)).toHaveLength(43);
    expect(() => matchdayDates(44, 2026, true, true)).toThrow(RangeError);
  });
});

// A club's dates in a season with breaks: its league's, the cup's up to the final and, for the clubs that play it, a
// European competition's (a second division's cup winner too). Never two the same day, never three in less than a week,
// whatever the year, its league with the winter break or without.
describe.each(WINTER_BREAK_YEARS)("a club's dates in a season with breaks starting in %i", (startYear) => {
  it.each([
    { rounds: 34, winterBreak: false },
    { rounds: 38, winterBreak: false },
    { rounds: 42, winterBreak: false },
    { rounds: 46, winterBreak: false },
    { rounds: 34, winterBreak: true },
    { rounds: 38, winterBreak: true },
    { rounds: 42, winterBreak: true },
  ])("never has a club of a $rounds-matchday league play three matches in less than seven days (winter break: $winterBreak)", ({ rounds, winterBreak }) => {
    const dates = [...matchdayDates(rounds, startYear, true, winterBreak), ...cupDates(startYear, true), ...europeDates(startYear, true)]
      .map((date) => date.getTime())
      .sort((a, b) => a - b);
    expect(new Set(dates).size).toBe(dates.length);
    for (let index = 2; index < dates.length; index++) {
      expect(dates[index] - dates[index - 2], new Date(dates[index]).toISOString()).toBeGreaterThanOrEqual(7 * DAY_MS);
    }
  });
});

describe("the winter break", () => {
  it("stops the leagues of Spain, Italy, Germany and France, never England's", () => {
    expect(WINTER_BREAK_COUNTRIES).toEqual(["es", "it", "de", "fr"]);
    expect(Object.keys(LEAGUE_MATCHDAYS).filter(hasWinterBreak)).toEqual(["es.1", "es.2", "it.1", "it.2", "de.1", "de.2", "fr.1", "fr.2"]);
  });

  it("changes nothing in a season without the international breaks: a save without nations, or a worldVersion 1 save", () => {
    for (const rounds of [34, 38, 42, 46]) {
      expect(matchdayDates(rounds, 2026, false, true)).toEqual(matchdayDates(rounds, 2026));
    }
  });

  it("keeps its first and last days off, Saturdays of their seasons: 21 December 2030 and 3 January 2032", () => {
    expect(matchdayDates(38, 2030, true).map(iso)).toContain("2030-12-21");
    expect(matchdayDates(38, 2030, true, true).map(iso)).not.toContain("2030-12-21");
    expect(matchdayDates(38, 2031, true).map(iso)).toContain("2032-01-03");
    expect(matchdayDates(38, 2031, true, true).map(iso)).not.toContain("2032-01-03");
  });
});

describe.each(WINTER_BREAK_YEARS)("a season with the winter break starting in %i", (startYear) => {
  const clubFree = clubFreeIn(startYear);
  const inWinterBreak = inWinterBreakOf(startYear);
  const tuesdayOf = (week: number): Date => new Date(firstMatchdayDate(startYear).getTime() + (week * 7 + 3) * DAY_MS);

  it("lasts from 21 December to 3 January: two Saturdays of the season, which England's leagues play", () => {
    const { from, to } = winterBreakDates(startYear);
    expect([iso(from), iso(to)]).toEqual([`${startYear}-12-21`, `${startYear + 1}-01-03`]);
    const saturdays = Array.from({ length: SEASON_SATURDAYS }, (_, week) => new Date(firstMatchdayDate(startYear).getTime() + week * 7 * DAY_MS));
    expect(saturdays.filter(inWinterBreak)).toHaveLength(2);
    for (const code of ["en.1", "en.2"]) {
      expect(matchdayDates(LEAGUE_MATCHDAYS[code], startYear, true).filter((date) => inWinterBreak(date) && weekdayOf(date) === SATURDAY)).toHaveLength(2);
    }
  });

  it("never takes the holidays' Tuesday, week 19's, in the break or, when the season starts on 21 August, the day after it", () => {
    expect(WINTER_BREAK_TUESDAY_WEEKS).not.toContain(19);
    expect(WINTER_BREAK_TUESDAY_WEEKS.map(tuesdayOf).filter(inWinterBreak)).toEqual([]);
    const holidays = tuesdayOf(19);
    expect(inWinterBreak(holidays) || iso(holidays) === `${startYear + 1}-01-04`).toBe(true);
  });

  it("keeps the other nine Tuesdays, those right before an international break (weeks 2 and 31) after the others", () => {
    expect([...WINTER_BREAK_TUESDAY_WEEKS].sort(ascending)).toEqual(BREAK_SEASON_TUESDAY_WEEKS.filter((week) => week !== 19).sort(ascending));
    // The 34 and 38 matchdays of the first divisions with the winter break: none of them, and none in the spring, when
    // the European clubs play their knockout rounds.
    for (const rounds of [34, 38]) {
      const weeks = matchdayDates(rounds, startYear, true, true).filter((date) => weekdayOf(date) === TUESDAY).map((date) => weekOf(date, startYear));
      expect(weeks.filter((week) => BREAK_WEEKS.includes(week + 1))).toEqual([]);
      expect(weeks.filter((week) => week > 30)).toEqual([]);
    }
  });

  it("leaves a league of 34 matchdays the rest weekends it had, its holidays' matchdays on the Tuesdays of August", () => {
    const before = matchdayDates(34, startYear, true).map(iso);
    const after = matchdayDates(34, startYear, true, true);
    const restBefore = matchdayDates(36, startYear, true).map(iso).filter((day) => !before.includes(day));
    expect(restBefore).toHaveLength(2);
    // Two Saturdays without a match outside the breaks and the holidays, as before, in the autumn and the spring.
    const saturdays = after.filter((date) => weekdayOf(date) === SATURDAY);
    const free = matchdayDates(38, startYear, true, true).filter((date) => weekdayOf(date) === SATURDAY && !saturdays.some((day) => day.getTime() === date.getTime()));
    expect(free).toHaveLength(2);
    expect(after.filter((date) => weekdayOf(date) === TUESDAY).map((date) => weekOf(date, startYear))).toEqual([0, 1]);
  });

  it.each([
    { rounds: 34, saturdays: 32, tuesdayWeeks: [0, 1] },
    { rounds: 38, saturdays: 34, tuesdayWeeks: [0, 1, 30, 22] },
    { rounds: 42, saturdays: 34, tuesdayWeeks: [0, 1, 30, 22, 23, 35, 38, 2] },
  ])("places $rounds matchdays on $saturdays of its 34 Saturdays and the Tuesdays of weeks $tuesdayWeeks, none from 21 December to 3 January", ({ rounds, saturdays, tuesdayWeeks }) => {
    const dates = matchdayDates(rounds, startYear, true, true);
    expect(dates).toHaveLength(rounds);
    expect(dates.every((date, index) => index === 0 || date > dates[index - 1])).toBe(true);
    // The same first and last Saturdays as every league's: the season ends the same day.
    expect(dates[0].getTime()).toBe(firstMatchdayDate(startYear).getTime());
    expect(weekOf(dates[rounds - 1], startYear)).toBe(SEASON_SATURDAYS - 1);
    expect(dates.at(-1)).toEqual(matchdayDates(LEAGUE_MATCHDAYS["en.2"], startYear, true).at(-1));
    expect(dates.filter(inWinterBreak)).toEqual([]);
    expect(dates.filter(clubFree)).toEqual([]);
    // The Saturdays of the season but those of the breaks and the holidays' two, less the rest weekends the league had
    // (the 34 matchdays, two), then the Tuesdays, in their order: the holidays' two matchdays in August.
    expect(dates.filter((date) => weekdayOf(date) === SATURDAY)).toHaveLength(saturdays);
    expect(saturdays + tuesdayWeeks.length).toBe(rounds);
    const tuesdays = dates.filter((date) => weekdayOf(date) === TUESDAY);
    expect(tuesdays.map((date) => weekOf(date, startYear)).sort(ascending)).toEqual([...tuesdayWeeks].sort(ascending));
    expect(tuesdayWeeks).toEqual(WINTER_BREAK_TUESDAY_WEEKS.slice(0, tuesdays.length));
    expect(dates.filter((date) => weekdayOf(date) !== SATURDAY && weekdayOf(date) !== TUESDAY)).toEqual([]);
  });
});

describe("the winter break, 2026-27", () => {
  const holidays = (dates: readonly Date[]): string[] => dates.map(iso).filter((day) => day >= "2026-12-01" && day <= "2027-01-31");

  it("stops Spain's first division after 19 December, back on 9 January, its Tuesdays on 18 and 25 August, 19 January and 16 March", () => {
    const spain = matchdayDates(LEAGUE_MATCHDAYS["es.1"], 2026, true, true);
    expect(holidays(spain)).toEqual(["2026-12-05", "2026-12-12", "2026-12-19", "2027-01-09", "2027-01-16", "2027-01-19", "2027-01-23", "2027-01-30"]);
    expect(spain.filter((date) => weekdayOf(date) === TUESDAY).map(iso)).toEqual(["2026-08-18", "2026-08-25", "2027-01-19", "2027-03-16"]);
  });

  it("gives France's first division its two rest weekends, 24 October and 13 March (31 October and 6 March before), and its Tuesdays in August", () => {
    const france = matchdayDates(LEAGUE_MATCHDAYS["fr.1"], 2026, true, true).map(iso);
    const saturdays = matchdayDates(LEAGUE_MATCHDAYS["es.1"], 2026, true, true).filter((date) => weekdayOf(date) === SATURDAY).map(iso);
    expect(saturdays.filter((day) => !france.includes(day))).toEqual(["2026-10-24", "2027-03-13"]);
    expect(france.filter((day) => day < "2026-09-01")).toEqual(["2026-08-15", "2026-08-18", "2026-08-22", "2026-08-25", "2026-08-29"]);
  });

  it("leaves England's calendar as it was: 26 December, 29 December and 2 January", () => {
    const england = matchdayDates(LEAGUE_MATCHDAYS["en.1"], 2026, true);
    expect(holidays(england)).toEqual([
      "2026-12-05",
      "2026-12-12",
      "2026-12-19",
      "2026-12-26",
      "2026-12-29",
      "2027-01-02",
      "2027-01-09",
      "2027-01-16",
      "2027-01-23",
      "2027-01-30",
    ]);
  });
});
