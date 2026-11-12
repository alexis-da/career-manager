import { describe, expect, it } from "vitest";
import { assistantWordAfter, stakeOf, type StakeRow } from "./session-end";

/** A table in rank order: [club, points], all with the same matches played. */
const table = (rows: [string, number][], played = 6): StakeRow[] =>
  rows.map(([club, points], index) => ({ club, rank: index + 1, points, played }));

const LEAGUE = table([
  ["a", 16],
  ["b", 14],
  ["c", 12],
  ["own", 10],
  ["d", 9],
  ["e", 4],
  ["f", 1],
]);

describe("stakeOf", () => {
  it("says a cup tie is a knockout, whatever the table", () => {
    expect(stakeOf({ cup: true, table: LEAGUE, own: "own", opponent: "a" })).toEqual({ kind: "cup" });
  });

  it("calls the first league match of the season the opening one", () => {
    expect(stakeOf({ cup: false, table: table([["own", 0], ["a", 0]], 0), own: "own", opponent: "a" })).toEqual({ kind: "opening" });
  });

  it("finds a direct rival within three points, above or below", () => {
    expect(stakeOf({ cup: false, table: LEAGUE, own: "own", opponent: "c" })).toEqual({ kind: "rival", gap: 2 });
    expect(stakeOf({ cup: false, table: LEAGUE, own: "own", opponent: "d" })).toEqual({ kind: "rival", gap: 1 });
  });

  it("counts the places a win may gain: the clubs above within three points", () => {
    expect(stakeOf({ cup: false, table: LEAGUE, own: "own", opponent: "f" })).toEqual({ kind: "climb", places: 1 });
  });

  it("names the opponent's rank when a win changes no place", () => {
    const leading = table([
      ["own", 20],
      ["a", 12],
      ["b", 3],
    ]);
    expect(stakeOf({ cup: false, table: leading, own: "own", opponent: "b" })).toEqual({ kind: "rank", rank: 3 });
  });
});

describe("assistantWordAfter", () => {
  const defeat = (scored: number, conceded: number, cup = false) => ({ result: "L" as const, scored, conceded, cup });

  it("says nothing after a win or a draw", () => {
    expect(assistantWordAfter({ result: "W", scored: 2, conceded: 0, cup: false }, 10, 5)).toBeNull();
    expect(assistantWordAfter({ result: "D", scored: 1, conceded: 1, cup: true }, 10, 5)).toBeNull();
  });

  it("speaks of the cup after a cup defeat, a shoot-out's included", () => {
    expect(assistantWordAfter(defeat(1, 1, true), 1, 5)).toBe("cupExit");
  });

  it("says it is too early to judge before the objectives are", () => {
    expect(assistantWordAfter(defeat(0, 4), 1, 5)).toBe("early");
    expect(assistantWordAfter(defeat(0, 4), 4, 5)).toBe("early");
  });

  it("then tells a narrow defeat from a heavy one", () => {
    expect(assistantWordAfter(defeat(1, 2), 5, 5)).toBe("narrow");
    expect(assistantWordAfter(defeat(0, 2), 5, 5)).toBe("plain");
    expect(assistantWordAfter(defeat(1, 4), 5, 5)).toBe("heavy");
  });
});
