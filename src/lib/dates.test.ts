import { describe, expect, it } from "vitest";
import { addYears, ageInYears } from "./dates";

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
