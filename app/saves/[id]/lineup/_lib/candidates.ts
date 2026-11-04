import type { LineupPlayer } from "@/src/db/lineup";
import { isAvailable } from "@/src/engine/lineup";
import { ratingAt, type Position } from "@/src/engine/positions";
import { positionFit, type PositionFit } from "../../_lib/positions";
import type { EditorState } from "./editor-moves";

/** Where a player of the squad stands in the lineup being edited: in a slot, on the bench (from 1), or neither. */
export type PlayerPlace = { kind: "starter"; slot: number } | { kind: "substitute"; number: number } | { kind: "reserve" };

export function placeOf(key: string, { starters, bench }: Pick<EditorState, "starters" | "bench">): PlayerPlace {
  const slot = starters.indexOf(key);
  if (slot !== -1) {
    return { kind: "starter", slot };
  }
  const index = bench.indexOf(key);
  return index === -1 ? { kind: "reserve" } : { kind: "substitute", number: index + 1 };
}

/** A player who could take a slot: his rating there, how he fits it, whether he can play, and where he is now. */
export type SlotCandidate<P extends LineupPlayer = LineupPlayer> = {
  player: P;
  rating: number; // at the slot, not rounded: the order is the engine's
  fit: PositionFit;
  available: boolean; // neither injured nor suspended
  place: PlayerPlace;
};

/**
 * The players who could take a slot, everyone but its own: those who can play first, then the injured and the suspended,
 * each group best rated at the slot first; ties by name, then key, whatever the order of the squad.
 */
export function slotCandidates<P extends LineupPlayer>(
  players: readonly P[],
  state: Pick<EditorState, "starters" | "bench">,
  slot: number,
  position: Position,
): SlotCandidate<P>[] {
  const occupant = state.starters[slot] ?? null;
  return players
    .filter((player) => player.id !== occupant)
    .map((player) => ({
      player,
      rating: ratingAt(player, position),
      fit: positionFit(player, position),
      available: isAvailable(player),
      place: placeOf(player.id, state),
    }))
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        b.rating - a.rating ||
        a.player.lastName.localeCompare(b.player.lastName, "fr") ||
        (a.player.id < b.player.id ? -1 : a.player.id > b.player.id ? 1 : 0),
    );
}
