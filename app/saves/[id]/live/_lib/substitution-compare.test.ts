import { describe, expect, it } from "vitest";
import type { HalfTimePlayer } from "@/src/db/live-match";
import { pauseRules, pauseState, suggestChange } from "./half-time-moves";
import { actionsDone, better, comparedChange, comparison, incomingFor, outgoingSlots } from "./substitution-compare";
import { halfTimePlayer, halfTimeTeam, STARTERS } from "./test-team";

// A 4-3-3 of midfielders at 80 of fitness; on the bench a fresh midfielder (b-fresh), a weaker one (b-weak) and a
// striker (b-striker). The striker's slot is the 10th (ST).
const BENCH = ["b-weak", "b-fresh", "b-striker"];

const STRIKER_SLOT = 9;

function team(overrides: Parameters<typeof halfTimeTeam>[0] = {}) {
  const base = halfTimeTeam({ bench: BENCH, ...overrides });
  const players: HalfTimePlayer[] = base.players.map((player) => {
    switch (player.id) {
      case "b-fresh":
        return halfTimePlayer(player.id, { fitness: 100, fitnessFactor: 1, condition: 1 });
      case "b-weak":
        return halfTimePlayer(player.id, { overall: 60, fitness: 100, fitnessFactor: 1, condition: 1 });
      case "b-striker":
        return halfTimePlayer(player.id, {
          position: "ST",
          overall: 74,
          fitness: 100,
          fitnessFactor: 1,
          condition: 1,
          attributes: { pace: 80, shooting: 82, passing: 55, dribbling: 76, defending: 30, physical: 70, goalkeeping: 10 },
        });
      case "s9":
        // The tired starter in the striker's slot, with a goal, an assist and a yellow card.
        return halfTimePlayer(player.id, {
          fitness: 62,
          fitnessFactor: 0.8,
          condition: 0.8,
          actions: { goals: 1, assists: 1, yellowCards: 1, redCards: 0 },
        });
      default:
        return player;
    }
  });
  return { ...base, players };
}

const byKey = (players: readonly HalfTimePlayer[]) => new Map(players.map((player) => [player.id, player]));

describe("the substitutions the Coaching panel compares", () => {
  it("offers every player on the pitch, but a sent-off player's slot and one who came on at this pause", () => {
    const club = team({ sentOff: [{ slot: 3, playerKey: "s3" }], starters: STARTERS.map((key, slot) => (slot === 3 ? null : key)) });
    const state = { ...pauseState(club), starters: club.starters.map((key) => (key === "s5" ? "b-fresh" : key)), substitutions: [{ in: "b-fresh", out: "s5" }] };
    const slots = outgoingSlots(state, pauseRules(club));
    expect(slots.map((slot) => slot.key)).toEqual(["s0", "s1", "s2", "s4", "s6", "s7", "s8", "s9", "s10"]);
    expect(slots.find((slot) => slot.key === "s9")).toEqual({ slot: STRIKER_SLOT, position: "ST", key: "s9" });
  });

  it("puts the substitutes in the order the engine would play them in the position: rating there times condition", () => {
    const club = team();
    const players = byKey(club.players);
    // Up front, the striker; then the fresh midfielder (70 × 0.8) before the weak one (60 × 0.8).
    expect(incomingFor(pauseState(club), players, "ST")).toEqual(["b-striker", "b-fresh", "b-weak"]);
    // In midfield, the weak midfielder (60) before the striker out of his line (74 × 0.8 = 59.2).
    expect(incomingFor(pauseState(club), players, "CM")).toEqual(["b-fresh", "b-weak", "b-striker"]);
  });

  it("opens on the assistant's suggestion, then follows the player's pick, the best substitute for a player picked to go off", () => {
    const club = team();
    const state = pauseState(club);
    const rules = pauseRules(club);
    const players = byKey(club.players);
    const suggestion = suggestChange(state, rules, club.players);
    expect(suggestion).toMatchObject({ out: "s9", in: "b-striker", slot: STRIKER_SLOT });
    expect(comparedChange(state, rules, players, null)).toEqual({ slot: STRIKER_SLOT, position: "ST", out: "s9", in: "b-striker" });

    expect(comparedChange(state, rules, players, { out: "s9", in: "b-weak" })).toEqual({ slot: STRIKER_SLOT, position: "ST", out: "s9", in: "b-weak" });
    // The one picked to come on has come on meanwhile: the best one left for the slot.
    const after = { ...state, bench: ["b-weak", "b-fresh"] };
    expect(comparedChange(after, rules, players, { out: "s0", in: "b-striker" })).toMatchObject({ out: "s0", in: "b-fresh" });
    // The one picked to go off is no longer on the pitch: the assistant's change again.
    expect(comparedChange(state, rules, players, { out: "nobody", in: "b-weak" })).toMatchObject({ out: "s9", in: "b-striker" });
  });

  it("opens on the young player the assistant brings on, his suggestion before the best change", () => {
    // « Lancer les jeunes »: the weaker midfielder for the right midfielder, while the striker would do better up front.
    const club = team({ youthEntries: [{ in: "b-weak", out: "s6" }] });
    const state = pauseState(club);
    const rules = pauseRules(club);
    expect(suggestChange(state, rules, club.players)).toMatchObject({ slot: 6, out: "s6", in: "b-weak", reason: "youth" });
    expect(comparedChange(state, rules, byKey(club.players), null)).toEqual({ slot: 6, position: "CM", out: "s6", in: "b-weak" });
  });

  it("still compares the best change when none is worth a point, and nothing when none can be made", () => {
    // A weaker midfielder alone on the bench: nowhere a point better than the tired eleven.
    const weak = halfTimeTeam({ bench: ["b-weak"] });
    const even = { ...weak, players: weak.players.map((player) => (player.id === "b-weak" ? { ...player, overall: 60, fitnessFactor: 1, condition: 1 } : player)) };
    const players = byKey(even.players);
    expect(suggestChange(pauseState(even), pauseRules(even), even.players)).toBeNull();
    expect(comparedChange(pauseState(even), pauseRules(even), players, null)).toMatchObject({ in: "b-weak" });

    const club = team();
    const clubPlayers = byKey(club.players);
    expect(comparedChange(pauseState(club), { ...pauseRules(club), canSubstitute: false }, clubPlayers, null)).toBeNull();
    expect(comparedChange(pauseState(club), { ...pauseRules(club), substitutionsBefore: 5 }, clubPlayers, null)).toBeNull();
    expect(comparedChange({ ...pauseState(club), bench: [] }, pauseRules(club), clubPlayers, null)).toBeNull();
  });

  it("sets the two side by side in the slot: rating and fit, fitness, form, the match for the one who played, the attributes that count there", () => {
    const club = team();
    const compared = comparison({ slot: STRIKER_SLOT, position: "ST", out: "s9", in: "b-striker" }, byKey(club.players));
    // A striker's line: his shooting first, then his pace and his dribbling, as the engine weighs them.
    expect(compared.attributes).toEqual(["shooting", "pace", "dribbling"]);
    expect(compared.out).toEqual({
      key: "s9",
      rating: 56, // a midfielder up front, a line away: 70 × 0.8
      fit: "other-line",
      fitness: 62,
      form: 50,
      actions: { goals: 1, assists: 1, yellowCards: 1, redCards: 0 },
      attributes: [70, 70, 70],
    });
    expect(compared.in).toEqual({ key: "b-striker", rating: 74, fit: "exact", fitness: 100, form: 50, actions: null, attributes: [82, 80, 76] });
  });

  it("says whose figure is the better, and what a player has done, the actions he has none of left out", () => {
    expect(better(62, 100)).toBe("in");
    expect(better(70, 49)).toBe("out");
    expect(better(50, 50)).toBeNull();
    expect(actionsDone({ goals: 2, assists: 0, yellowCards: 1, redCards: 0 })).toEqual([
      { action: "goals", count: 2 },
      { action: "yellowCards", count: 1 },
    ]);
    expect(actionsDone({ goals: 0, assists: 0, yellowCards: 0, redCards: 0 })).toEqual([]);
  });
});
