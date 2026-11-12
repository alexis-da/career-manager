import { describe, expect, it } from "vitest";
import { FIRST_STEPS_MATCHES, seenItems, showsFirstActions, showsTip, type FirstSteps } from "./first-steps";

describe("seenItems", () => {
  const among = (...names: string[]) => seenItems((name) => names.includes(name));

  it("reads each item from its own cookie", () => {
    expect([...among("lw_seen_squad", "lw_seen_lineup")]).toEqual(["squad", "lineup"]);
    expect([...among("lw_seen_rating", "lw_seen_simulation")]).toEqual(["rating", "simulation"]);
    expect([...among("lw_seen_lineup")]).toEqual(["lineup"]);
  });

  it("is empty without a cookie", () => {
    expect(among().size).toBe(0);
  });

  it("ignores any other cookie", () => {
    expect([...among("lw_seen_squad", "lw_seen_tomorrow", "lw_lang")]).toEqual(["squad"]);
  });
});

describe("showsTip", () => {
  const nothingSeen = new Set<never>();

  it("shows a screen's tip until it is closed", () => {
    expect(showsTip("rating", { matches: 0, seen: nothingSeen })).toBe(true);
    expect(showsTip("rating", { matches: 0, seen: new Set(["rating"]) })).toBe(false);
    expect(showsTip("secondary", { matches: 2, seen: new Set(["rating"]) })).toBe(true);
  });

  it("gives the dashboard no tip before the first match, its first actions' time", () => {
    expect(showsTip("money", { matches: 0, seen: nothingSeen })).toBe(false);
    expect(showsTip("simulation", { matches: 0, seen: nothingSeen })).toBe(false);
  });

  it("gives the dashboard the money at the first match, then the simulation from the second", () => {
    expect(showsTip("money", { matches: 1, seen: nothingSeen })).toBe(true);
    expect(showsTip("simulation", { matches: 1, seen: nothingSeen })).toBe(false);
    for (const matches of [2, 3, 4]) {
      expect(showsTip("money", { matches, seen: nothingSeen })).toBe(false);
      expect(showsTip("simulation", { matches, seen: nothingSeen })).toBe(true);
    }
  });

  it("brings the simulation at the first match once the money's tip is closed", () => {
    expect(showsTip("money", { matches: 1, seen: new Set(["money"]) })).toBe(false);
    expect(showsTip("simulation", { matches: 1, seen: new Set(["money"]) })).toBe(true);
    expect(showsTip("simulation", { matches: 1, seen: new Set(["money", "simulation"]) })).toBe(false);
  });

  it("never gives the dashboard two tips at once", () => {
    const seenSets = [[], ["money"], ["simulation"], ["money", "simulation"]] as const;
    for (let matches = 0; matches <= FIRST_STEPS_MATCHES + 1; matches += 1) {
      for (const seen of seenSets) {
        const steps: FirstSteps = { matches, seen: new Set(seen) };
        expect(showsTip("money", steps) && showsTip("simulation", steps), `${matches} matches, ${seen.join()} seen`).toBe(false);
      }
    }
  });

  it("stops every tip by itself at the club's fifth match, closed or not", () => {
    for (const tip of ["rating", "secondary", "simulation"] as const) {
      expect(showsTip(tip, { matches: FIRST_STEPS_MATCHES - 1, seen: nothingSeen })).toBe(true);
      expect(showsTip(tip, { matches: FIRST_STEPS_MATCHES, seen: nothingSeen })).toBe(false);
    }
  });
});

describe("showsFirstActions", () => {
  it("shows the list until the club has played", () => {
    expect(showsFirstActions({ matches: 0, seen: new Set() })).toBe(true);
    expect(showsFirstActions({ matches: 0, seen: new Set(["squad", "lineup"]) })).toBe(true);
    expect(showsFirstActions({ matches: 1, seen: new Set() })).toBe(false);
  });
});
