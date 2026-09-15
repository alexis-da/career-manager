import { describe, expect, it } from "vitest";
import {
  firstMatchdayDate,
  isTransferWindowOpen,
  nextTransferWindowOpening,
  seasonEndDate,
  seasonStartDate,
  seasonStartYear,
  transferWindowAt,
  transferWindowCloseDate,
  WORLD_START_DATE,
} from "./world";

const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe("world calendar", () => {
  it("plays the first matchday on the third Saturday of August", () => {
    expect(firstMatchdayDate(2024).toISOString()).toBe("2024-08-17T00:00:00.000Z");
    expect(firstMatchdayDate(2025).toISOString()).toBe("2025-08-16T00:00:00.000Z");
    for (let year = 2024; year < 2050; year++) {
      const date = firstMatchdayDate(year);
      expect(date.getUTCDay()).toBe(6);
      expect(date.getUTCMonth()).toBe(7);
      expect(date.getUTCDate()).toBeGreaterThanOrEqual(15);
      expect(date.getUTCDate()).toBeLessThanOrEqual(21);
    }
  });

  it("runs seasons from 1 July to 30 June", () => {
    expect(WORLD_START_DATE.toISOString()).toBe("2024-07-01T00:00:00.000Z");
    expect(seasonStartDate(2025).toISOString()).toBe("2025-07-01T00:00:00.000Z");
    expect(seasonEndDate(2024).toISOString()).toBe("2025-06-30T00:00:00.000Z");
    expect(seasonStartYear(seasonEndDate(2024))).toBe(2024);
    expect(seasonStartYear(seasonStartDate(2025))).toBe(2025);
  });
});

describe("transfer windows", () => {
  it("opens in summer from 1 July to 31 August", () => {
    expect(transferWindowAt(utc("2025-07-01"))).toBe("summer");
    expect(transferWindowAt(utc("2025-08-31"))).toBe("summer");
    expect(transferWindowAt(utc("2025-06-30"))).toBeNull();
    expect(transferWindowAt(utc("2025-09-01"))).toBeNull();
  });

  it("opens in winter from 1 to 31 January", () => {
    expect(transferWindowAt(utc("2026-01-01"))).toBe("winter");
    expect(transferWindowAt(utc("2026-01-31"))).toBe("winter");
    expect(transferWindowAt(utc("2025-12-31"))).toBeNull();
    expect(transferWindowAt(utc("2026-02-01"))).toBeNull();
  });

  it("stays closed during the season", () => {
    expect(isTransferWindowOpen(utc("2025-10-15"))).toBe(false);
    expect(isTransferWindowOpen(utc("2026-04-04"))).toBe(false);
    expect(isTransferWindowOpen(WORLD_START_DATE)).toBe(true);
  });

  it("tells when the open window closes", () => {
    expect(transferWindowCloseDate(utc("2024-07-01"))?.toISOString()).toBe("2024-08-31T00:00:00.000Z");
    expect(transferWindowCloseDate(utc("2025-01-12"))?.toISOString()).toBe("2025-01-31T00:00:00.000Z");
    expect(transferWindowCloseDate(utc("2024-09-14"))).toBeNull();
  });

  it("tells when the next window opens", () => {
    expect(nextTransferWindowOpening(utc("2024-09-14")).toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(nextTransferWindowOpening(utc("2024-07-01")).toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(nextTransferWindowOpening(utc("2025-03-08")).toISOString()).toBe("2025-07-01T00:00:00.000Z");
    expect(nextTransferWindowOpening(utc("2025-01-12")).toISOString()).toBe("2025-07-01T00:00:00.000Z");
  });
});
