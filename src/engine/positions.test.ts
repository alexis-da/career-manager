import { describe, expect, it } from "vitest";
import {
  DISTANT_GROUP_FAMILIARITY,
  GOAL_SWAP_FAMILIARITY,
  NEIGHBOUR_GROUP_FAMILIARITY,
  SAME_GROUP_FAMILIARITY,
  SAME_POSITION_FAMILIARITY,
  SQUAD_ROLES,
} from "./balance";
import { familiarity, POSITIONS, positionGroup, ratingAt, roleCounts, squadTemplate, type Position } from "./positions";

const countOf = (positions: readonly Position[], ...wanted: Position[]): number =>
  positions.filter((position) => wanted.includes(position)).length;

describe("positionGroup", () => {
  it("puts every position in its line", () => {
    expect(POSITIONS.map(positionGroup)).toEqual(["GK", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "MF", "FW", "FW", "FW"]);
  });
});

describe("ratingAt", () => {
  const rated = (position: Position, slot: Position): number => ratingAt({ position, overall: 80 }, slot);

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
