import { describe, expect, it } from "vitest";
import { seenItems, showsFirstActions } from "./first-steps";

describe("seenItems", () => {
  const among = (...names: string[]) => seenItems((name) => names.includes(name));

  it("reads each item from its own cookie", () => {
    expect([...among("lw_seen_squad", "lw_seen_lineup")]).toEqual(["squad", "lineup"]);
    expect([...among("lw_seen_lineup")]).toEqual(["lineup"]);
  });

  it("is empty without a cookie", () => {
    expect(among().size).toBe(0);
  });

  it("ignores any other cookie", () => {
    expect([...among("lw_seen_squad", "lw_seen_tomorrow", "lw_lang")]).toEqual(["squad"]);
  });
});

describe("showsFirstActions", () => {
  it("shows the list until the club has played", () => {
    expect(showsFirstActions({ matches: 0, seen: new Set() })).toBe(true);
    expect(showsFirstActions({ matches: 0, seen: new Set(["squad", "lineup"]) })).toBe(true);
    expect(showsFirstActions({ matches: 1, seen: new Set() })).toBe(false);
  });
});
