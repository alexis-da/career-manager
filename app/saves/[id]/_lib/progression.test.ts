import { describe, expect, it } from "vitest";
import type { PlayerProgression } from "@/src/db/progression-view";
import { CURVE_BOX, curveLayout, FULL_GROWTH_MINUTES, isYoung, minutesShare, shownExpected, signedChange } from "./progression";

/** The minus of a decline, never a hyphen. */
const MINUS = String.fromCharCode(0x2212);

const withGrowth = (expected: number | null): PlayerProgression => ({
  last: null,
  outlook: { leagueMinutes: 0, growth: expected === null ? null : { expected, idle: 0, starter: 2 }, decline: null },
  history: [],
});

describe("the squad's progression", () => {
  it("writes a change with its sign, a true minus for a loss", () => {
    expect(signedChange(4)).toBe("+4");
    expect(signedChange(-1)).toBe(`${MINUS}1`);
    expect(signedChange(0)).toBe("0");
  });

  it("shows the summer to come from a point, never for a player without room nor anyone else's", () => {
    expect(shownExpected(withGrowth(3))).toBe(3);
    expect(shownExpected(withGrowth(0))).toBeNull();
    expect(shownExpected(withGrowth(null))).toBeNull();
    expect(shownExpected({ last: 2, outlook: null, history: [] })).toBeNull();
  });

  it("counts a player of 21 as young, not one of 22, and fills the gauge at 2 250 league minutes", () => {
    expect([18, 21, 22].map((age) => isYoung({ age }))).toEqual([true, true, false]);
    expect(FULL_GROWTH_MINUTES).toBe(2250);
    expect([0, 1125, 2250, 3420].map(minutesShare)).toEqual([0, 0.5, 1, 1]);
  });
});

describe("curveLayout", () => {
  const points = [
    { startYear: 2026, overall: 63, potential: null },
    { startYear: 2027, overall: 67, potential: 82 },
    { startYear: 2028, overall: 71, potential: 82 },
  ];

  it("spreads the seasons from the left edge to the right one, the oldest first", () => {
    const { ratings } = curveLayout(points);
    expect(ratings.map((mark) => mark.startYear)).toEqual([2026, 2027, 2028]);
    expect(ratings[0].x).toBe(CURVE_BOX.left);
    expect(ratings[2].x).toBe(CURVE_BOX.width - CURVE_BOX.right);
    expect(ratings[1].x).toBe(CURVE_BOX.width / 2);
  });

  it("puts a higher rating higher, every point within the plot, the potentials known on the same scale", () => {
    const { ratings, potentials } = curveLayout(points);
    expect(ratings[0].y).toBeGreaterThan(ratings[1].y);
    expect(ratings[1].y).toBeGreaterThan(ratings[2].y);
    expect(potentials.map((mark) => mark.value)).toEqual([82, 82]);
    expect(potentials[0].y).toBeLessThan(ratings[2].y);
    for (const { y } of [...ratings, ...potentials]) {
      expect(y).toBeGreaterThanOrEqual(CURVE_BOX.top);
      expect(y).toBeLessThanOrEqual(CURVE_BOX.height - CURVE_BOX.bottom);
    }
  });

  it("never makes a point gained a cliff, and writes the seasons under four points at most, else the ends", () => {
    const flat = curveLayout([
      { startYear: 2026, overall: 70, potential: null },
      { startYear: 2027, overall: 71, potential: null },
    ]);
    const plot = CURVE_BOX.height - CURVE_BOX.top - CURVE_BOX.bottom;
    expect(flat.ratings[0].y - flat.ratings[1].y).toBeLessThanOrEqual(plot / 4);
    expect(flat.labelled).toEqual([0, 1]);
    const long = curveLayout(Array.from({ length: 7 }, (_, index) => ({ startYear: 2026 + index, overall: 60 + index, potential: null })));
    expect(long.labelled).toEqual([0, 6]);
  });
});
