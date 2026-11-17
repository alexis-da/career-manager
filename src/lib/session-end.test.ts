import { describe, expect, it } from "vitest";
import { assistantWordAfter, europeStakeOf, stakeOf, type StakeRow } from "./session-end";

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

describe("europeStakeOf", () => {
  /** A league phase after three rounds: 20 clubs, the club 7th with 4 points, the 4th with 6, the 12th with 3. */
  const PHASE = table(
    [
      ["a", 9],
      ["b", 7],
      ["c", 7],
      ["d", 6],
      ["e", 6],
      ["f", 5],
      ["own", 4],
      ["g", 4],
      ["h", 4],
      ["i", 3],
      ["j", 3],
      ["k", 3],
      ["l", 2],
      ["m", 1],
      ["n", 1],
      ["o", 1],
      ["p", 0],
      ["q", 0],
      ["r", 0],
      ["s", 0],
    ],
    3,
  );
  const stake = (own: string, opponent: string, knockout = false, final = false) =>
    europeStakeOf({ knockout, final, table: PHASE, own, opponent });

  it("names a knockout tie and the final before anything of a table", () => {
    expect(stake("own", "a", true)).toEqual({ kind: "europeKnockout" });
    expect(stake("own", "a", true, true)).toEqual({ kind: "europeFinal" });
  });

  it("in the league phase: the first match, a win into the first four or twelve, else the opponent's rank", () => {
    const opening = table(
      [
        ["own", 0],
        ["a", 0],
      ],
      0,
    );
    expect(europeStakeOf({ knockout: false, final: false, table: opening, own: "own", opponent: "a" })).toEqual({ kind: "europeOpening" });
    // 4 points and a win make 7, past the 4th's 6.
    expect(stake("own", "b")).toEqual({ kind: "europeTopFour" });
    // The 14th, with 1 point: a win makes 4, past the 12th's 3, short of the 4th's 6.
    expect(stake("m", "b")).toEqual({ kind: "europeTopTwelve" });
    // The leader, already in the first four: the opponent's rank.
    expect(stake("a", "own")).toEqual({ kind: "europeRank", rank: 7 });
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

  it("speaks of Europe after a European knockout tie lost, never after a league phase defeat", () => {
    expect(assistantWordAfter({ ...defeat(1, 2), europeKnockout: true }, 10, 5)).toBe("europeExit");
    expect(assistantWordAfter({ ...defeat(1, 2), europeKnockout: false }, 10, 5)).toBe("narrow");
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
