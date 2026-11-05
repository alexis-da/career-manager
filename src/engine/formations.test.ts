import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORMATION_NAME,
  FORMATION_FAMILIES,
  FORMATION_NAMES,
  FORMATIONS,
  formationFamily,
  formationPositions,
  isFormationName,
} from "./formations";
import { positionGroup } from "./positions";

describe("FORMATIONS", () => {
  it.each(FORMATION_NAMES)("%s has 11 slots, exactly one goalkeeper, all on the pitch", (name) => {
    const slots = FORMATIONS[name];

    expect(slots).toHaveLength(11);
    expect(slots.filter((slot) => slot.position === "GK")).toHaveLength(1);
    for (const { x, y } of slots) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
  });

  it.each(FORMATION_NAMES)("%s matches its name: defenders, then midfielders and forwards, whatever its variant", (name) => {
    // « 4-3-3-attacking » is a 4-3-3: the variant after the figures names no line.
    const lines = name.split("-").filter((part) => /^\d+$/.test(part)).map(Number);
    const counts = { DF: 0, MF: 0, FW: 0 };
    for (const position of formationPositions(name)) {
      const group = positionGroup(position);
      if (group !== "GK") {
        counts[group]++;
      }
    }

    expect(counts.DF).toBe(lines[0]);
    expect(counts.MF + counts.FW).toBe(lines.slice(1).reduce((sum, count) => sum + count, 0));
  });

  it.each(FORMATION_NAMES)("%s puts no two slots on the same spot, the goalkeeper deepest", (name) => {
    const slots = FORMATIONS[name];
    const spots = new Set(slots.map(({ x, y }) => `${x}:${y}`));
    const goalkeeper = slots.find((slot) => slot.position === "GK");

    expect(spots.size).toBe(11);
    expect(slots.every((slot) => slot === goalkeeper || slot.y < (goalkeeper?.y ?? 0))).toBe(true);
  });

  it("keeps the 4-3-3 of AI clubs in its historical slot order", () => {
    expect(DEFAULT_FORMATION_NAME).toBe("4-3-3");
    expect(formationPositions("4-3-3")).toEqual(["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CM", "RW", "ST", "LW"]);
  });

  it("recognises formation names", () => {
    expect(isFormationName("4-4-2")).toBe(true);
    expect(isFormationName("4-4-2-diamond")).toBe(true);
    expect(isFormationName("4-4-3")).toBe(false);
  });

  it("has seventeen formations in three families, by their defenders: eleven with four, four with three, two with five", () => {
    expect(FORMATION_NAMES).toHaveLength(17);
    const counts = FORMATION_FAMILIES.map((family) => FORMATION_NAMES.filter((name) => formationFamily(name) === family).length);
    expect(Object.fromEntries(FORMATION_FAMILIES.map((family, index) => [family, counts[index]]))).toEqual({ 3: 4, 4: 11, 5: 2 });
    for (const name of FORMATION_NAMES) {
      expect(formationFamily(name)).toBe(Number(name.split("-")[0]));
    }
  });
});
