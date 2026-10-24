import { describe, expect, it } from "vitest";
import { MAX_SUBSTITUTIONS } from "@/src/engine/balance";
import { formationPositions } from "@/src/engine/formations";
import type { LineupCandidate } from "@/src/engine/lineup";
import type { Position } from "@/src/engine/positions";
import { halfTimeChoice, substitute, swapSlots, switchFormation, type HalfTimeRules, type HalfTimeState, type Move } from "./half-time-moves";

// A 4-3-3 eleven, s0 to s10 in slot order, each at the slot's position, and seven substitutes.
const SLOTS = formationPositions("4-3-3");
const player = (id: string, position: Position, overall = 70, injured = false): LineupCandidate => ({ id, position, overall, injured });
const STARTERS = SLOTS.map((position, slot) => player(`s${slot}`, position));
const BENCH = [player("b-gk", "GK", 65), player("b-rb", "RB", 66), player("b-cb", "CB", 60), player("b-cm", "CM", 68), player("b-st", "ST", 67), player("b-lw", "LW", 64), player("b-rw", "RW", 63)];
const PLAYERS = [...STARTERS, ...BENCH];

const initial: HalfTimeState = {
  formation: "4-3-3",
  starters: STARTERS.map((starter) => starter.id),
  bench: BENCH.map((substitute) => substitute.id),
  off: [],
  substitutions: [],
};
const rules = (overrides: Partial<HalfTimeRules> = {}): HalfTimeRules => ({
  injured: new Set(),
  sentOffSlots: new Set(),
  substitutionsBefore: 0,
  maxSubstitutions: MAX_SUBSTITUTIONS,
  ...overrides,
});

const applied = (move: Move): HalfTimeState => {
  if (!move.ok) {
    throw new Error(move.message);
  }
  return move.state;
};

describe("half-time changes", () => {
  it("takes the slot's player off for good when a substitute comes on", () => {
    const state = applied(substitute(initial, rules(), 9, "b-st"));

    expect(state.starters[9]).toBe("b-st");
    expect(state.bench).not.toContain("b-st");
    expect(state.bench).not.toContain("s9");
    expect(state.off).toEqual(["s9"]);
    expect(state.substitutions).toEqual([{ in: "b-st", out: "s9" }]);
    // He cannot come back: he is not a substitute any more.
    expect(substitute(state, rules(), 8, "s9").ok).toBe(false);
  });

  it("counts a substitute replaced at the same break once, and sends him back to the bench", () => {
    const first = applied(substitute(initial, rules(), 9, "b-st"));
    const second = applied(substitute(first, rules(), 9, "b-lw"));

    expect(second.substitutions).toEqual([{ in: "b-lw", out: "s9" }]);
    expect(second.bench[0]).toBe("b-st");
    expect(second.off).toEqual(["s9"]);
  });

  it("stops at five substitutions in the match", () => {
    let state = initial;
    ["b-rb", "b-cb", "b-cm", "b-st", "b-lw"].forEach((incoming, index) => {
      state = applied(substitute(state, rules(), index + 1, incoming));
    });

    expect(state.substitutions).toHaveLength(MAX_SUBSTITUTIONS);
    expect(substitute(state, rules(), 8, "b-rw")).toEqual({ ok: false, message: "Plus de remplacement possible : 5 sur 5." });
    expect(substitute(initial, rules({ substitutionsBefore: MAX_SUBSTITUTIONS }), 8, "b-rw").ok).toBe(false);
  });

  it("moves players between slots for free, never into a sent-off player's slot", () => {
    const state = applied(swapSlots(initial, rules(), 6, 7));

    expect(state.starters.slice(6, 8)).toEqual(["s7", "s6"]);
    expect(state.substitutions).toEqual([]);
    const tenMen = { ...initial, starters: initial.starters.map((key, slot) => (slot === 7 ? null : key)) };
    expect(swapSlots(tenMen, rules({ sentOffSlots: new Set([7]) }), 6, 7).ok).toBe(false);
    expect(substitute(tenMen, rules({ sentOffSlots: new Set([7]) }), 7, "b-cm").ok).toBe(false);
  });

  it("switches to 4-4-2 among the players on the pitch, the sent-off player's slot left empty", () => {
    const tenMen = { ...initial, starters: initial.starters.map((key, slot) => (slot === 9 ? null : key)) };
    const state = switchFormation(tenMen, rules({ sentOffSlots: new Set([9]) }), "4-4-2", PLAYERS);

    expect(state.formation).toBe("4-4-2");
    expect(state.starters[9]).toBeNull();
    expect(state.starters.filter((key) => key !== null).sort()).toEqual(tenMen.starters.filter((key) => key !== null).sort());
    expect(state.bench).toEqual(initial.bench);
  });

  it("replaces an injured player left in his slot with the substitute rated best there", () => {
    const injured = rules({ injured: new Set(["s1"]) });
    const choice = halfTimeChoice(initial, injured, PLAYERS);

    expect(choice.substitutions).toEqual([{ in: "b-rb", out: "s1" }]);
    expect(choice.lineup).toContainEqual({ slot: 1, playerKey: "b-rb" });
    expect(choice.lineup).toHaveLength(11);

    // Without a substitution left, his slot stays empty.
    const exhausted = halfTimeChoice(initial, rules({ injured: new Set(["s1"]), substitutionsBefore: MAX_SUBSTITUTIONS }), PLAYERS);
    expect(exhausted.lineup.map((starter) => starter.slot)).not.toContain(1);
    expect(exhausted.substitutions).toEqual([]);
  });

  it("sends the eleven by slot, the sent-off player's slot out", () => {
    const tenMen = { ...initial, starters: initial.starters.map((key, slot) => (slot === 7 ? null : key)) };
    const choice = halfTimeChoice(tenMen, rules({ sentOffSlots: new Set([7]) }), PLAYERS);

    expect(choice.lineup).toHaveLength(10);
    expect(choice.lineup.map((starter) => starter.slot)).not.toContain(7);
    expect(choice.formation).toBe("4-3-3");
  });
});
