import {
  FITNESS_LOSS_PER_SEGMENT,
  FITNESS_RECOVERY_PER_DAY,
  FULL_FITNESS,
  GOALKEEPER_FITNESS_LOSS_PER_SEGMENT,
  INJURY_RISK_FITNESS,
  INJURY_RISK_FITNESS_SPAN,
  SEGMENT_MINUTES,
  STRENGTH_PER_FITNESS_POINT,
} from "./balance";
import type { Position } from "./positions";

/** The factor of a player's share of his team's strength at a fitness: 1 rested, 0.91 at 70. */
export function fitnessFactor(fitness: number): number {
  return 1 - STRENGTH_PER_FITNESS_POINT * (FULL_FITNESS - fitness);
}

/** Fitness after some minutes on the pitch in a slot, never below 0: a goalkeeper tires less than an outfield player. */
export function fitnessAfter(fitness: number, slot: Position, minutes: number): number {
  const perSegment = slot === "GK" ? GOALKEEPER_FITNESS_LOSS_PER_SEGMENT : FITNESS_LOSS_PER_SEGMENT;
  return Math.max(0, fitness - (perSegment * Math.max(0, minutes)) / SEGMENT_MINUTES);
}

/** Fitness after some days without a match, up to FULL_FITNESS. */
export function recoveredFitness(fitness: number, days: number): number {
  return Math.min(FULL_FITNESS, fitness + FITNESS_RECOVERY_PER_DAY * Math.max(0, days));
}

/** How much likelier than a fit player a player at this fitness is to get injured: 1 down to INJURY_RISK_FITNESS. */
export function injuryRiskFactor(fitness: number): number {
  return fitness < INJURY_RISK_FITNESS ? 1 + (INJURY_RISK_FITNESS - fitness) / INJURY_RISK_FITNESS_SPAN : 1;
}

/** A player's fitness after a match: his fitness at kick-off, less what each of his spells on the pitch has cost him. */
export function fitnessAfterMatch(fitness: number, spells: readonly { slot: Position; minutes: number }[]): number {
  return spells.reduce((current, spell) => fitnessAfter(current, spell.slot, spell.minutes), fitness);
}
