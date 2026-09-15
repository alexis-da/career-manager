import { describe, expect, it } from "vitest";
import { computeStandings } from "./standings";

describe("computeStandings", () => {
  it("awards 3 points for a win and 1 for a draw", () => {
    const table = computeStandings([
      { home: "alpha", away: "beta", homeGoals: 2, awayGoals: 0 },
      { home: "beta", away: "gamma", homeGoals: 1, awayGoals: 1 },
      { home: "gamma", away: "alpha", homeGoals: 1, awayGoals: 0 },
    ]);

    expect(table.map((row) => [row.rank, row.club, row.points])).toEqual([
      [1, "gamma", 4],
      [2, "alpha", 3],
      [3, "beta", 1],
    ]);
    expect(table[0]).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 2, goalsAgainst: 1 });
  });

  it("breaks ties on goal difference, then goals scored, then club key", () => {
    const table = computeStandings([
      { home: "alpha", away: "beta", homeGoals: 1, awayGoals: 0 },
      { home: "gamma", away: "delta", homeGoals: 3, awayGoals: 2 },
      { home: "zeta", away: "epsilon", homeGoals: 0, awayGoals: 0 },
      { home: "eta", away: "theta", homeGoals: 2, awayGoals: 0 },
    ]);

    expect(table.map((row) => row.club)).toEqual([
      "eta", // 3 pts, +2
      "gamma", // 3 pts, +1, 3 scored
      "alpha", // 3 pts, +1, 1 scored
      "epsilon", // 1 pt, same record as zeta
      "zeta",
      "delta", // 0 pts, -1, 2 scored
      "beta",
      "theta", // 0 pts, -2
    ]);
  });

  it("lists every club of the competition, those without a played match with zeros", () => {
    const table = computeStandings([{ home: "alpha", away: "beta", homeGoals: 0, awayGoals: 2 }], ["alpha", "beta", "gamma"]);

    expect(table.map((row) => [row.club, row.played, row.points])).toEqual([
      ["beta", 1, 3],
      ["gamma", 0, 0], // ahead of alpha on goal difference
      ["alpha", 1, 0],
    ]);
    expect(computeStandings([], ["beta", "alpha"]).map((row) => [row.rank, row.club])).toEqual([
      [1, "alpha"],
      [2, "beta"],
    ]);
  });
});
