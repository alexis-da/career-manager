import { ROTATION_FITNESS, ROTATION_MAX_RATING_GAP } from "./balance";
import { DEFAULT_FORMATION_NAME, formationPositions, type FormationName } from "./formations";
import type { AttributeName } from "./generation";
import type { Instruction } from "./instructions";
import { positionGroup, ratingAt, type Position } from "./positions";

/** What picking a lineup needs to know about a player. */
export type LineupCandidate = {
  id: string; // stable identity (playerKey); also breaks rating ties, so the input order never changes the lineup
  position: Position;
  overall: number;
  injured: boolean;
  suspended?: boolean; // for the match the lineup is for: out, as an injured player is
};

/** Whether a player can be picked for the match: neither injured nor suspended. */
export const isAvailable = (player: LineupCandidate): boolean => !player.injured && player.suspended !== true;

export type SquadPlayer = LineupCandidate &
  Record<AttributeName, number> & {
    form: number; // 1–99
    morale: number; // 1–99
    fitness: number; // 0–100, FULL_FITNESS when rested
  };

export type LineupSlot<P extends LineupCandidate = SquadPlayer> = {
  player: P;
  slot: Position; // where the player plays, which may differ from their position
  index: number; // the slot's index in the formation
};

export type Lineup<P extends LineupCandidate = SquadPlayer> = {
  starters: LineupSlot<P>[]; // in the order of the formation's slots
  bench: P[];
  instruction?: Instruction; // the one its club starts the match with: its manager's, saved with it; Équilibré without one
};

/** A lineup chosen by the manager: a player key per slot index, the substitutes in order, and his starting instruction. */
export type SavedLineup = {
  starters: { slot: number; playerKey: string }[];
  benchOrder: string[];
  instruction?: Instruction; // absent from a lineup saved before it was asked: Équilibré
};

/** A formation: the positions of its 11 slots, filled in this order. */
export type Formation = readonly Position[];

/** The 4-3-3 of AI clubs: the goal, then the defence from the right, midfield, attack. */
export const DEFAULT_FORMATION: Formation = formationPositions(DEFAULT_FORMATION_NAME);

export const BENCH_SIZE = 7;

const byId = (a: LineupCandidate, b: LineupCandidate): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const byOverall = (a: LineupCandidate, b: LineupCandidate): number => b.overall - a.overall || byId(a, b);

/** The best player for a slot: rating in the slot, then id. */
function bestFor<P extends LineupCandidate>(candidates: readonly P[], slot: Position): P | undefined {
  let best: P | undefined;
  for (const candidate of candidates) {
    const gap = best === undefined ? 1 : ratingAt(candidate, slot) - ratingAt(best, slot);
    if (best === undefined || gap > 0 || (gap === 0 && byId(candidate, best) < 0)) {
      best = candidate;
    }
  }
  return best;
}

/** Picks a slot's player among the candidates left: the best one, unless a rule of the club's says otherwise. */
type Pick<P> = (candidates: readonly P[], slot: Position) => P | undefined;

/**
 * Fills the empty slots in order, each with the remaining player rated best in it (ratingAt), ties broken by
 * id, or the one `pick` chooses. Returns the players left over.
 */
function fillGreedily<P extends LineupCandidate>(
  formation: Formation,
  assigned: (P | undefined)[],
  candidates: readonly P[],
  pick: Pick<P> = bestFor,
): P[] {
  let remaining = [...candidates];
  formation.forEach((slot, index) => {
    if (assigned[index] !== undefined) {
      return;
    }
    const best = pick(remaining, slot);
    if (best !== undefined) {
      assigned[index] = best;
      remaining = remaining.filter((player) => player !== best);
    }
  });
  return remaining;
}

/** The backup goalkeeper first, then the best players by overall. */
function automaticBench<P extends LineupCandidate>(players: readonly P[]): P[] {
  const sorted = [...players].sort(byOverall);
  const backupGoalkeeper = sorted.find((player) => player.position === "GK");
  return backupGoalkeeper === undefined
    ? sorted
    : [backupGoalkeeper, ...sorted.filter((player) => player !== backupGoalkeeper)];
}

function toLineup<P extends LineupCandidate>(formation: Formation, assigned: (P | undefined)[], bench: P[]): Lineup<P> {
  return {
    starters: assigned.flatMap((player, index) =>
      player === undefined ? [] : [{ player, slot: formation[index], index }],
    ),
    bench: bench.slice(0, BENCH_SIZE),
  };
}

/**
 * Fills the formation's slots in order, each with the available player rated best in it (ratingAt), injured and
 * suspended players left out (isAvailable), ties broken by id. The bench gets the backup goalkeeper first, then the best remaining
 * players by overall.
 */
export function selectLineup<P extends LineupCandidate>(squad: readonly P[], formation: Formation = DEFAULT_FORMATION): Lineup<P> {
  const assigned: (P | undefined)[] = formation.map(() => undefined);
  const remaining = fillGreedily(formation, assigned, squad.filter(isAvailable));
  return toLineup(formation, assigned, automaticBench(remaining));
}

/**
 * The best player for a slot, unless he is tired: below ROTATION_FITNESS, the best rested player (at ROTATION_FITNESS
 * or more) rated at most ROTATION_MAX_RATING_GAP below him in the slot plays instead, if there is one.
 */
function restedFor<P extends LineupCandidate & { fitness: number }>(candidates: readonly P[], slot: Position): P | undefined {
  const best = bestFor(candidates, slot);
  if (best === undefined || best.fitness >= ROTATION_FITNESS) {
    return best;
  }
  const rested = bestFor(
    candidates.filter((player) => player.fitness >= ROTATION_FITNESS),
    slot,
  );
  return rested !== undefined && ratingAt(rested, slot) >= ratingAt(best, slot) - ROTATION_MAX_RATING_GAP ? rested : best;
}

/**
 * An AI club's lineup for a match: selectLineup, except that a tired player gives way to a rested one hardly worse in
 * his slot (restedFor). The tired player may still start elsewhere, or sit on the bench.
 */
export function selectRestedLineup<P extends LineupCandidate & { fitness: number }>(
  squad: readonly P[],
  formation: Formation = DEFAULT_FORMATION,
): Lineup<P> {
  const assigned: (P | undefined)[] = formation.map(() => undefined);
  const remaining = fillGreedily(formation, assigned, squad.filter(isAvailable), restedFor);
  return toLineup(formation, assigned, automaticBench(remaining));
}

/**
 * The lineup a club plays: the saved one where it still holds, completed automatically. A saved starter keeps
 * their slot unless injured, gone from the squad, or already starting in an earlier slot; the slots left empty
 * are filled as selectLineup does. The bench takes the saved substitutes still available, in order, then the
 * automatic bench; the club starts the match with the instruction saved with it. Without a saved lineup, this is
 * selectLineup in the formation.
 */
export function resolveLineup<P extends LineupCandidate>(
  formation: FormationName,
  saved: SavedLineup | null,
  squad: readonly P[],
): Lineup<P> {
  const positions = formationPositions(formation);
  const available = new Map(squad.filter(isAvailable).map((player) => [player.id, player]));
  const assigned: (P | undefined)[] = positions.map(() => undefined);
  const taken = new Set<string>();

  const savedStarters = [...(saved?.starters ?? [])].sort((a, b) => a.slot - b.slot);
  for (const { slot, playerKey } of savedStarters) {
    const player = available.get(playerKey);
    if (player === undefined || taken.has(playerKey) || slot < 0 || slot >= positions.length || assigned[slot] !== undefined) {
      continue;
    }
    assigned[slot] = player;
    taken.add(playerKey);
  }

  const remaining = fillGreedily(
    positions,
    assigned,
    [...available.values()].filter((player) => !taken.has(player.id)),
  );
  const savedBench: P[] = [];
  for (const playerKey of saved?.benchOrder ?? []) {
    const player = remaining.find((candidate) => candidate.id === playerKey);
    if (player !== undefined && !savedBench.includes(player)) {
      savedBench.push(player);
    }
  }
  const bench = [...savedBench, ...automaticBench(remaining.filter((player) => !savedBench.includes(player)))];
  const lineup = toLineup(positions, assigned, bench);
  return saved?.instruction === undefined ? lineup : { ...lineup, instruction: saved.instruction };
}

/**
 * How many starters of a lineup resolved from a saved one were picked automatically: slots whose saved player
 * was injured, gone or saved twice, and slots the manager left empty. Zero without a saved lineup, which is an
 * automatic eleven by choice rather than one completed.
 */
export function autoFilledSlots<P extends LineupCandidate>(saved: SavedLineup | null, lineup: Lineup<P>): number {
  if (saved === null || saved.starters.length === 0) {
    return 0;
  }
  const savedBySlot = new Map(saved.starters.map((starter) => [starter.slot, starter.playerKey]));
  return lineup.starters.filter((starter) => savedBySlot.get(starter.index) !== starter.player.id).length;
}

/**
 * The starters (player key per slot, null for an empty slot) after switching formation: a starter keeps playing
 * where a slot of the new formation has the position of their old slot, else where a slot of the same line is
 * left; the slots still empty are filled automatically from every available player, the other former starters
 * included.
 */
export function changeFormation<P extends LineupCandidate>(
  from: FormationName,
  to: FormationName,
  starters: readonly (string | null)[],
  squad: readonly P[],
): (string | null)[] {
  const fromPositions = formationPositions(from);
  const toPositions = formationPositions(to);
  const byKey = new Map(squad.map((player) => [player.id, player]));
  const current = starters.flatMap((key, index) => {
    const player = key === null ? undefined : byKey.get(key);
    return player === undefined || index >= fromPositions.length ? [] : [{ player, slot: fromPositions[index] }];
  });

  const assigned: (P | undefined)[] = toPositions.map(() => undefined);
  const placed = new Set<string>();
  const place = (index: number, player: P): void => {
    assigned[index] = player;
    placed.add(player.id);
  };

  toPositions.forEach((slot, index) => {
    const same = current.find((entry) => !placed.has(entry.player.id) && entry.slot === slot);
    if (same !== undefined) {
      place(index, same.player);
    }
  });
  toPositions.forEach((slot, index) => {
    if (assigned[index] !== undefined) {
      return;
    }
    const sameLine = current
      .filter((entry) => !placed.has(entry.player.id) && positionGroup(entry.slot) === positionGroup(slot))
      .map((entry) => entry.player);
    const best = bestFor(sameLine, slot);
    if (best !== undefined) {
      place(index, best);
    }
  });

  fillGreedily(
    toPositions,
    assigned,
    squad.filter((player) => isAvailable(player) && !placed.has(player.id)),
  );
  return assigned.map((player) => player?.id ?? null);
}

/** Mean rating of a lineup's starters in the slots they play, the rating the match engine uses. */
export function averageStarterRating<P extends LineupCandidate>(lineup: Lineup<P>): number {
  const { starters } = lineup;
  return starters.length === 0 ? 0 : starters.reduce((sum, { player, slot }) => sum + ratingAt(player, slot), 0) / starters.length;
}
