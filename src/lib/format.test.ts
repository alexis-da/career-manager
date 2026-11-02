import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDayDate,
  formatDayMonth,
  formatDecimal,
  formatGoalDifference,
  formatMillions,
  formatMillionsAmount,
  formatMonth,
  formatMoney,
  formatParisDateTime,
  formatParisDay,
  formatParisWeekdayTime,
  formatShortDate,
  millionsFigure,
} from "./format";

// fr-FR separates thousands with a narrow no-break space: normalise it to compare.
const plain = (text: string): string => text.replace(/[  ]/g, " ");

describe("formatMoney", () => {
  it("writes millions with one decimal and a comma", () => {
    expect(formatMoney(12_500_000)).toBe("12,5 M€");
    expect(formatMoney(150_000_000)).toBe("150 M€");
    expect(plain(formatMoney(1_250_000_000))).toBe("1 250 M€");
  });

  it("writes thousands and small amounts", () => {
    expect(formatMoney(850_000)).toBe("850 k€");
    expect(formatMoney(1_500)).toBe("1,5 k€");
    expect(formatMoney(900)).toBe("900 €");
    expect(formatMoney(-2_300_000)).toBe("-2,3 M€");
  });
});

describe("large figures", () => {
  it("writes millions and averages with exactly one decimal", () => {
    expect(formatMillions(45_000_000)).toBe("45,0");
    expect(formatMillions(38_240_000)).toBe("38,2");
    expect(formatDecimal(68.24)).toBe("68,2");
    expect(formatDecimal(25)).toBe("25,0");
  });
});

describe("formatDate", () => {
  it("writes in-game dates in French, on the stored UTC day", () => {
    const matchday = new Date(Date.UTC(2024, 7, 17));

    expect(formatDate(matchday)).toBe("17 août 2024");
    expect(formatShortDate(matchday)).toBe("sam. 17 août");
    expect(formatDate(new Date(Date.UTC(2025, 0, 1)))).toBe("1er janvier 2025");
  });

  it("writes the date of the navigation bar and short day-month dates", () => {
    expect(formatDayDate(new Date(Date.UTC(2024, 8, 14)))).toBe("sam. 14 sept. 2024");
    expect(formatDayMonth(new Date(Date.UTC(2025, 0, 1)))).toBe("1er janv.");
    expect(formatDayMonth(new Date(Date.UTC(2024, 7, 31)))).toBe("31 août");
  });
});

describe("real times", () => {
  it("writes them in Paris time, winter and summer", () => {
    expect(formatParisDateTime(new Date("2026-11-02T00:00:00.000Z"))).toBe("lundi 2 novembre à 01:00");
    expect(formatParisDateTime(new Date("2026-07-06T00:00:00.000Z"))).toBe("lundi 6 juillet à 02:00");
    expect(formatParisDay(new Date("2026-11-03T00:00:00.000Z"))).toBe("mardi 03/11");
    expect(formatParisWeekdayTime(new Date("2026-11-02T00:00:00.000Z"))).toBe("lundi 01:00");
  });

  it("signs a positive goal difference only", () => {
    expect([4, 0, -2].map(formatGoalDifference)).toEqual(["+4", "0", "-2"]);
  });
});

describe("in English", () => {
  it("writes millions symbol first, as a large figure whole", () => {
    expect([formatMillionsAmount(77_200_000, "en"), formatMillionsAmount(-1_250_000, "en")]).toEqual(["€77.2m", "-€1.3m"]);
    expect(formatMillionsAmount(77_200_000)).toBe("77,2 M€");
    expect(millionsFigure(45_000_000, "en")).toEqual({ value: "€45.0m", unit: null });
    expect(millionsFigure(45_000_000)).toEqual({ value: "45,0", unit: "M€" });
  });

  it("writes amounts and figures as in Britain", () => {
    expect([12_500_000, 150_000_000, 850_000, 1_500, 900, -2_300_000].map((euros) => formatMoney(euros, "en"))).toEqual([
      "€12.5m",
      "€150m",
      "€850k",
      "€1.5k",
      "€900",
      "-€2.3m",
    ]);
    expect(formatMoney(1_250_000_000, "en")).toBe("€1,250m");
    expect(formatMillions(38_240_000, "en")).toBe("38.2");
    expect(formatDecimal(25, "en")).toBe("25.0");
  });

  it("writes in-game dates without the French ordinal, on the stored UTC day", () => {
    expect(formatDate(new Date(Date.UTC(2024, 7, 17)), "en")).toBe("17 August 2024");
    expect(formatDate(new Date(Date.UTC(2025, 0, 1)), "en")).toBe("1 January 2025");
    expect(formatShortDate(new Date(Date.UTC(2024, 7, 17)), "en")).toBe("Sat 17 Aug");
    expect(formatDayDate(new Date(Date.UTC(2024, 8, 14)), "en")).toBe("Sat, 14 Sept 2024");
    expect(formatDayMonth(new Date(Date.UTC(2025, 0, 1)), "en")).toBe("1 Jan");
    expect(formatMonth(new Date(Date.UTC(2026, 8, 1)), "en")).toBe("September 2026");
  });

  it("writes real times in Paris time", () => {
    expect(formatParisDateTime(new Date("2026-11-02T00:00:00.000Z"), "en")).toBe("Monday 2 November at 01:00");
    expect(formatParisDay(new Date("2026-11-03T00:00:00.000Z"), "en")).toBe("Tuesday 03/11");
    expect(formatParisWeekdayTime(new Date("2026-11-02T00:00:00.000Z"), "en")).toBe("Monday 01:00");
  });
});
