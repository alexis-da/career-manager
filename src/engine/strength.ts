import {
  ATTACK_LINE_WEIGHTS,
  ATTACK_WEIGHTS,
  BASE_GOALS_PER_TEAM,
  CONDITION_NEUTRAL,
  DEFENSE_LINE_WEIGHTS,
  DEFENSE_WEIGHTS,
  FORMATION_PROFILES,
  HOME_ADVANTAGE,
  MAX_EXPECTED_GOALS,
  STRENGTH_EXPONENT,
  STRENGTH_PER_FORM_POINT,
  STRENGTH_PER_MORALE_POINT,
} from "./balance";
import { fitnessFactor } from "./fitness";
import { FORMATION_NAMES, formationPositions, type FormationName } from "./formations";
import { ATTRIBUTE_NAMES, type AttributeName } from "./generation";
import { selectRestedLineup, type Lineup, type LineupSlot, type SquadPlayer } from "./lineup";
import { playerFamiliarity, positionGroup, type Position, type PositionGroup } from "./positions";

/**
 * The strength of a team: the attack and the defense of an eleven, and the goals two of them expect against each other.
 * The match engine plays with these functions and the lineup screen shows them, in the browser as on the server: one
 * calculation for both. Pure, without a draw.
 */
export type TeamStrength = {
  attack: number;
  defense: number;
};

export function condition(player: SquadPlayer): number {
  return (
    1 +
    (player.form - CONDITION_NEUTRAL) * STRENGTH_PER_FORM_POINT +
    (player.morale - CONDITION_NEUTRAL) * STRENGTH_PER_MORALE_POINT
  );
}

function weightedValue(player: SquadPlayer, weights: Partial<Record<AttributeName, number>>): number {
  return ATTRIBUTE_NAMES.reduce((sum, name) => sum + player[name] * (weights[name] ?? 0), 0);
}

/**
 * Attack and defense of the players on the pitch: each one's attributes weighted for the group of their slot,
 * reduced by their familiarity with the slot (as ratingAt reduces the overall), adjusted for form and morale, for his
 * freshness at kick-off (fitnessFactor) and for what the match has done to him so far (inMatch: his wear, a knock he
 * plays on with; 1 before kick-off). A line's value is shared among the formation's slots of that line, empty ones
 * included: a team down to ten is weaker. Without a formation, the starters' slots are the formation.
 */
export function teamStrength(
  lineup: Lineup,
  formation: readonly Position[] = lineup.starters.map(({ slot }) => slot),
  inMatch: (starter: LineupSlot) => number = () => 1,
): TeamStrength {
  const lineSizes: Record<PositionGroup, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const slot of formation) {
    lineSizes[positionGroup(slot)]++;
  }
  let attack = 0;
  let defense = 0;
  for (const starter of lineup.starters) {
    const { player, slot } = starter;
    const group = positionGroup(slot);
    const fitness = fitnessFactor(player.fitness) * inMatch(starter);
    const share = (condition(player) * fitness * playerFamiliarity(player, slot)) / Math.max(1, lineSizes[group]);
    attack += ATTACK_LINE_WEIGHTS[group] * share * weightedValue(player, ATTACK_WEIGHTS[group]);
    defense += DEFENSE_LINE_WEIGHTS[group] * share * weightedValue(player, DEFENSE_WEIGHTS[group]);
  }
  return { attack, defense };
}

/** Expected goals of a team against an opponent; venueFactor is HOME_ADVANTAGE at home, its inverse away. */
export function expectedGoals(team: TeamStrength, opponent: TeamStrength, venueFactor: number): number {
  if (team.attack <= 0) {
    return 0;
  }
  const ratio = team.attack / Math.max(opponent.defense, 1);
  return Math.min(MAX_EXPECTED_GOALS, BASE_GOALS_PER_TEAM * Math.pow(ratio, STRENGTH_EXPONENT) * venueFactor);
}

/** Attack and defense of a lineup in a formation, the formation's profile applied; inMatch as teamStrength reads it. */
export function formationStrength(
  lineup: Lineup,
  formation: FormationName,
  inMatch?: (starter: LineupSlot) => number,
): TeamStrength {
  const { attack, defense } = teamStrength(lineup, formationPositions(formation), inMatch);
  const profile = FORMATION_PROFILES[formation];
  return { attack: attack * profile.attack, defense: defense * profile.defense };
}

/** The next opponent as a comparison needs him: his probable eleven's strength, and whether the club plays at home. */
export type Opposition = { strength: TeamStrength; atHome: boolean };

/**
 * The goals a team expects to score more than it concedes against an opponent over a match, both sides Équilibré, home
 * advantage included: the engine's expected goals of each side, one less the other.
 */
export function expectedGoalDifference(team: TeamStrength, opposition: Opposition): number {
  const venue = opposition.atHome ? HOME_ADVANTAGE : 1 / HOME_ADVANTAGE;
  return expectedGoals(team, opposition.strength, venue) - expectedGoals(opposition.strength, team, 1 / venue);
}

/** A formation of the comparison: its automatic eleven's strength and, against the next opponent, its goal difference. */
export type FormationOption = { formation: FormationName; strength: TeamStrength; goalDifference: number | null };

/**
 * Every formation with the club's automatic eleven in it (selectRestedLineup: its tired players rested where a rested
 * one is hardly worse, the injured and the suspended left out), each one's attack and defense and, against the next
 * opponent, the goals it expects to score more than it concedes. The best is the formation with the largest difference,
 * the first of FORMATION_NAMES among equals; none without an opponent.
 */
export function compareFormations(
  squad: readonly SquadPlayer[],
  opposition: Opposition | null,
): { options: FormationOption[]; best: FormationName | null } {
  const options = FORMATION_NAMES.map((formation): FormationOption => {
    const strength = formationStrength(selectRestedLineup(squad, formationPositions(formation)), formation);
    return { formation, strength, goalDifference: opposition === null ? null : expectedGoalDifference(strength, opposition) };
  });
  if (opposition === null) {
    return { options, best: null };
  }
  const difference = (option: FormationOption): number => option.goalDifference ?? -Infinity;
  const best = options.reduce((current, option) => (difference(option) > difference(current) ? option : current));
  return { options, best: best.formation };
}
