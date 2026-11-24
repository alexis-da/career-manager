import type { Rng } from "../lib/rng";
import {
  MIN_GOALKEEPERS,
  PROSPECT_MAX_AGE,
  RENEWAL_MAX_AGE,
  RENEWAL_RATING_MARGIN,
  SQUAD_SIZE_MAX,
  SQUAD_SIZE_MIN,
  SQUAD_ROLES,
  SQUAD_STANDARD_SIZE,
} from "./balance";
import { contractYears, marketValueFor, renewalWage, signingBonus, wageFor } from "./economy";
import { roleOf, type Position } from "./positions";

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
  budget: number; // euros: its transfer budget, which pays its signings' bonuses
};

export type SquadDecision =
  | { type: "renew"; playerId: string; years: number; wage: number }
  | { type: "release"; playerId: string }
  | { type: "sign"; playerId: string; years: number; wage: number; bonus: number }; // bonus: euros, signingBonus

const byId = (a: RosterPlayer, b: RosterPlayer): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Best players first: overall, then potential, then id so that the input order never matters. */
const byValue = (a: RosterPlayer, b: RosterPlayer): number =>
  b.overall - a.overall || b.potential - a.potential || byId(a, b);

/** Index of the player's role in SQUAD_ROLES. */
const roleIndex = (position: Position): number => SQUAD_ROLES.indexOf(roleOf(position));

const GOALKEEPER_ROLE = roleIndex("GK");

/** Players per role, in the order of SQUAD_ROLES. */
const countByRole = (players: readonly RosterPlayer[]): number[] => {
  const counts = SQUAD_ROLES.map(() => 0);
  for (const player of players) {
    counts[roleIndex(player.position)]++;
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
 *    market has nobody left to replace them in their role (SQUAD_ROLES);
 * 2. signings: the best free agents for each role below its count, then outfield players up to
 *    SQUAD_SIZE_MIN, as long as the club's budget pays their signing bonuses (signingBonus, on the preseason date),
 *    each debited as he signs: a free agent whose bonus is above what is left is passed over. A missing goalkeeper is
 *    signed even when the squad is already at SQUAD_SIZE_MAX;
 * 3. above SQUAD_SIZE_MAX, the weakest players under a running contract are released, prospects and the
 *    last goalkeepers excepted.
 * Wages come from economy.ts, written as before though no wage budget limits them (docs/design/simplification.md § 1.5);
 * contract lengths are drawn from `rng`.
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
  const marketCount = countByRole(market);
  for (const [role, { count }] of SQUAD_ROLES.entries()) {
    const inRole = ordered.filter((player) => roleIndex(player.position) === role);
    const released = inRole.filter((player) => releasedIds.has(player.id));
    const staying = inRole.length - released.length;
    let shortfall = count - staying - marketCount[role];
    for (const player of released) {
      if (shortfall <= 0) {
        break;
      }
      releasedIds.delete(player.id);
      shortfall--;
    }
  }

  const kept: RosterPlayer[] = [];
  for (const player of ordered) {
    if (releasedIds.has(player.id)) {
      decisions.push({ type: "release", playerId: player.id });
      continue;
    }
    kept.push(player);
    if (player.contractExpiring) {
      decisions.push({ type: "renew", playerId: player.id, years: contractYears(player.age, rng), wage: renewalWage(player) });
    }
  }

  // 2. Signings, each paying its bonus out of the budget left.
  const counts = countByRole(kept);
  const signedIds = new Set<string>();
  let size = kept.length;
  let budget = club.budget;
  const trySign = (candidate: RosterPlayer): void => {
    const bonus = signingBonus(marketValueFor(candidate));
    if (bonus > budget) {
      return;
    }
    decisions.push({
      type: "sign",
      playerId: candidate.id,
      years: contractYears(candidate.age, rng),
      wage: wageFor(candidate),
      bonus,
    });
    signedIds.add(candidate.id);
    budget -= bonus;
    counts[roleIndex(candidate.position)]++;
    size++;
  };

  for (const [role, { count }] of SQUAD_ROLES.entries()) {
    for (const candidate of market) {
      const missingGoalkeeper = role === GOALKEEPER_ROLE && counts[role] < MIN_GOALKEEPERS;
      if (counts[role] >= count || (size >= SQUAD_SIZE_MAX && !missingGoalkeeper)) {
        break;
      }
      if (roleIndex(candidate.position) === role) {
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
    if (player.position === "GK" && counts[GOALKEEPER_ROLE] <= MIN_GOALKEEPERS) {
      continue;
    }
    decisions.push({ type: "release", playerId: player.id });
    counts[roleIndex(player.position)]--;
    size--;
  }

  return decisions;
}
