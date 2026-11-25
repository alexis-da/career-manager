import { describe, expect, it } from "vitest";
import { FULL_GROWTH_MINUTES, progressionHistory, roundChange, summerOutlook } from "./progression-view";

/** A club of a 38-match league season, `played` of them played. */
const club = (played: number) => ({ played, matches: 38 });

describe("roundChange", () => {
  it("rounds to the point, half away from zero, never to -0", () => {
    expect([6.5, 3.9, 1.625, 1.05, 0.4, 0.075].map(roundChange)).toEqual([7, 4, 2, 1, 0, 0]);
    expect([-1, -1.75, -2.5, -3.25, -4.67].map(roundChange)).toEqual([-1, -2, -3, -3, -5]);
    expect(Object.is(roundChange(-0.2), 0)).toBe(true);
  });
});

describe("summerOutlook", () => {
  // 18 years old during the season (19 on the next 1 July), rated 62 for a potential of 82: docs/design/effectif-adjoint.md
  // § 0.3, +1.6 without a league minute, +6.5 at 2 250.
  const talent = { overall: 62, potential: 82 };

  it("gives a player with room his summer at his rhythm, and its two bounds", () => {
    // 620 minutes after 10 of 38 matches: 2 356 at this rhythm, past the full mark.
    expect(summerOutlook(talent, 19, 620, club(10))).toEqual({ leagueMinutes: 620, growth: { expected: 7, idle: 2, starter: 7 }, decline: null });
    // 310 after 10: 1 178 at the season's end, a factor of 0.68.
    expect(summerOutlook(talent, 19, 310, club(10)).growth).toEqual({ expected: 4, idle: 2, starter: 7 });
    // Never played: the idle bound.
    expect(summerOutlook(talent, 19, 0, club(10)).growth?.expected).toBe(2);
    expect(FULL_GROWTH_MINUTES).toBe(2250);
  });

  it("projects nothing before the club's first league match", () => {
    expect(summerOutlook(talent, 19, 0, club(0)).growth).toEqual({ expected: 2, idle: 2, starter: 7 });
    // A season over: his minutes as they are.
    expect(summerOutlook(talent, 19, 900, { played: 38, matches: 38 }).growth?.expected).toBe(4);
  });

  it("gives no growth without room, nor from 29 on the next 1 July, and a decline from 31", () => {
    expect(summerOutlook({ overall: 75, potential: 75 }, 24, 1800, club(20)).growth).toBeNull();
    expect(summerOutlook({ overall: 70, potential: 76 }, 29, 1800, club(20))).toEqual({ leagueMinutes: 1800, growth: null, decline: null });
    // 29 years old during the season, 30 on the next 1 July: no growth, no decline yet.
    expect(summerOutlook({ overall: 70, potential: 70 }, 30, 0, club(20))).toEqual({ leagueMinutes: 0, growth: null, decline: null });
    expect(summerOutlook({ overall: 70, potential: 70 }, 31, 2000, club(20)).decline).toBe(-1);
    expect(summerOutlook({ overall: 70, potential: 70 }, 33, 2000, club(20)).decline).toBe(-3);
    expect(summerOutlook({ overall: 70, potential: 70 }, 35, 0, club(20)).decline).toBe(-4);
  });
});

describe("progressionHistory", () => {
  const seasons = [
    { startYear: 2028, squad: [{ playerKey: "a", overall: 67, value: 1, potential: 82 }] },
    { startYear: 2026, squad: [{ playerKey: "a", overall: 63, value: 1 }, { playerKey: "b", overall: 70, value: 1 }] },
    { startYear: 2027, squad: [{ playerKey: "b", overall: 71, value: 1 }] },
  ];

  it("gives one point per completed season the player ended at the club, oldest first, then the season under way", () => {
    expect(progressionHistory("a", seasons, { startYear: 2029, overall: 71, potential: 82 })).toEqual([
      { startYear: 2026, overall: 63, potential: null },
      { startYear: 2028, overall: 67, potential: 82 },
      { startYear: 2029, overall: 71, potential: 82 },
    ]);
    expect(progressionHistory("c", seasons, { startYear: 2029, overall: 60, potential: 75 })).toEqual([
      { startYear: 2029, overall: 60, potential: 75 },
    ]);
  });

  it("never takes the highlights of the season under way, or of a later one", () => {
    expect(progressionHistory("b", seasons, { startYear: 2027, overall: 72, potential: 72 })).toEqual([
      { startYear: 2026, overall: 70, potential: null },
      { startYear: 2027, overall: 72, potential: 72 },
    ]);
  });
});
