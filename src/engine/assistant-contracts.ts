import type { Rng } from "../lib/rng";
import { MIN_GOALKEEPERS, SQUAD_ROLES, SQUAD_SIZE_MIN } from "./balance";
import { contractYears, marketValueFor, renewalWage, signingBonus, wageFor } from "./economy";
import { selectLineup, type Formation } from "./lineup";
import type { Position } from "./positions";
import { byValue, countByRole, GOALKEEPER_ROLE, roleIndex, squadStandard, wantsToKeep, type RosterPlayer } from "./squad-ai";
import { minimumReputation } from "./transfer-ai";

// The managed club's contracts ending on 30 June, decided at the season's turn (docs/design/simplification.md § 2): its
// player's own choice first; then, when its assistant takes care of the contracts, the AI clubs' rule of a useful player
// (planSquad's); otherwise a free departure, as before the rule. Then the free agents its assistant signs when the squad
// would be too thin to play. Pure: the caller reads the squad, the free agents and the budget, and writes what comes out.

/** The player's own choice for a contract of the managed club ending on 30 June (PlayerSave.contractChoice): stored, never renamed. */
export const CONTRACT_CHOICES = ["RENEW", "LEAVE"] as const;
export type ContractChoice = (typeof CONTRACT_CHOICES)[number];

/** What the season's turn does with a contract ending on 30 June: a renewal, or a free departure. */
export type ContractIntention = "renew" | "leave";

/** A player of the managed club at its turn: an AI club's roster player, with his player's choice when he made one. */
export type ManagedRosterPlayer = RosterPlayer & { choice: ContractChoice | null };

/**
 * What the turn does with a contract ending on 30 June, and who decides it: the player's choice ("player"), the assistant's
 * rule ("assistant"), or nobody when the player keeps the contracts and chose nothing: a free departure ("default").
 */
export type ContractOutcome =
  | { intention: "renew"; by: "player" | "assistant" }
  | { intention: "leave"; by: "player" | "assistant" | "default" };

/**
 * A contract ending on 30 June as the screens tell it: what the turn will do with it, and what the assistant's rule would do
 * without the player's own choice (his option « Ton adjoint décide »), null when the player keeps the contracts.
 */
export type ContractForecast = { outcome: ContractOutcome; assistant: ContractIntention | null };

/** A decision of the turn: a renewal, with its length in seasons and its wage, or a free departure; and who took it. */
export type ContractDecision =
  | { type: "renew"; playerId: string; years: number; wage: number; by: "player" | "assistant" }
  | { type: "leave"; playerId: string; by: "player" | "assistant" | "default" };

/** A free agent the assistant signs: his contract's length and wage, and his signing bonus, euros out of the budget. */
export type AssistantSigning = { playerId: string; years: number; wage: number; bonus: number };

/** What signing a free agent takes from the managed club: its transfer budget, which pays his bonus, and its reputation. */
export type SigningClub = { budget: number; reputation: number };

/**
 * What the turn does with each contract of the managed club ending on 30 June (the players of `squad` whose contract
 * expires), by player id, in the order of their value (byValue):
 * 1. his player's choice, RENEW or LEAVE;
 * 2. otherwise, when its assistant takes care of the contracts (byAssistant), the AI clubs' rule (planSquad): a useful
 *    player is renewed (wantsToKeep, against the squad's standard, squadStandard), and, as an AI club does, a player let go
 *    whose role the free agents could not fill (SQUAD_ROLES' counts) too, the best first; never one his player let go;
 * 3. otherwise he leaves free.
 * `squad` is the whole squad under contract; `freeAgentsByRole`, the free agents by role in SQUAD_ROLES' order
 * (countByRole). No draw: the screens tell it ahead, the turn decides with it.
 */
export function contractOutcomes(
  squad: readonly ManagedRosterPlayer[],
  freeAgentsByRole: readonly number[],
  byAssistant: boolean,
): Map<string, ContractOutcome> {
  const ordered = [...squad].sort(byValue);
  const standard = squadStandard(ordered);
  const outcomes = new Map<string, ContractOutcome>();
  for (const player of ordered) {
    if (!player.contractExpiring) {
      continue;
    }
    if (player.choice !== null) {
      outcomes.set(player.id, player.choice === "RENEW" ? { intention: "renew", by: "player" } : { intention: "leave", by: "player" });
    } else if (!byAssistant) {
      outcomes.set(player.id, { intention: "leave", by: "default" });
    } else {
      outcomes.set(player.id, wantsToKeep(player, standard) ? { intention: "renew", by: "assistant" } : { intention: "leave", by: "assistant" });
    }
  }
  if (!byAssistant) {
    return outcomes;
  }
  // A role the free agents could not fill keeps players the assistant would let go, the best first, as an AI club does.
  for (const [role, { count }] of SQUAD_ROLES.entries()) {
    const inRole = ordered.filter((player) => roleIndex(player.position) === role);
    const leaving = inRole.filter((player) => outcomes.get(player.id)?.intention === "leave");
    let shortfall = count - (inRole.length - leaving.length) - (freeAgentsByRole[role] ?? 0);
    for (const player of leaving) {
      if (shortfall <= 0) {
        break;
      }
      if (outcomes.get(player.id)?.by === "assistant") {
        outcomes.set(player.id, { intention: "renew", by: "assistant" });
        shortfall--;
      }
    }
  }
  return outcomes;
}

/**
 * The managed club's contracts ending on 30 June as its screens tell them, by player id: what the turn will do with each
 * (contractOutcomes), and what the assistant's rule would do without its player's choice, the others' kept; null for that
 * when its player keeps the contracts.
 */
export function contractForecasts(
  squad: readonly ManagedRosterPlayer[],
  freeAgentsByRole: readonly number[],
  byAssistant: boolean,
): Map<string, ContractForecast> {
  const outcomes = contractOutcomes(squad, freeAgentsByRole, byAssistant);
  const forecasts = new Map<string, ContractForecast>();
  for (const [id, outcome] of outcomes) {
    const withoutChoice = (): ContractIntention | null =>
      contractOutcomes(
        squad.map((player) => (player.id === id ? { ...player, choice: null } : player)),
        freeAgentsByRole,
        true,
      ).get(id)?.intention ?? null;
    forecasts.set(id, { outcome, assistant: !byAssistant ? null : outcome.by === "player" ? withoutChoice() : outcome.intention });
  }
  return forecasts;
}

/**
 * The turn's decisions on the managed club's contracts ending on 30 June (contractOutcomes), the best players first: a
 * renewal at the wage an AI club's pays (renewalWage) for a length drawn as an AI club's (contractYears: 1 to 5 seasons,
 * 2 at most after 33), from `rng`, the club's own preseason stream (squadPlanRngSeed); a free departure otherwise.
 */
export function decideContracts(
  squad: readonly ManagedRosterPlayer[],
  freeAgentsByRole: readonly number[],
  byAssistant: boolean,
  rng: Rng,
): ContractDecision[] {
  const outcomes = contractOutcomes(squad, freeAgentsByRole, byAssistant);
  const decisions: ContractDecision[] = [];
  for (const player of [...squad].sort(byValue)) {
    const outcome = outcomes.get(player.id);
    if (outcome === undefined) {
      continue;
    }
    decisions.push(
      outcome.intention === "renew"
        ? { type: "renew", playerId: player.id, years: contractYears(player.age, rng), wage: renewalWage(player), by: outcome.by }
        : { type: "leave", playerId: player.id, by: outcome.by },
    );
  }
  return decisions;
}

/**
 * The free agents the assistant signs after the turn (docs/design/simplification.md § 13, point 4): none while the squad,
 * its departures gone and its young players arrived, has SQUAD_SIZE_MIN players and MIN_GOALKEEPERS goalkeepers. Under
 * either, as an AI club fills its squad (planSquad), but up to those floors only: the missing goalkeepers first, then the
 * roles below their count (SQUAD_ROLES) and the best outfield players, until SQUAD_SIZE_MIN; the best free agents first,
 * among those who would join the club (minimumReputation), each paying his signing bonus (signingBonus) out of the budget
 * left, one above it passed over. Lengths drawn from `rng` after the renewals', the wage a free signing earns (wageFor).
 * `freeAgents`: those it may sign, the players it has just let go left out by the caller (gone is gone).
 */
export function assistantSignings(
  club: SigningClub,
  squad: readonly { position: Position }[],
  freeAgents: readonly RosterPlayer[],
  rng: Rng,
): AssistantSigning[] {
  const counts = countByRole(squad);
  let size = squad.length;
  if (size >= SQUAD_SIZE_MIN && counts[GOALKEEPER_ROLE] >= MIN_GOALKEEPERS) {
    return [];
  }
  const market = freeAgents.filter((player) => club.reputation >= minimumReputation({ ...player, seasonsLeft: 0 }, null)).sort(byValue);
  const signings: AssistantSigning[] = [];
  const signed = new Set<string>();
  let budget = club.budget;
  const trySign = (candidate: RosterPlayer): void => {
    const bonus = signingBonus(marketValueFor(candidate));
    if (bonus > budget) {
      return;
    }
    signings.push({ playerId: candidate.id, years: contractYears(candidate.age, rng), wage: wageFor(candidate), bonus });
    signed.add(candidate.id);
    budget -= bonus;
    counts[roleIndex(candidate.position)]++;
    size++;
  };

  for (const [role, { count }] of SQUAD_ROLES.entries()) {
    for (const candidate of market) {
      const missingGoalkeeper = role === GOALKEEPER_ROLE && counts[role] < MIN_GOALKEEPERS;
      if (counts[role] >= count || (size >= SQUAD_SIZE_MIN && !missingGoalkeeper)) {
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
    if (candidate.position !== "GK" && !signed.has(candidate.id)) {
      trySign(candidate);
    }
  }
  return signings;
}

/**
 * The managed club's important players (docs/design/simplification.md § 2.2): the eleven its assistant would field in its
 * formation were the whole squad available and fresh (selectLineup, nobody injured nor suspended). Their ids are player
 * keys: a player's secondary positions, which rate him at each slot, are drawn from his.
 */
export function importantPlayers(
  squad: readonly { id: string; position: Position; overall: number }[],
  formation: Formation,
): Set<string> {
  const everyone = squad.map(({ id, position, overall }) => ({ id, position, overall, injured: false, suspended: false }));
  return new Set(selectLineup(everyone, formation).starters.map(({ player }) => player.id));
}
