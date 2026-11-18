import { describe, expect, it } from "vitest";
import { HIGHLIGHT_SCORERS, SEASON_HIGHLIGHTS_VERSION, seasonHighlights, type HighlightGoal } from "./season-highlights";

const match = (id: string, day: number) => ({
  id,
  date: new Date(Date.UTC(2026, 8, day, 18)),
  competitionCode: "fr.1",
  round: day,
  opponentClubSaveId: `opponent-${id}`,
});
const player = (id: string) => ({ id, playerKey: `key-${id}`, name: `Name ${id}` });
const goals = (fixtureId: string, scorerId: string, count: number, assisterId: string | null = null): HighlightGoal[] =>
  Array.from({ length: count }, () => ({ fixtureId, scorerId, assisterId }));

describe("seasonHighlights", () => {
  it("ranks the club's scorers by goals then assists, keeps five, and names its hat-tricks by date", () => {
    const highlights = seasonHighlights({
      budget: 12_500_000,
      matches: [match("m1", 5), match("m2", 12), match("m3", 19)],
      goals: [
        ...goals("m2", "a", 3, "b"), // a hat-trick, set up by b
        ...goals("m1", "b", 2),
        ...goals("m3", "c", 4, "a"), // four goals: a hat-trick too
        ...goals("m1", "d", 1),
        ...goals("m3", "e", 1),
        ...goals("m3", "f", 1, "b"),
        ...goals("m2", "g", 1),
      ],
      players: ["a", "b", "c", "d", "e", "f", "g"].map(player),
      squad: [
        { playerKey: "key-z", overall: 70, value: 4_000_000 },
        { playerKey: "key-a", overall: 78, value: 21_000_000 },
      ],
    });

    expect(highlights.version).toBe(SEASON_HIGHLIGHTS_VERSION);
    expect(highlights.budget).toBe(12_500_000);
    expect(highlights.scorers).toHaveLength(HIGHLIGHT_SCORERS);
    expect(highlights.scorers.slice(0, 3)).toEqual([
      { playerKey: "key-c", name: "Name c", goals: 4, assists: 0 },
      { playerKey: "key-a", name: "Name a", goals: 3, assists: 4 },
      { playerKey: "key-b", name: "Name b", goals: 2, assists: 4 },
    ]);
    // One goal each, no assist for d, e and g: by key.
    expect(highlights.scorers.slice(3).map((scorer) => scorer.playerKey)).toEqual(["key-d", "key-e"]);
    expect(highlights.hatTricks).toEqual([
      { playerKey: "key-a", name: "Name a", goals: 3, date: "2026-09-12", competitionCode: "fr.1", round: 12, opponentClubSaveId: "opponent-m2" },
      { playerKey: "key-c", name: "Name c", goals: 4, date: "2026-09-19", competitionCode: "fr.1", round: 19, opponentClubSaveId: "opponent-m3" },
    ]);
    expect(highlights.squad.map((squadPlayer) => squadPlayer.playerKey)).toEqual(["key-a", "key-z"]);
  });

  it("keeps a season without goals, and refuses a goal of an unknown player or match", () => {
    expect(seasonHighlights({ budget: 0, matches: [], goals: [], players: [], squad: [] })).toEqual({
      version: SEASON_HIGHLIGHTS_VERSION,
      budget: 0,
      scorers: [],
      hatTricks: [],
      squad: [],
    });
    expect(() => seasonHighlights({ budget: 0, matches: [match("m1", 1)], goals: goals("m1", "x", 1), players: [], squad: [] })).toThrow(/Player x/);
    expect(() => seasonHighlights({ budget: 0, matches: [], goals: goals("m9", "a", 3), players: [player("a")], squad: [] })).toThrow(/Match m9/);
  });
});
