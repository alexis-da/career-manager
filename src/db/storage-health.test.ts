import { describe, expect, it } from "vitest";
import { PROJECTION_DAYS, STORAGE_COST_ALERT_DOLLARS, STORAGE_PRICE_PER_GB_MONTH, storageHealth } from "./admin-dashboard";

// The storage's figures of /admin's health section (src/db/admin-dashboard.ts), without a database: the size, its growth
// over the last snapshots, its monthly cost on Neon's Launch plan now and PROJECTION_DAYS days ahead, the alert past
// STORAGE_COST_ALERT_DOLLARS, and the weight each new player adds.

const MB = 1024 * 1024;
const GB = 1024 * MB;
const noPlayers = () => 0;
const playersOf = (byDay: Record<string, number>) => (day: string) => byDay[day] ?? 0;

describe("the storage's health", () => {
  it("prices the size at Neon's Launch rate, 0.35 $ a GB and a month, and warns past 5 $ projected 30 days ahead", () => {
    expect(STORAGE_PRICE_PER_GB_MONTH).toBe(0.35);
    expect(STORAGE_COST_ALERT_DOLLARS).toBe(5);
    expect(PROJECTION_DAYS).toBe(30);
  });

  it("has no growth, projection nor weight per player without two snapshots on different days", () => {
    for (const snapshots of [[], [{ day: "2026-11-09", bytes: 900 * MB }]]) {
      expect(storageHealth(1 * GB, snapshots, () => 40)).toEqual({
        databaseBytes: 1 * GB,
        growth: null,
        growthSince: null,
        dailyGrowth: null,
        storageCost: 0.35,
        projectedBytes: null,
        projectedCost: null,
        costAlert: false,
        newPlayers: 0,
        bytesPerNewPlayer: null,
      });
    }
  });

  it("measures the production database of 9 November: 1 062 Mo in a day, 46 players the day before, past 5 $ in 30 days", () => {
    const health = storageHealth(
      1339.1 * MB,
      [
        { day: "2026-11-08", bytes: 203 * MB },
        { day: "2026-11-09", bytes: 1264.9 * MB },
      ],
      // The snapshot of the 9th, at 04:17 UTC, holds the players of the 8th, not yet those of the 9th.
      playersOf({ "2026-11-08": 46, "2026-11-09": 53 }),
    );

    expect(health.growth).toBeCloseTo(1061.9 * MB);
    expect(health.dailyGrowth).toBeCloseTo(1061.9 * MB);
    expect(health.growthSince).toBe("2026-11-08");
    expect(health.newPlayers).toBe(46);
    expect((health.bytesPerNewPlayer ?? 0) / MB).toBeCloseTo(1061.9 / 46);
    expect(health.storageCost).toBeCloseTo((1339.1 / 1024) * 0.35);
    expect((health.projectedBytes ?? 0) / MB).toBeCloseTo(1339.1 + 30 * 1061.9);
    expect(health.projectedCost).toBeCloseTo(((1339.1 + 30 * 1061.9) / 1024) * 0.35);
    expect(health.costAlert).toBe(true);
  });

  it("averages the growth over the days between the first snapshot of the week and the last, gaps included", () => {
    const health = storageHealth(
      1.2 * GB,
      [
        { day: "2026-11-02", bytes: 700 * MB },
        { day: "2026-11-05", bytes: 800 * MB },
        { day: "2026-11-09", bytes: 1.1 * GB },
      ],
      playersOf({ "2026-11-01": 99, "2026-11-02": 10, "2026-11-04": 5, "2026-11-08": 20, "2026-11-09": 99 }),
    );

    expect(health.growth).toBeCloseTo(1.1 * GB - 700 * MB);
    expect(health.dailyGrowth).toBeCloseTo((1.1 * GB - 700 * MB) / 7);
    expect(health.growthSince).toBe("2026-11-02");
    // From the 2nd to the 8th: not the 1st, before the first snapshot, nor the 9th, after the last.
    expect(health.newPlayers).toBe(35);
    expect(health.bytesPerNewPlayer).toBeCloseTo((1.1 * GB - 700 * MB) / 35);
    expect(health.costAlert).toBe(false);
  });

  it("warns only past 5 $ a month, projected, or today's cost without a projection", () => {
    // 5 $ a month is 14.29 GB at 0.35 $.
    const at = (projectedGb: number) =>
      storageHealth(
        10 * GB,
        [
          { day: "2026-11-02", bytes: 10 * GB - 7 * ((projectedGb - 10) / 30) * GB },
          { day: "2026-11-09", bytes: 10 * GB },
        ],
        noPlayers,
      );
    expect(at(14.2).projectedCost).toBeCloseTo(14.2 * 0.35);
    expect(at(14.2).costAlert).toBe(false);
    expect(at(14.4).costAlert).toBe(true);
    expect(at(14.4).bytesPerNewPlayer).toBeNull();

    expect(storageHealth(14 * GB, [], noPlayers).costAlert).toBe(false);
    expect(storageHealth(15 * GB, [], noPlayers).costAlert).toBe(true);
  });

  it("never projects a size under 0 when the database shrinks", () => {
    const health = storageHealth(
      100 * MB,
      [
        { day: "2026-11-08", bytes: 900 * MB },
        { day: "2026-11-09", bytes: 100 * MB },
      ],
      playersOf({ "2026-11-08": 3 }),
    );

    expect(health.growth).toBeCloseTo(-800 * MB);
    expect(health.projectedBytes).toBe(0);
    expect(health.projectedCost).toBe(0);
    expect(health.costAlert).toBe(false);
    expect(health.bytesPerNewPlayer).toBeCloseTo((-800 * MB) / 3);
  });
});
