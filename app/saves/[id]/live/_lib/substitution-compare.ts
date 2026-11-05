import type { HalfTimePlayer, MatchActions } from "@/src/db/live-match";
import { formationPositions } from "@/src/engine/formations";
import type { AttributeName } from "@/src/engine/generation";
import { ratingAt, type Position } from "@/src/engine/positions";
import { keyAttributesAt } from "@/src/engine/strength";
import { getOrThrow } from "@/src/lib/maps";
import { positionFit, slotRating, type PositionFit } from "../../_lib/positions";
import { bestChange, type HalfTimeRules, type HalfTimeState } from "./half-time-moves";

// The Coaching panel compares the two players of a substitution side by side: the one going off, as the match leaves him,
// and the one coming on, in the slot he would take.

/** A substitution to compare: the slot, its position in the formation, the player going off and the one coming on. */
export type ComparedChange = { slot: number; position: Position; out: string; in: string };

/** A slot whose player may go off at this pause. */
export type OutgoingSlot = { slot: number; position: Position; key: string };

/**
 * The players who may go off at this pause, slot by slot: those on the pitch, an injured one still in his slot included,
 * but for a sent-off player's slot, empty, and a player who came on at this pause, whose change is undone, not redone.
 */
export function outgoingSlots(state: HalfTimeState, rules: HalfTimeRules): OutgoingSlot[] {
  const positions = formationPositions(state.formation);
  const cameOn = new Set(state.substitutions.map((substitution) => substitution.in));
  return state.starters.flatMap((key, slot) =>
    key === null || rules.sentOffSlots.has(slot) || cameOn.has(key) ? [] : [{ slot, position: positions[slot], key }],
  );
}

/**
 * The substitutes for a position, the best first as the engine would play him there: his rating in it times his condition
 * (form and fitness), as the assistant weighs them; ties to the smaller key.
 */
export function incomingFor(state: HalfTimeState, players: ReadonlyMap<string, HalfTimePlayer>, position: Position): string[] {
  const level = (key: string): number => {
    const player = getOrThrow(players, key, "player");
    return ratingAt(player, position) * player.condition;
  };
  return [...state.bench].sort((a, b) => level(b) - level(a) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The substitution the panel compares: the one the player picked, while both can still make it (the player going off kept
 * with the best substitute for him when the one picked has come on meanwhile); else the change the assistant would make,
 * his suggestion, or, when none is worth a point, the best one there is. Null when none can be made here: no substitute,
 * none left, or no window.
 */
export function comparedChange(
  state: HalfTimeState,
  rules: HalfTimeRules,
  players: ReadonlyMap<string, HalfTimePlayer>,
  picked: { out: string; in: string } | null,
): ComparedChange | null {
  const best = bestChange(state, rules, [...players.values()]);
  if (best === null) {
    return null;
  }
  const outgoing = picked === null ? undefined : outgoingSlots(state, rules).find((candidate) => candidate.key === picked.out);
  if (picked === null || outgoing === undefined) {
    return { slot: best.slot, position: best.position, out: best.out, in: best.in };
  }
  const incoming = state.bench.includes(picked.in) ? picked.in : incomingFor(state, players, outgoing.position)[0];
  return { slot: outgoing.slot, position: outgoing.position, out: outgoing.key, in: incoming };
}

/** One of the two players compared, in the slot of the change. */
export type ComparedPlayer = {
  key: string;
  rating: number; // in the slot's position, whole, as every screen shows it
  fit: PositionFit;
  fitness: number; // at the restart
  form: number;
  actions: MatchActions | null; // his goals, assists and cards in the match; null for a substitute, who has not played
  attributes: number[]; // those that count most in the slot (keyAttributesAt), in their order
};

export type Comparison = { position: Position; attributes: AttributeName[]; out: ComparedPlayer; in: ComparedPlayer };

/** The two players of a change side by side, judged in its slot: the engine's own weights say which attributes count there. */
export function comparison(change: ComparedChange, players: ReadonlyMap<string, HalfTimePlayer>): Comparison {
  const attributes = keyAttributesAt(change.position);
  const side = (key: string, played: boolean): ComparedPlayer => {
    const player = getOrThrow(players, key, "player");
    return {
      key,
      rating: slotRating(player, change.position),
      fit: positionFit(player, change.position),
      fitness: player.fitness,
      form: player.form,
      actions: played ? player.actions : null,
      attributes: attributes.map((name) => player.attributes[name]),
    };
  };
  return { position: change.position, attributes, out: side(change.out, true), in: side(change.in, false) };
}

/** Which of the two has more of something, if one has: the screen marks his figure. */
export function better(out: number, incoming: number): "out" | "in" | null {
  if (out === incoming) {
    return null;
  }
  return out > incoming ? "out" : "in";
}

/** What a player has done in the match, in the order the screen says it, the actions he has none of left out. */
export function actionsDone(actions: MatchActions): { action: keyof MatchActions; count: number }[] {
  const order: (keyof MatchActions)[] = ["goals", "assists", "yellowCards", "redCards"];
  return order.flatMap((action) => (actions[action] > 0 ? [{ action, count: actions[action] }] : []));
}
