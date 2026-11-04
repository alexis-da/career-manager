import { formationPositions, type FormationName } from "@/src/engine/formations";
import { BENCH_SIZE, selectRestedLineup, type LineupCandidate } from "@/src/engine/lineup";

/** The lineup being edited: a player key per slot (null when empty) and the substitutes in order. */
export type EditorState = {
  formation: FormationName;
  starters: (string | null)[];
  bench: string[]; // at most BENCH_SIZE
};

/** The bench with `key` inserted at `index` (at the end when undefined), without duplicates, cut to its size. */
export function benchWith(bench: readonly string[], key: string, index?: number): string[] {
  const others = bench.filter((candidate) => candidate !== key);
  const at = index === undefined ? others.length : Math.min(index, others.length);
  return [...others.slice(0, at), key, ...others.slice(at)].slice(0, BENCH_SIZE);
}

/** A player from outside the eleven enters a slot; its occupant takes his place on the bench, or the first one. */
export function placeInSlot(state: EditorState, slot: number, key: string): EditorState {
  if (state.starters.includes(key)) {
    const from = state.starters.indexOf(key);
    return swapSlots(state, from, slot);
  }
  const starters = [...state.starters];
  const outgoing = starters[slot];
  starters[slot] = key;
  const benchIndex = state.bench.indexOf(key);
  let bench = state.bench.filter((candidate) => candidate !== key);
  if (outgoing !== null) {
    bench = benchWith(bench, outgoing, benchIndex === -1 ? 0 : benchIndex);
  }
  return { ...state, starters, bench };
}

/** Two slots exchange their players (either may be empty). */
export function swapSlots(state: EditorState, a: number, b: number): EditorState {
  if (a === b) {
    return state;
  }
  const starters = [...state.starters];
  [starters[a], starters[b]] = [starters[b], starters[a]];
  return { ...state, starters };
}

/** A starter leaves the eleven for the first place on the bench; his slot stays empty. */
export function sendSlotToBench(state: EditorState, slot: number): EditorState {
  const outgoing = state.starters[slot];
  if (outgoing === null) {
    return state;
  }
  const starters = [...state.starters];
  starters[slot] = null;
  return { ...state, starters, bench: benchWith(state.bench, outgoing, 0) };
}

/**
 * The eleven « Composition automatique » gives in a formation, the assistant's as AI clubs pick theirs
 * (selectRestedLineup): the best player of each slot, the injured and the suspended left out, a tired one (under
 * ROTATION_FITNESS) rested where a rested one is hardly worse there; the bench his too.
 */
export function automaticState(
  state: EditorState,
  formation: FormationName,
  players: readonly (LineupCandidate & { fitness: number })[],
): EditorState {
  const lineup = selectRestedLineup(players, formationPositions(formation));
  const starters: (string | null)[] = formationPositions(formation).map(() => null);
  for (const { player, index } of lineup.starters) {
    starters[index] = player.id;
  }
  return { ...state, formation, starters, bench: lineup.bench.map((player) => player.id) };
}

/** A player outside the eleven takes the first place on the bench. */
export function moveToBenchFront(state: EditorState, key: string): EditorState {
  return state.starters.includes(key) ? state : { ...state, bench: benchWith(state.bench, key, 0) };
}

type RatedPlayer = { id: string; overall: number };

/**
 * Whose sheet stands in the column beside the pitch, never empty: the selected slot's player, else the last one chosen,
 * unless he has left the squad, else the best rated. Nobody only for a squad without players.
 */
export function pinnedSheetKey(selected: string | null, chosen: string | null, players: readonly RatedPlayer[]): string | null {
  if (selected !== null) {
    return selected;
  }
  if (players.some((player) => player.id === chosen)) {
    return chosen;
  }
  const best = players.reduce<RatedPlayer | null>(
    (current, player) => (current === null || player.overall > current.overall ? player : current),
    null,
  );
  return best?.id ?? null;
}
