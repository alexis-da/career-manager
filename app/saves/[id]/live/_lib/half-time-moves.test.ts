import { describe, expect, it } from "vitest";
import { MAX_SUBSTITUTIONS } from "@/src/engine/balance";
import { formationPositions } from "@/src/engine/formations";
import type { LineupCandidate } from "@/src/engine/lineup";
import type { Position } from "@/src/engine/positions";
import { testTranslator } from "@/src/i18n/test-intl";
import {
  cancelSubstitution,
  halfTimeChoice,
  substitute,
  suggestChange,
  swapSlots,
  switchFormation,
  type HalfTimeRules,
  type HalfTimeState,
  type Move,
} from "./half-time-moves";

// Refusals in French, the game's own language, and in English where a test says so.
const t = testTranslator("fr", "halfTime");
const tEnglish = testTranslator("en", "halfTime");

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
    const state = applied(substitute(initial, rules(), 9, "b-st", t));

    expect(state.starters[9]).toBe("b-st");
    expect(state.bench).not.toContain("b-st");
    expect(state.bench).not.toContain("s9");
    expect(state.off).toEqual(["s9"]);
    expect(state.substitutions).toEqual([{ in: "b-st", out: "s9" }]);
    // He cannot come back: he is not a substitute any more.
    expect(substitute(state, rules(), 8, "s9", t)).toEqual({
      ok: false,
      message: "Fais entrer un remplaçant à la place d'un joueur sur le terrain.",
    });
  });

  it("counts a substitute replaced at the same break once, and sends him back to the bench", () => {
    const first = applied(substitute(initial, rules(), 9, "b-st", t));
    const second = applied(substitute(first, rules(), 9, "b-lw", t));

    expect(second.substitutions).toEqual([{ in: "b-lw", out: "s9" }]);
    expect(second.bench[0]).toBe("b-st");
    expect(second.off).toEqual(["s9"]);
  });

  it("stops at five substitutions in the match", () => {
    let state = initial;
    ["b-rb", "b-cb", "b-cm", "b-st", "b-lw"].forEach((incoming, index) => {
      state = applied(substitute(state, rules(), index + 1, incoming, t));
    });

    expect(state.substitutions).toHaveLength(MAX_SUBSTITUTIONS);
    expect(substitute(state, rules(), 8, "b-rw", t)).toEqual({ ok: false, message: "Plus de remplacement possible : 5 sur 5." });
    expect(substitute(state, rules(), 8, "b-rw", tEnglish)).toEqual({ ok: false, message: "No substitutions left: 5 of 5." });
    expect(substitute(initial, rules({ substitutionsBefore: MAX_SUBSTITUTIONS }), 8, "b-rw", t).ok).toBe(false);
  });

  it("moves players between slots for free, never into a sent-off player's slot", () => {
    const state = applied(swapSlots(initial, rules(), 6, 7, t));

    expect(state.starters.slice(6, 8)).toEqual(["s7", "s6"]);
    expect(state.substitutions).toEqual([]);
    const tenMen = { ...initial, starters: initial.starters.map((key, slot) => (slot === 7 ? null : key)) };
    expect(swapSlots(tenMen, rules({ sentOffSlots: new Set([7]) }), 6, 7, t)).toEqual({
      ok: false,
      message: "Le poste d'un joueur exclu reste vide : ton équipe joue à dix.",
    });
    expect(substitute(tenMen, rules({ sentOffSlots: new Set([7]) }), 7, "b-cm", tEnglish)).toEqual({
      ok: false,
      message: "A sent-off player's position stays empty: your team plays with ten men.",
    });
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

describe("cancelling a half-time change", () => {
  const change = { in: "b-st", out: "s9" };

  it("gives the player going off his place back and sends the one coming on to the bench", () => {
    const state = cancelSubstitution(applied(substitute(initial, rules(), 9, "b-st", t)), change);

    expect(state.starters).toEqual(initial.starters);
    expect(state.bench.toSorted()).toEqual(initial.bench.toSorted());
    expect(state.off).toEqual([]);
    expect(state.substitutions).toEqual([]);
    // The substitution counts no more: the same player can come on again.
    expect(applied(substitute(state, rules(), 9, "b-st", t)).substitutions).toEqual([change]);
  });

  it("finds the player who came on wherever a move or a formation has put him", () => {
    const moved = applied(swapSlots(applied(substitute(initial, rules(), 9, "b-st", t)), rules(), 9, 8, t));
    expect(cancelSubstitution(moved, change).starters.slice(8, 10)).toEqual(["s9", "s8"]);

    const switched = switchFormation(moved, rules(), "4-4-2", PLAYERS);
    const state = cancelSubstitution(switched, change);
    expect(state.formation).toBe("4-4-2");
    expect(state.starters).toContain("s9");
    expect(state.starters).not.toContain("b-st");
  });

  it("cancels the substitute who replaced another at the same break", () => {
    const first = applied(substitute(initial, rules(), 9, "b-st", t));
    const second = applied(substitute(first, rules(), 9, "b-lw", t));
    const state = cancelSubstitution(second, { in: "b-lw", out: "s9" });

    expect(state.starters).toEqual(initial.starters);
    expect(state.bench.toSorted()).toEqual(initial.bench.toSorted());
    expect(state.off).toEqual([]);
  });

  it("leaves the other changes alone, and ignores a change that was not made", () => {
    const both = applied(substitute(applied(substitute(initial, rules(), 9, "b-st", t)), rules(), 1, "b-rb", t));

    expect(cancelSubstitution(both, change).substitutions).toEqual([{ in: "b-rb", out: "s1" }]);
    expect(cancelSubstitution(both, change).off).toEqual(["s1"]);
    expect(cancelSubstitution(both, { in: "b-lw", out: "s9" })).toBe(both);
  });
});

describe("the change the assistant suggests", () => {
  // The squad at a neutral condition: no substitute beats his starter until a test says so.
  const rated = (changes: Record<string, { overall?: number; condition?: number }> = {}) =>
    PLAYERS.map((candidate) => ({ ...candidate, condition: 1, ...changes[candidate.id] }));

  it("suggests nothing while nobody on the bench does better", () => {
    expect(suggestChange(initial, rules(), rated())).toBeNull();
  });

  it("takes off the player with the largest gain, for the best substitute in his slot", () => {
    const players = rated({ s1: { overall: 60 }, s9: { overall: 50 } });

    expect(suggestChange(initial, rules(), players)).toEqual({ slot: 9, position: "ST", out: "s9", in: "b-st", injured: false, gain: 17 });
  });

  it("weighs a player's rating by his condition, as the engine plays him", () => {
    // Rated above the substitute, but 70 × 0.9 = 63 against his 66.
    const change = suggestChange(initial, rules(), rated({ s1: { condition: 0.9 } }));
    expect(change).toMatchObject({ slot: 1, out: "s1", in: "b-rb" });
    expect(change?.gain).toBeCloseTo(3);

    // On the bench too: the striker rated 67 is worth 33.5 at this condition, less than the 60 he would replace.
    expect(suggestChange(initial, rules(), rated({ s9: { overall: 60 }, "b-st": { condition: 0.5 } }))).toBeNull();
  });

  it("needs a gain of one point at least", () => {
    expect(suggestChange(initial, rules(), rated({ s1: { overall: 65.5 } }))).toBeNull();
    expect(suggestChange(initial, rules(), rated({ s1: { overall: 65 } }))).toMatchObject({ out: "s1", gain: 1 });
  });

  it("replaces an injured player first, whatever the gain", () => {
    const players = rated({ s9: { overall: 50 } });

    expect(suggestChange(initial, rules({ injured: new Set(["s1"]) }), players)).toEqual({
      slot: 1,
      position: "RB",
      out: "s1",
      in: "b-rb",
      injured: true,
      gain: -4,
    });
  });

  it("between two injured players, takes the larger gain", () => {
    const injured = rules({ injured: new Set(["s1", "s9"]) });

    expect(suggestChange(initial, injured, rated({ s9: { overall: 60 } }))).toMatchObject({ out: "s9", injured: true });
  });

  it("leaves a sent-off player's slot and a player who came on at this break alone", () => {
    const players = rated({ s9: { overall: 50 }, s10: { overall: 55 } });

    expect(suggestChange(initial, rules({ sentOffSlots: new Set([9]) }), players)).toMatchObject({ out: "s10" });

    // The manager brought on a weak substitute for s9: the assistant does not take it back.
    const weak = applied(substitute(initial, rules(), 9, "b-cb", t));
    expect(suggestChange(weak, rules(), players)).toMatchObject({ out: "s10" });
    expect(suggestChange(weak, rules(), rated())).toBeNull();
  });

  it("suggests nothing without a substitution or a substitute left, even for an injured player", () => {
    const injured = { injured: new Set(["s1"]) };

    expect(suggestChange(initial, rules({ ...injured, substitutionsBefore: MAX_SUBSTITUTIONS }), rated())).toBeNull();
    expect(suggestChange({ ...initial, bench: [] }, rules(injured), rated())).toBeNull();
  });

  it("follows the formation: the slot's position is the one being played", () => {
    const state = switchFormation(initial, rules(), "4-4-2", PLAYERS);
    const slot = state.starters.indexOf("s9");
    const change = suggestChange(state, rules(), rated({ s9: { overall: 50 } }));

    expect(change).toMatchObject({ slot, position: formationPositions("4-4-2")[slot], out: "s9" });
  });

  it("settles ties by key, whatever the order of the players and of the bench", () => {
    // s1 and s2 both gain 6, each with the substitute of his position.
    const players = rated({ s1: { overall: 60 }, s2: { overall: 60 }, "b-cb": { overall: 66 } });
    const change = suggestChange(initial, rules(), players);

    expect(change).toMatchObject({ out: "s1", in: "b-rb" });
    expect(suggestChange({ ...initial, bench: initial.bench.toReversed() }, rules(), players.toReversed())).toEqual(change);

    // Two substitutes of the same level.
    const twins = [...rated({ s1: { overall: 60 } }), { ...player("a-rb", "RB", 66), condition: 1 }];
    const withTwin = { ...initial, bench: [...initial.bench, "a-rb"] };
    expect(suggestChange(withTwin, rules(), twins)).toMatchObject({ out: "s1", in: "a-rb" });
    expect(suggestChange({ ...withTwin, bench: withTwin.bench.toReversed() }, rules(), twins.toReversed())).toMatchObject({ in: "a-rb" });
  });

  it("gives a change the bench can make, then the next one once it is made", () => {
    const players = rated({ s1: { overall: 60 }, s9: { overall: 50 } });
    const first = suggestChange(initial, rules(), players);
    if (first === null) {
      throw new Error("No change suggested");
    }
    const state = applied(substitute(initial, rules(), first.slot, first.in, t));

    expect(state.substitutions).toEqual([{ in: "b-st", out: "s9" }]);
    expect(suggestChange(state, rules(), players)).toMatchObject({ out: "s1", in: "b-rb" });
    const last = applied(substitute(state, rules(), 1, "b-rb", t));
    expect(suggestChange(last, rules(), players)).toBeNull();
  });
});
