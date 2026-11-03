import { recoveredFitness } from "../engine/fitness";

// Fitness as the screens show it. Pure: no query here, the callers read the dates.

const DAY_MS = 86_400_000;

/** Whole days from one date to a later one, both at midnight UTC as the game's dates are; none when it is not later. */
export function wholeDaysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

/**
 * A player's fitness at a match's kick-off: today's (PlayerSave.fitness, as of the save's current date), recovered over
 * the days of rest until then, as playNextMatchday recovers it (recoveredFitness). What the manager picks his players
 * by: a starter of today's match may be fresh again by the next one. On the current date itself, today's.
 */
export function fitnessAtKickOff(fitness: number, currentDate: Date, matchDate: Date): number {
  return recoveredFitness(fitness, wholeDaysBetween(currentDate, matchDate));
}
