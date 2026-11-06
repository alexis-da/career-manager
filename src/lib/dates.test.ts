import { describe, expect, it } from "vitest";
import { addYears, ageInYears, earliestBirthForMaxAge } from "./dates";

const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe("addYears", () => {
  it("keeps the day and the month", () => {
    expect(addYears(utc("1997-07-29"), 2)).toEqual(utc("1999-07-29"));
    expect(addYears(utc("2000-07-01"), -2)).toEqual(utc("1998-07-01"));
  });

  it("turns 29 February into 28 February in a common year, as PostgreSQL does", () => {
    expect(addYears(utc("2004-02-29"), 2)).toEqual(utc("2006-02-28"));
    expect(addYears(utc("2004-02-29"), 4)).toEqual(utc("2008-02-29"));
  });

  it("keeps the age on the same day as many years later", () => {
    for (const birth of ["1990-02-28", "1992-02-29", "1999-06-30", "1999-07-01", "1999-07-02"]) {
      expect(ageInYears(addYears(utc(birth), 2), utc("2026-07-01"))).toBe(ageInYears(utc(birth), utc("2024-07-01")));
    }
  });
});

describe("earliestBirthForMaxAge", () => {
  const DAY_MS = 86_400_000;

  it("keeps exactly the players ageInYears finds at most that old, birthdays and 29 February included", () => {
    const dates = ["2026-07-01", "2027-01-15", "2028-02-29", "2028-03-01", "2029-02-28", "2030-12-31"].map(utc);
    for (const date of dates) {
      for (const maxAge of [15, 17, 21, 28, 35, 50]) {
        const earliest = earliestBirthForMaxAge(maxAge, date);
        // Every day of the two years around the bound, at midnight and late in the day.
        const from = earliest.getTime() - 400 * DAY_MS;
        for (let time = from; time < from + 800 * DAY_MS; time += DAY_MS) {
          for (const birth of [new Date(time), new Date(time + 23 * 3_600_000)]) {
            expect(birth >= earliest, `${birth.toISOString()} on ${date.toISOString()}, at most ${maxAge}`).toBe(
              ageInYears(birth, date) <= maxAge,
            );
          }
        }
      }
    }
  });
});
