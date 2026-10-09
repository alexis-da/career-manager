import { describe, expect, it } from "vitest";
import { bearerMatches, purgeCutoffs, readMaintenanceSecret } from "./maintenance";

describe("maintenance endpoint", () => {
  it("has no secret when MAINTENANCE_SECRET is missing or blank", () => {
    expect(readMaintenanceSecret(undefined)).toBeNull();
    expect(readMaintenanceSecret("  ")).toBeNull();
    expect(readMaintenanceSecret(" s3cret ")).toBe("s3cret");
  });

  it("accepts « Bearer <secret> » only", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("Bearer s3cret-and-more", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer ", "s3cret")).toBe(false);
    expect(bearerMatches("s3cret", "s3cret")).toBe(false);
    expect(bearerMatches("Basic s3cret", "s3cret")).toBe(false);
    expect(bearerMatches(null, "s3cret")).toBe(false);
  });

  it("purges the anonymous users not seen for 30 days, and the saveless ones not seen for 24 hours", () => {
    const now = new Date("2026-10-09T04:17:00.000Z");
    expect(purgeCutoffs(now)).toEqual({
      inactiveBefore: new Date("2026-09-09T04:17:00.000Z"),
      emptyBefore: new Date("2026-10-08T04:17:00.000Z"),
    });
  });
});
