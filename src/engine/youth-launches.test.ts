import { describe, expect, it } from "vitest";
import { YOUTH_ENTRY_MAX_TARGETS, YOUTH_POLICY_MAX_AGE } from "./balance";
import type { Position } from "./positions";
import { canBeLaunched, keptYouthLaunches, type LaunchCandidate } from "./youth-launches";

const young = (position: Position = "CM", seasonAge = 19): LaunchCandidate => ({ position, seasonAge });

describe("the young players marked « Le lancer »", () => {
  it("can be any outfield player of the club up to 21 on 1 July, never a goalkeeper", () => {
    expect(canBeLaunched(young("ST", YOUTH_POLICY_MAX_AGE))).toBe(true);
    expect(canBeLaunched(young("ST", YOUTH_POLICY_MAX_AGE + 1))).toBe(false);
    expect(canBeLaunched(young("GK", 18))).toBe(false);
  });

  it("keep the marks that still hold, once each, in the manager's order, three at most", () => {
    const squad = new Map<string, LaunchCandidate>([
      ["a", young()],
      ["b", young("CB", 20)],
      ["c", young("LW", 17)],
      ["d", young("RB", 21)],
    ]);
    expect(keptYouthLaunches(["c", "a", "c", "b"], squad)).toEqual(["c", "a", "b"]);
    expect(keptYouthLaunches(["d", "c", "b", "a"], squad)).toEqual(["d", "c", "b"]);
    expect(YOUTH_ENTRY_MAX_TARGETS).toBe(3);
  });

  it("drop a player gone from the club, past the age or a goalkeeper, and keep an injured or suspended one", () => {
    const squad = new Map<string, LaunchCandidate>([
      ["stays", young()],
      ["older", young("CM", 22)],
      ["keeper", young("GK", 18)],
    ]);
    // « sold » and « free » are no longer in the squad; nothing of injuries here: they do not touch the marks.
    expect(keptYouthLaunches(["sold", "older", "stays", "keeper", "free"], squad)).toEqual(["stays"]);
    expect(keptYouthLaunches([], squad)).toEqual([]);
  });
});
