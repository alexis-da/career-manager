import type { AttributeName } from "./generation";
import { ratingAt, type Position } from "./positions";

export type SquadPlayer = Record<AttributeName, number> & {
  id: string; // stable identity; also breaks rating ties, so the input order never changes the lineup
  position: Position;
  overall: number;
  form: number; // 1–99
  morale: number; // 1–99
  injured: boolean;
};

export type LineupSlot = {
  player: SquadPlayer;
  slot: Position; // where the player plays, which may differ from their position
};

export type Lineup = {
  starters: LineupSlot[]; // in the order of the formation's slots
  bench: SquadPlayer[];
};

/** A formation: the positions of its 11 slots, filled in this order. */
export type Formation = readonly Position[];

/** The only formation for now, a 4-3-3: the goal, then the defence from the right, midfield, attack. */
export const DEFAULT_FORMATION: Formation = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CM", "RW", "ST", "LW"];

export const BENCH_SIZE = 7;

const byId = (a: SquadPlayer, b: SquadPlayer): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const byOverall = (a: SquadPlayer, b: SquadPlayer): number => b.overall - a.overall || byId(a, b);

/** Best player for a slot first: rating in the slot, then id. */
const byRatingAt =
  (slot: Position) =>
  (a: SquadPlayer, b: SquadPlayer): number =>
    ratingAt(b, slot) - ratingAt(a, slot) || byId(a, b);

/**
 * Fills the formation's slots in order, each with the available player rated best in it (ratingAt), injured
 * players left out, ties broken by id. The bench gets the backup goalkeeper first, then the best remaining
 * players by overall.
 */
export function selectLineup(squad: readonly SquadPlayer[], formation: Formation = DEFAULT_FORMATION): Lineup {
  let available = squad.filter((player) => !player.injured).sort(byOverall);
  const starters: LineupSlot[] = [];

  for (const slot of formation) {
    const [best] = [...available].sort(byRatingAt(slot));
    if (best === undefined) {
      break;
    }
    starters.push({ player: best, slot });
    available = available.filter((player) => player !== best);
  }

  const backupGoalkeeper = available.find((player) => player.position === "GK");
  const bench =
    backupGoalkeeper === undefined
      ? available
      : [backupGoalkeeper, ...available.filter((player) => player !== backupGoalkeeper)];

  return { starters, bench: bench.slice(0, BENCH_SIZE) };
}
