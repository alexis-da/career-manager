import type { Rng } from "../lib/rng";
import {
  MIN_GOALKEEPERS,
  PROSPECT_MAX_AGE,
  RENEWAL_MAX_AGE,
  RENEWAL_RATING_MARGIN,
  SQUAD_POSITION_TARGETS,
  SQUAD_SIZE_MAX,
  SQUAD_SIZE_MIN,
  SQUAD_STANDARD_SIZE,
} from "./balance";
import { contractYears, wageFor } from "./economy";
import type { Position } from "./generation";

export type RosterPlayer = {
  id: string; // stable player key
  position: Position;
  age: number; // whole years at the preseason date
  overall: number;
  potential: number;
  wage: number; // euros per season: current wage, or last one for a free agent
  contractExpiring: boolean; // the contract ended on 30 June: renew or release now
};

export type RosterClub = {
  id: string;
  wageBudget: number; // euros per season
};

export type SquadDecision =
  | { type: "renew"; playerId: string; years: number; wage: number }
  | { type: "release"; playerId: string }
  | { type: "sign"; playerId: string; years: number; wage: number };

const POSITIONS: readonly Position[] = ["GK", "DF", "MF", "FW"];

const byId = (a: RosterPlayer, b: RosterPlayer): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Best players first: overall, then potential, then id so that the input order never matters. */
const byValue = (a: RosterPlayer, b: RosterPlayer): number =>
  b.overall - a.overall || b.potential - a.potential || byId(a, b);

const countByPosition = (players: readonly RosterPlayer[]): Record<Position, number> => {
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const player of players) {
    counts[player.position]++;
  }
  return counts;
};

/** Seed of an AI club's preseason stream (contract lengths). */
export function squadPlanRngSeed(saveSeed: string, startYear: number, clubSlug: string): string {
  return `${saveSeed}:squad-plan:${startYear}:${clubSlug}`;
}

/** Mean overall of the club's best SQUAD_STANDARD_SIZE players. */
export function squadStandard(players: readonly RosterPlayer[]): number {
  const best = [...players].sort(byValue).slice(0, SQUAD_STANDARD_SIZE);
  return best.length === 0 ? 0 : best.reduce((sum, player) => sum + player.overall, 0) / best.length;
}

const isProspect = (player: RosterPlayer, standard: number): boolean =>
  player.age <= PROSPECT_MAX_AGE && player.potential >= standard;

/** Whether the club wants to keep a player whose contract expires: rating, age, or potential when young. */
export function wantsToKeep(player: RosterPlayer, standard: number): boolean {
  if (isProspect(player, standard)) {
    return true;
  }
  const bar = player.age > RENEWAL_MAX_AGE ? standard : standard - RENEWAL_RATING_MARGIN;
  return player.overall >= bar;
}

/**
 * Preseason decisions of an AI club:
 * 1. expiring contracts: renew the players worth keeping, release the others, unless the free agent
 *    market has nobody left to replace them at their position;
 * 2. signings: the best free agents for each position below its target, then outfield players up to
 *    SQUAD_SIZE_MIN, as long as the payroll stays within the wage budget. A missing goalkeeper is signed
 *    even when the squad is already at SQUAD_SIZE_MAX;
 * 3. above SQUAD_SIZE_MAX, the weakest players under a running contract are released, prospects and the
 *    last goalkeepers excepted.
 * Wages come from economy.ts; contract lengths are drawn from `rng`.
 */
export function planSquad(
  club: RosterClub,
  squad: readonly RosterPlayer[],
  freeAgents: readonly RosterPlayer[],
  rng: Rng,
): SquadDecision[] {
  const ordered = [...squad].sort(byValue);
  const standard = squadStandard(ordered);
  const market = [...freeAgents].sort(byValue);
  const decisions: SquadDecision[] = [];

  // 1. Expiring contracts.
  const releasedIds = new Set(
    ordered.filter((player) => player.contractExpiring && !wantsToKeep(player, standard)).map((player) => player.id),
  );
  const marketCount = countByPosition(market);
  for (const position of POSITIONS) {
    const released = ordered.filter((player) => player.position === position && releasedIds.has(player.id));
    const staying = ordered.filter((player) => player.position === position && !releasedIds.has(player.id)).length;
    let shortfall = SQUAD_POSITION_TARGETS[position] - staying - marketCount[position];
    for (const player of released) {
      if (shortfall <= 0) {
        break;
      }
      releasedIds.delete(player.id);
      shortfall--;
    }
  }

  let payroll = 0;
  const kept: RosterPlayer[] = [];
  for (const player of ordered) {
    if (releasedIds.has(player.id)) {
      decisions.push({ type: "release", playerId: player.id });
      continue;
    }
    kept.push(player);
    if (player.contractExpiring) {
      const wage = Math.max(player.wage, wageFor(player));
      decisions.push({ type: "renew", playerId: player.id, years: contractYears(player.age, rng), wage });
      payroll += wage;
    } else {
      payroll += player.wage;
    }
  }

  // 2. Signings.
  const counts = countByPosition(kept);
  const signedIds = new Set<string>();
  let size = kept.length;
  const trySign = (candidate: RosterPlayer): void => {
    const wage = wageFor(candidate);
    if (payroll + wage > club.wageBudget) {
      return;
    }
    decisions.push({ type: "sign", playerId: candidate.id, years: contractYears(candidate.age, rng), wage });
    signedIds.add(candidate.id);
    payroll += wage;
    counts[candidate.position]++;
    size++;
  };

  for (const position of POSITIONS) {
    for (const candidate of market) {
      const missingGoalkeeper = position === "GK" && counts.GK < MIN_GOALKEEPERS;
      if (counts[position] >= SQUAD_POSITION_TARGETS[position] || (size >= SQUAD_SIZE_MAX && !missingGoalkeeper)) {
        break;
      }
      if (candidate.position === position) {
        trySign(candidate);
      }
    }
  }
  for (const candidate of market) {
    if (size >= SQUAD_SIZE_MIN) {
      break;
    }
    if (candidate.position !== "GK" && !signedIds.has(candidate.id)) {
      trySign(candidate);
    }
  }

  // 3. Too many players.
  const surplus = kept
    .filter((player) => !player.contractExpiring && !isProspect(player, standard))
    .sort((a, b) => byValue(b, a));
  for (const player of surplus) {
    if (size <= SQUAD_SIZE_MAX) {
      break;
    }
    if (player.position === "GK" && counts.GK <= MIN_GOALKEEPERS) {
      continue;
    }
    decisions.push({ type: "release", playerId: player.id });
    counts[player.position]--;
    size--;
  }

  return decisions;
}
