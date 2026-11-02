import { describe, expect, it } from "vitest";
import type { MatchEventType, Side } from "@/src/engine/match";
import { countFor, matchStats } from "./match-stats";

const event = (type: MatchEventType, side: Side) => ({ type, side });

describe("matchStats", () => {
  it("is all zeros before the first event, one line a compared event, in the screen's order", () => {
    expect(matchStats([])).toEqual([
      { type: "GOAL", home: 0, away: 0 },
      { type: "YELLOW_CARD", home: 0, away: 0 },
      { type: "RED_CARD", home: 0, away: 0 },
      { type: "SUBSTITUTION", home: 0, away: 0 },
      { type: "INJURY", home: 0, away: 0 },
    ]);
  });

  it("counts each event for its side", () => {
    const stats = matchStats([
      event("GOAL", "home"),
      event("GOAL", "away"),
      event("GOAL", "home"),
      event("YELLOW_CARD", "away"),
      event("RED_CARD", "away"),
      event("SUBSTITUTION", "home"),
      event("SUBSTITUTION", "home"),
      event("SUBSTITUTION", "away"),
      event("INJURY", "home"),
    ]);
    expect(stats).toEqual([
      { type: "GOAL", home: 2, away: 1 },
      { type: "YELLOW_CARD", home: 0, away: 1 },
      { type: "RED_CARD", home: 0, away: 1 },
      { type: "SUBSTITUTION", home: 2, away: 1 },
      { type: "INJURY", home: 1, away: 0 },
    ]);
  });

  it("leaves a shoot-out's kicks out: a kick scored is no goal", () => {
    const stats = matchStats([event("SHOOTOUT_GOAL", "home"), event("SHOOTOUT_MISS", "away")]);
    expect(stats.every(({ home, away }) => home === 0 && away === 0)).toBe(true);
  });
});

describe("countFor", () => {
  it("counts a side's items", () => {
    const goals = [{ side: "home" }, { side: "away" }, { side: "home" }] as const;
    expect(countFor(goals, "home")).toBe(2);
    expect(countFor(goals, "away")).toBe(1);
    expect(countFor([], "home")).toBe(0);
  });
});
