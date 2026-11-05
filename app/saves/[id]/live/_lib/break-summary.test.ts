import { describe, expect, it } from "vitest";
import type { MatchEventView } from "@/src/db/calendar";
import { breakMarks } from "./break-summary";

function event(id: string, minute: number, overrides: Partial<MatchEventView> = {}): MatchEventView {
  return {
    id,
    minute,
    type: "GOAL",
    period: "REGULAR",
    side: "home",
    playerName: "Hugo Guérin",
    playerKey: "p-9",
    playerAge: 24,
    relatedPlayerName: null,
    relatedPlayerKey: null,
    ...overrides,
  };
}

describe("breakMarks", () => {
  it("names each scorer of a side once, with the minutes of his goals, then each player of it sent off", () => {
    const events = [
      event("1", 12),
      event("2", 20, { type: "YELLOW_CARD", playerName: "Léo Bernard", playerKey: "p-4" }),
      event("3", 31, { type: "RED_CARD", playerName: "Léo Bernard", playerKey: "p-4" }),
      event("4", 38, { playerName: "Noé Petit", playerKey: "p-7", relatedPlayerName: "Hugo Guérin", relatedPlayerKey: "p-9" }),
      event("5", 44),
      event("6", 40, { side: "away", playerName: "Théo Roux", playerKey: "p-31" }),
      event("7", 41, { type: "SUBSTITUTION", playerName: "Paul Diaz", playerKey: "p-15" }),
      event("8", 42, { type: "INJURY", playerName: "Noé Petit", playerKey: "p-7" }),
    ];
    expect(breakMarks(events, "home")).toEqual([
      { type: "GOAL", key: "p-9", name: "Hugo Guérin", minutes: ["12'", "44'"] },
      { type: "GOAL", key: "p-7", name: "Noé Petit", minutes: ["38'"] },
      { type: "RED_CARD", key: "p-4", name: "Léo Bernard", minutes: ["31'"] },
    ]);
    expect(breakMarks(events, "away")).toEqual([{ type: "GOAL", key: "p-31", name: "Théo Roux", minutes: ["40'"] }]);
  });

  it("tells two players of the same name apart by their keys, and writes stoppage and extra time as the feed does", () => {
    const events = [
      event("1", 92, { playerName: "Hugo Martin", playerKey: "p-9" }),
      event("2", 95, { playerName: "Hugo Martin", playerKey: "p-19" }),
      event("3", 104, { period: "EXTRA_TIME", playerName: "Hugo Martin", playerKey: "p-9" }),
    ];
    expect(breakMarks(events, "home")).toEqual([
      { type: "GOAL", key: "p-9", name: "Hugo Martin", minutes: ["90+2'", "104'"] },
      { type: "GOAL", key: "p-19", name: "Hugo Martin", minutes: ["90+5'"] },
    ]);
  });

  it("leaves the shoot-out out, and a side without a goal or a red card has nothing", () => {
    const events = [event("1", 1, { type: "SHOOTOUT_GOAL", period: "SHOOTOUT" }), event("2", 2, { type: "SHOOTOUT_MISS", period: "SHOOTOUT" })];
    expect(breakMarks(events, "home")).toEqual([]);
    expect(breakMarks([], "away")).toEqual([]);
  });
});
