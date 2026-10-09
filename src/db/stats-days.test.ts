import { describe, expect, it } from "vitest";
import { daysBetween } from "./stats";

describe("daysBetween", () => {
  it("lists the UTC days of a range, both ends included, across a month", () => {
    expect(daysBetween("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(daysBetween("2026-10-02", "2026-10-02")).toEqual(["2026-10-02"]);
  });
});
