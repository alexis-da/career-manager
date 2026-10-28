import { describe, expect, it } from "vitest";
import { isoWeekBounds, isoWeekKey, isoWeekNumber, previousIsoWeekKey } from "./iso-week";

const at = (iso: string) => new Date(iso);
const WEEK_MS = 7 * 86_400_000;

describe("ISO weeks in UTC", () => {
  it("run from Monday 00:00 to Sunday 23:59:59.999 UTC", () => {
    expect(isoWeekKey(at("2026-11-01T23:59:59.999Z"))).toBe("2026-W44");
    expect(isoWeekKey(at("2026-11-02T00:00:00.000Z"))).toBe("2026-W45");
    expect(isoWeekKey(at("2026-11-08T23:59:59.999Z"))).toBe("2026-W45");
    expect(isoWeekKey(at("2026-11-09T00:00:00.000Z"))).toBe("2026-W46");
  });

  it("are counted in UTC, whatever the time in Paris", () => {
    // Monday 9 November 2026 at 00:30 in Paris (UTC+1) is still Sunday in UTC.
    expect(isoWeekKey(at("2026-11-09T00:30:00.000+01:00"))).toBe("2026-W45");
    // In summer time, Monday 6 July 2026 at 01:30 in Paris (UTC+2) is still Sunday 5 July in UTC.
    expect(isoWeekKey(at("2026-07-06T01:30:00.000+02:00"))).toBe("2026-W27");
    expect(isoWeekKey(at("2026-07-06T02:00:00.000+02:00"))).toBe("2026-W28");
  });

  it("give 2026 a 53rd week, from Monday 28 December 2026 to Sunday 3 January 2027", () => {
    expect(isoWeekKey(at("2026-12-27T23:59:59.999Z"))).toBe("2026-W52");
    expect(isoWeekKey(at("2026-12-28T00:00:00.000Z"))).toBe("2026-W53");
    expect(isoWeekKey(at("2027-01-01T12:00:00.000Z"))).toBe("2026-W53");
    expect(isoWeekKey(at("2027-01-03T23:59:59.999Z"))).toBe("2026-W53");
    expect(isoWeekKey(at("2027-01-04T00:00:00.000Z"))).toBe("2027-W01");
    expect(isoWeekBounds("2026-W53")).toEqual({ startsAt: at("2026-12-28T00:00:00.000Z"), endsAt: at("2027-01-04T00:00:00.000Z") });
  });

  it("change years at the week of the first Thursday", () => {
    // 2026 starts on a Thursday: its week 1 starts on Monday 29 December 2025.
    expect(isoWeekKey(at("2025-12-28T23:59:59.999Z"))).toBe("2025-W52");
    expect(isoWeekKey(at("2025-12-29T00:00:00.000Z"))).toBe("2026-W01");
    expect(isoWeekKey(at("2026-01-01T00:00:00.000Z"))).toBe("2026-W01");
    // 2028 starts on a Saturday: its first two days end 2027's last week, the 52nd.
    expect(isoWeekKey(at("2028-01-02T23:59:59.999Z"))).toBe("2027-W52");
    expect(isoWeekKey(at("2028-01-03T00:00:00.000Z"))).toBe("2028-W01");
  });

  it("give each week its bounds, and refuse a key that is no week", () => {
    expect(isoWeekBounds("2026-W45")).toEqual({ startsAt: at("2026-11-02T00:00:00.000Z"), endsAt: at("2026-11-09T00:00:00.000Z") });
    expect(isoWeekBounds("2026-W01").startsAt).toEqual(at("2025-12-29T00:00:00.000Z"));
    expect(() => isoWeekBounds("2027-W53")).toThrow(RangeError); // 2027 has 52 weeks
    expect(() => isoWeekBounds("2026-W00")).toThrow(RangeError);
    expect(() => isoWeekBounds("2026-W5")).toThrow(RangeError);
    expect(() => isoWeekBounds("2026-45")).toThrow(RangeError);
  });

  it("go back one week across years, and read a week's number", () => {
    expect(previousIsoWeekKey("2026-W45")).toBe("2026-W44");
    expect(previousIsoWeekKey("2027-W01")).toBe("2026-W53");
    expect(previousIsoWeekKey("2026-W01")).toBe("2025-W52");
    expect(isoWeekNumber("2026-W05")).toBe(5);
    expect(isoWeekNumber("2026-W53")).toBe(53);
    expect(() => isoWeekNumber("2027-W53")).toThrow(RangeError);
  });

  it("follow each other from 2024 to 2030, 2026 alone with 53 weeks", () => {
    const weeksByYear = new Map<string, number>();
    // Monday 1 January 2024, then every Monday until the end of 2030.
    for (let time = at("2024-01-01T00:00:00.000Z").getTime(); time < at("2030-12-30T00:00:00.000Z").getTime(); time += WEEK_MS) {
      const key = isoWeekKey(new Date(time));
      const year = key.slice(0, 4);
      weeksByYear.set(year, (weeksByYear.get(year) ?? 0) + 1);
      expect(isoWeekNumber(key)).toBe(weeksByYear.get(year));
      expect(isoWeekBounds(key).startsAt.getTime()).toBe(time);
    }
    expect(Object.fromEntries(weeksByYear)).toEqual({ "2024": 52, "2025": 52, "2026": 53, "2027": 52, "2028": 52, "2029": 52, "2030": 52 });
  });
});
