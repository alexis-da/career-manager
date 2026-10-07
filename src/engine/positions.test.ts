import { describe, expect, it } from "vitest";
import {
  DISTANT_GROUP_FAMILIARITY,
  GOAL_SWAP_FAMILIARITY,
  NEIGHBOUR_GROUP_FAMILIARITY,
  SAME_GROUP_FAMILIARITY,
  SAME_POSITION_FAMILIARITY,
  SECONDARY_POSITION_COUNT_WEIGHTS,
  SECONDARY_POSITION_FAMILIARITY,
  SECONDARY_POSITION_NEIGHBOURS,
  SQUAD_ROLES,
} from "./balance";
import {
  familiarity,
  POSITIONS,
  positionGroup,
  ratingAt,
  roleCounts,
  secondaryPositions,
  squadTemplate,
  type Position,
} from "./positions";

const OUTFIELD = POSITIONS.filter((position) => position !== "GK");

/** The first test key with as many secondary positions as wanted; how many depends on the key only. */
function keyWith(count: number): string {
  for (let index = 0; ; index++) {
    const key = `test#${index}`;
    if (secondaryPositions(key, "CB").length === count) {
      return key;
    }
  }
}

const countOf = (positions: readonly Position[], ...wanted: Position[]): number =>
  positions.filter((position) => wanted.includes(position)).length;

describe("positionGroup", () => {
  it("puts every position in its line", () => {
    expect(POSITIONS.map(positionGroup)).toEqual(["GK", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "MF", "FW", "FW", "FW"]);
  });
});

describe("ratingAt", () => {
  // A player without secondary positions: the table of familiarity alone.
  const plainKey = keyWith(0);
  const rated = (position: Position, slot: Position): number => ratingAt({ id: plainKey, position, overall: 80 }, slot);

  it("keeps the overall at the player's own position", () => {
    for (const position of POSITIONS) {
      expect(rated(position, position)).toBe(80 * SAME_POSITION_FAMILIARITY);
    }
  });

  it("applies the same-group factor to another position of the line", () => {
    expect(rated("CB", "RB")).toBeCloseTo(80 * SAME_GROUP_FAMILIARITY);
    expect(rated("CDM", "CAM")).toBeCloseTo(80 * SAME_GROUP_FAMILIARITY);
    expect(rated("RW", "ST")).toBeCloseTo(80 * SAME_GROUP_FAMILIARITY);
  });

  it("applies the neighbour factor to the next line, both ways", () => {
    for (const [position, slot] of [
      ["CB", "CDM"],
      ["CM", "LB"],
      ["CAM", "ST"],
      ["LW", "LM"],
    ] as [Position, Position][]) {
      expect(rated(position, slot)).toBeCloseTo(80 * NEIGHBOUR_GROUP_FAMILIARITY);
    }
  });

  it("applies the distant factor between defence and attack, both ways", () => {
    expect(rated("CB", "ST")).toBeCloseTo(80 * DISTANT_GROUP_FAMILIARITY);
    expect(rated("RW", "RB")).toBeCloseTo(80 * DISTANT_GROUP_FAMILIARITY);
  });

  it("applies the goal swap factor to a goalkeeper outfield and to an outfield player in goal", () => {
    for (const position of POSITIONS.filter((candidate) => candidate !== "GK")) {
      expect(rated("GK", position)).toBeCloseTo(80 * GOAL_SWAP_FAMILIARITY);
      expect(rated(position, "GK")).toBeCloseTo(80 * GOAL_SWAP_FAMILIARITY);
    }
  });

  it("is symmetric and never above the overall", () => {
    for (const position of POSITIONS) {
      for (const slot of POSITIONS) {
        expect(familiarity(position, slot)).toBe(familiarity(slot, position));
        expect(familiarity(position, slot)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("secondaryPositions", () => {
  const keys = Array.from({ length: 2_000 }, (_, index) => `club-${index % 37}#${index}`);

  it("gives the same positions for the same key, whatever was drawn before", () => {
    const first = keys.map((key, index) => secondaryPositions(key, OUTFIELD[index % OUTFIELD.length]));
    const again = [...keys].reverse().map((key) => secondaryPositions(key, OUTFIELD[keys.indexOf(key) % OUTFIELD.length]));
    expect(again.reverse()).toEqual(first);
  });

  it("gives none, one or two secondary positions in 25 / 55 / 20 % of players, give or take 3 points", () => {
    const counts = [0, 0, 0];
    keys.forEach((key, index) => counts[secondaryPositions(key, OUTFIELD[index % OUTFIELD.length]).length]++);
    counts.forEach((count, size) => {
      expect(Math.abs(count / keys.length - SECONDARY_POSITION_COUNT_WEIGHTS[size])).toBeLessThanOrEqual(0.03);
    });
  });

  it("never gives a goalkeeper a secondary position", () => {
    for (const key of keys) {
      expect(secondaryPositions(key, "GK")).toEqual([]);
    }
  });

  it("draws every secondary position among the neighbours of the primary one, each once", () => {
    for (const [index, key] of keys.entries()) {
      for (const primary of [OUTFIELD[index % OUTFIELD.length], OUTFIELD[(index + 5) % OUTFIELD.length]]) {
        const secondary = secondaryPositions(key, primary);
        expect(secondary.every((position) => SECONDARY_POSITION_NEIGHBOURS[primary].includes(position))).toBe(true);
        expect(new Set(secondary).size).toBe(secondary.length);
        expect(secondary).not.toContain(primary);
      }
    }
  });

  it("rates a player at 0.97 of his overall at a secondary position, even in another line", () => {
    const key = keyWith(2);
    for (const primary of OUTFIELD) {
      for (const slot of secondaryPositions(key, primary)) {
        expect(ratingAt({ id: key, position: primary, overall: 80 }, slot)).toBeCloseTo(80 * SECONDARY_POSITION_FAMILIARITY);
      }
    }
    expect(familiarity("CB", "CDM", ["CDM"])).toBe(SECONDARY_POSITION_FAMILIARITY);
    expect(familiarity("CB", "CDM")).toBe(NEIGHBOUR_GROUP_FAMILIARITY);
    expect(familiarity("CB", "CB", ["CDM"])).toBe(SAME_POSITION_FAMILIARITY);
    expect(SAME_GROUP_FAMILIARITY).toBeLessThan(SECONDARY_POSITION_FAMILIARITY);
  });
});

describe("squadTemplate", () => {
  it("lays out a squad of 23 by role", () => {
    const squad = squadTemplate(23);

    expect(squad).toHaveLength(23);
    expect(countOf(squad, "GK")).toBe(2);
    expect(countOf(squad, "RB")).toBe(2);
    expect(countOf(squad, "CB")).toBe(4);
    expect(countOf(squad, "LB")).toBe(2);
    expect(countOf(squad, "CDM")).toBe(2);
    expect(countOf(squad, "CM")).toBe(3);
    expect(countOf(squad, "CAM")).toBe(2);
    expect(countOf(squad, "RM", "RW")).toBe(2);
    expect(countOf(squad, "LM", "LW")).toBe(2);
    expect(countOf(squad, "ST")).toBe(2);
    // A role of two positions has one of each.
    expect([countOf(squad, "RM"), countOf(squad, "RW"), countOf(squad, "LM"), countOf(squad, "LW")]).toEqual([1, 1, 1, 1]);
  });

  it("scales the roles to any size, the largest remainders first", () => {
    expect(roleCounts(23)).toEqual(SQUAD_ROLES.map((role) => role.count));
    expect(roleCounts(120)).toEqual([11, 11, 21, 11, 10, 16, 10, 10, 10, 10]);
    expect(squadTemplate(120)).toHaveLength(120);
  });
});
