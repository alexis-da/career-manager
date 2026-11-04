import { describe, expect, it } from "vitest";
import { secondaryPositions, type Position } from "@/src/engine/positions";
import { testTranslator } from "@/src/i18n/test-intl";
import { fitTextClass, isOffPosition, positionFit, slotRating, type PositionFit } from "./positions";

/** The first test key whose secondary positions, drawn from the key alone, do or do not include a position. */
const keyWhere = (primary: Position, wanted: Position, has: boolean): string => {
  const key = Array.from({ length: 1_000 }, (_, index) => `test#${index}`).find(
    (candidate) => secondaryPositions(candidate, primary).includes(wanted) === has,
  );
  if (key === undefined) {
    throw new Error(`No test key ${has ? "with" : "without"} ${wanted} as a secondary position of ${primary}`);
  }
  return key;
};

// A central midfielder with the defensive midfield among his secondary positions, then one without it.
const midfielder = { id: keyWhere("CM", "CDM", true), position: "CM" as const, overall: 71 };
const other = { id: keyWhere("CM", "CDM", false), position: "CM" as const, overall: 71 };

const FITS: PositionFit[] = ["exact", "secondary", "line", "other-line"];

describe("how a player fits a slot", () => {
  it("is his own position, a secondary one, another of his line, or another line", () => {
    expect(positionFit(midfielder, "CM")).toBe("exact");
    expect(positionFit(midfielder, "CDM")).toBe("secondary");
    expect(positionFit(other, "CDM")).toBe("line");
    expect(positionFit(midfielder, "ST")).toBe("other-line");
  });

  it("puts him off position only filling in or out of position, warned in the alert colours already used", () => {
    expect(FITS.map(isOffPosition)).toEqual([false, false, true, true]);
    expect(FITS.map(fitTextClass)).toEqual(["", "", "text-warning", "text-loss"]);
  });

  it("has a simple label in both languages", () => {
    const french = testTranslator("fr", "positions");
    const english = testTranslator("en", "positions");

    expect(FITS.map((fit) => french(`fit.${fit}`))).toEqual(["À son poste", "Poste secondaire", "Dépanne", "Hors poste"]);
    expect(FITS.map((fit) => english(`fit.${fit}`))).toEqual(["Natural position", "Secondary position", "Filling in", "Out of position"]);
  });

  it("gives the rating every screen shows at the slot, whole: « 71 → 65 » filling in", () => {
    expect(slotRating(midfielder, "CM")).toBe(71);
    expect(slotRating(midfielder, "CDM")).toBe(69); // 71 × 0.97 = 68.87
    expect(slotRating(other, "CDM")).toBe(65); // 71 × 0.92 = 65.32
    expect(slotRating(midfielder, "ST")).toBe(57); // 71 × 0.8 = 56.8
  });
});
