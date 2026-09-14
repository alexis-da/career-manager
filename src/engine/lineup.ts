import type { AttributeName, Position } from "./generation";

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
  slot: Position; // where the player plays, which may differ from their position when injuries force it
};

export type Lineup = {
  starters: LineupSlot[];
  bench: SquadPlayer[];
};

/** Players per slot in the only formation for now, a 4-3-3. */
export const FORMATION: Readonly<Record<Position, number>> = { GK: 1, DF: 4, MF: 3, FW: 3 };

export const BENCH_SIZE = 7;

const SLOTS: readonly Position[] = ["GK", "DF", "MF", "FW"];

const byId = (a: SquadPlayer, b: SquadPlayer): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const byOverall = (a: SquadPlayer, b: SquadPlayer): number => b.overall - a.overall || byId(a, b);

/** Best fill-in for a slot outside the player's position: goalkeeping in goal, overall elsewhere. */
const byFitFor =
  (slot: Position) =>
  (a: SquadPlayer, b: SquadPlayer): number =>
    slot === "GK" ? b.goalkeeping - a.goalkeeping || byId(a, b) : byOverall(a, b);

/**
 * Picks a 4-3-3: the best available players by overall at their own position, then, for any slot left
 * empty by injuries, the best remaining player for that slot. The bench gets the backup goalkeeper
 * first, then the best remaining players.
 */
export function selectLineup(squad: readonly SquadPlayer[]): Lineup {
  const available = squad.filter((player) => !player.injured).sort(byOverall);
  const chosen = new Set<string>();
  const starters: LineupSlot[] = [];
  const take = (player: SquadPlayer, slot: Position): void => {
    chosen.add(player.id);
    starters.push({ player, slot });
  };

  for (const slot of SLOTS) {
    for (const player of available.filter((candidate) => candidate.position === slot).slice(0, FORMATION[slot])) {
      take(player, slot);
    }
  }

  for (const slot of SLOTS) {
    let missing = FORMATION[slot] - starters.filter((starter) => starter.slot === slot).length;
    const candidates = available.filter((player) => !chosen.has(player.id)).sort(byFitFor(slot));
    for (const player of candidates) {
      if (missing === 0) {
        break;
      }
      take(player, slot);
      missing--;
    }
  }

  starters.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));

  const remaining = available.filter((player) => !chosen.has(player.id));
  const backupGoalkeeper = remaining.find((player) => player.position === "GK");
  const bench =
    backupGoalkeeper === undefined
      ? remaining
      : [backupGoalkeeper, ...remaining.filter((player) => player !== backupGoalkeeper)];

  return { starters, bench: bench.slice(0, BENCH_SIZE) };
}
