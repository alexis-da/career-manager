import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatShortDate } from "./format";

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

describe("formatDate", () => {
  it("writes in-game dates in French, on the stored UTC day", () => {
    const matchday = new Date(Date.UTC(2024, 7, 17));

    expect(formatDate(matchday)).toBe("17 août 2024");
    expect(formatShortDate(matchday)).toBe("sam. 17 août");
    expect(formatDate(new Date(Date.UTC(2025, 0, 1)))).toBe("1 janvier 2025");
  });
});
