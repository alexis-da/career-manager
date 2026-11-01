import { describe, expect, it } from "vitest";
import { dayKey, monthFromParam, monthParam, monthWeeks, sameMonth, seasonMonths, weekdayAbbreviation, weekdayNames } from "./month-grid";

describe("month grid", () => {
  it("lays out a month in whole weeks, Monday first", () => {
    // August 2026 starts on a Saturday and ends on a Monday.
    const weeks = monthWeeks({ year: 2026, month: 7 });
    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(dayKey(weeks[0][0])).toBe("2026-07-27");
    expect(dayKey(weeks[0][5])).toBe("2026-08-01");
    expect(dayKey(weeks[5][0])).toBe("2026-08-31");
    expect(dayKey(weeks[5][6])).toBe("2026-09-06");
    expect(weeks.flat().every((day) => day.getUTCDay() === (weeks.flat().indexOf(day) + 1) % 7)).toBe(true);
  });

  it("needs no padding for a month starting on a Monday and ending on a Sunday", () => {
    const weeks = monthWeeks({ year: 2027, month: 1 }); // February 2027
    expect(weeks).toHaveLength(4);
    expect(dayKey(weeks[0][0])).toBe("2027-02-01");
    expect(dayKey(weeks[3][6])).toBe("2027-02-28");
  });

  it("names the weekdays Monday first, in the player's language", () => {
    expect(weekdayNames("fr")).toEqual(["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."]);
    expect(weekdayNames("en")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("abbreviates a match's weekday in the player's language, in UTC", () => {
    const saturday = new Date(Date.UTC(2026, 7, 15));
    expect(weekdayAbbreviation(saturday, "fr")).toBe("sam");
    expect(weekdayAbbreviation(saturday, "en")).toBe("Sat");
  });

  it("compares months by year and month", () => {
    expect(sameMonth({ year: 2026, month: 7 }, { year: 2026, month: 7 })).toBe(true);
    expect(sameMonth({ year: 2026, month: 7 }, { year: 2027, month: 7 })).toBe(false);
    expect(sameMonth({ year: 2026, month: 7 }, { year: 2026, month: 8 })).toBe(false);
  });

  it("lists the season's months from July to June", () => {
    const months = seasonMonths(2026);
    expect(months.map(monthParam)).toEqual([
      "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
      "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06",
    ]);
  });

  it("reads the month param only when it names a month of the season", () => {
    const months = seasonMonths(2026);
    const fallback = { year: 2026, month: 8 };
    expect(monthFromParam("2027-03", months, fallback)).toEqual({ year: 2027, month: 2 });
    expect(monthFromParam("2027-07", months, fallback)).toEqual(fallback);
    expect(monthFromParam("n'importe quoi", months, fallback)).toEqual(fallback);
    expect(monthFromParam(undefined, months, { year: 2030, month: 0 })).toEqual({ year: 2026, month: 6 });
  });
});
