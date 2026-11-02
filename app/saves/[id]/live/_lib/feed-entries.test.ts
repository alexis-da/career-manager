import { describe, expect, it } from "vitest";
import type { MatchEventView } from "@/src/db/calendar";
import { feedEntries, type FeedEntry } from "./feed-entries";

function event(id: string, minute: number, overrides: Partial<MatchEventView> = {}): MatchEventView {
  return {
    id,
    minute,
    type: "YELLOW_CARD",
    period: "REGULAR",
    side: "home",
    playerName: "Hugo Guérin",
    playerKey: null,
    playerAge: null,
    relatedPlayerName: null,
    relatedPlayerKey: null,
    ...overrides,
  };
}

const goal = (id: string, minute: number, overrides: Partial<MatchEventView> = {}) => event(id, minute, { type: "GOAL", ...overrides });

/** The feed in a word per line, newest first. */
const keys = (entries: FeedEntry[]): string[] => entries.map((entry) => (entry.kind === "event" ? entry.event.id : entry.marker));

const scoreAt = (entries: FeedEntry[], name: string) =>
  entries.flatMap((entry) => (entry.kind === "marker" && entry.marker === name ? [entry.score] : []));

describe("feedEntries", () => {
  it("has the kick-off alone before the first event, at the 1st minute, with no score", () => {
    expect(feedEntries([], 0, false)).toEqual([{ kind: "marker", marker: "kickOff", minute: 1, score: null }]);
  });

  it("lists the events newest first, the kick-off always last, even under an event of the 1st minute", () => {
    expect(keys(feedEntries([event("a", 1), event("b", 12), event("c", 12)], 20, false))).toEqual(["c", "b", "a", "kickOff"]);
  });

  it("adds half-time only once 45' is reached", () => {
    expect(keys(feedEntries([event("a", 30)], 44, false))).toEqual(["a", "kickOff"]);
    expect(keys(feedEntries([event("a", 30)], 45, false))).toEqual(["halfTime", "a", "kickOff"]);
  });

  it("puts half-time between the 45th minute and the 46th, the second half's substitutions above it", () => {
    const shown = [event("first", 45), event("substitution", 46, { type: "SUBSTITUTION" }), event("second", 50)];
    expect(keys(feedEntries(shown, 60, false))).toEqual(["second", "substitution", "halfTime", "first", "kickOff"]);
  });

  it("gives half-time the score of the first half, whatever came after", () => {
    const shown = [goal("a", 10), goal("b", 45, { side: "away" }), goal("c", 20, { side: "away" }), goal("d", 46), goal("e", 80)];
    expect(scoreAt(feedEntries(shown, 90, false), "halfTime")).toEqual([{ home: 1, away: 2 }]);
  });

  it("does not count a card as a goal", () => {
    expect(scoreAt(feedEntries([event("a", 10), goal("b", 11)], 45, false), "halfTime")).toEqual([{ home: 1, away: 0 }]);
  });

  it("has no end of normal time without extra time, even in stoppage time", () => {
    expect(keys(feedEntries([event("late", 93)], 90, false))).toEqual(["late", "halfTime", "kickOff"]);
  });

  it("waits for the 90th minute to end normal time", () => {
    expect(keys(feedEntries([], 89, true))).toEqual(["halfTime", "kickOff"]);
  });

  it("puts the end of normal time above stoppage time and below extra time, with the score at that moment", () => {
    const shown = [
      goal("first", 30),
      goal("stoppage", 92, { side: "away" }),
      event("first-extra", 91, { period: "EXTRA_TIME" }),
      goal("extra", 95, { period: "EXTRA_TIME" }),
    ];
    const entries = feedEntries(shown, 120, true);
    expect(keys(entries)).toEqual(["extra", "first-extra", "regulationEnd", "stoppage", "halfTime", "first", "kickOff"]);
    expect(scoreAt(entries, "regulationEnd")).toEqual([{ home: 1, away: 1 }]);
  });

  it("leaves a shoot-out's kicks out", () => {
    const kick = event("kick", 1, { type: "SHOOTOUT_GOAL", period: "SHOOTOUT" });
    expect(keys(feedEntries([kick], 120, true))).toEqual(["regulationEnd", "halfTime", "kickOff"]);
  });
});
