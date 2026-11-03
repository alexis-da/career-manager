import { FULL_FITNESS, INJURY_RISK_FITNESS, ROTATION_FITNESS } from "@/src/engine/balance";

/** From here, a player is as good as rested: his gauge turns green. */
const FRESH_FITNESS = 90;

/**
 * When a figure's fitness is: at the kick-off of the managed club's next match (the squad and the lineup, rested until
 * then), at the restart after a break of a match (the Coaching panel), or today (a player of another club).
 */
export type FitnessMoment = "nextMatch" | "restart" | "today";

/**
 * How tired a player reads, by the engine's own lines: at risk of injury under INJURY_RISK_FITNESS, tired under
 * ROTATION_FITNESS (where an AI club rests him), fresh from FRESH_FITNESS, fine in between.
 */
export type FitnessLevel = "fresh" | "fine" | "tired" | "exhausted";

/**
 * The figure shown, whole and within 0–FULL_FITNESS: during a match, fitness need not be whole (a goalkeeper loses 1.5
 * a segment). The level and the colours are read from it, so that the figure and its colour always agree.
 */
export function fitnessFigure(fitness: number): number {
  return Math.round(Math.min(FULL_FITNESS, Math.max(0, fitness)));
}

export function fitnessLevel(fitness: number): FitnessLevel {
  const figure = fitnessFigure(fitness);
  if (figure < INJURY_RISK_FITNESS) {
    return "exhausted";
  }
  if (figure < ROTATION_FITNESS) {
    return "tired";
  }
  return figure < FRESH_FITNESS ? "fine" : "fresh";
}

const BAR_CLASSES: Record<FitnessLevel, string> = {
  fresh: "bg-win",
  fine: "bg-foreground/60",
  tired: "bg-warning",
  exhausted: "bg-loss",
};

/** Colour of the fitness bar: green when fresh, neutral, amber when tired, red at risk of injury. */
export function fitnessBarClass(fitness: number): string {
  return BAR_CLASSES[fitnessLevel(fitness)];
}

/**
 * Colour of the figure: its line's own while the player is fit enough, warned when he is tired or at risk. On the bright
 * blue, the loss has a lighter red of its own.
 */
export function fitnessTextClass(fitness: number, onBlue = false): string {
  switch (fitnessLevel(fitness)) {
    case "tired":
      return "text-warning";
    case "exhausted":
      return onBlue ? "text-loss-on-blue" : "text-loss";
    default:
      return "";
  }
}

/** The bar's filled share, as a CSS width. */
export function fitnessWidth(fitness: number): string {
  return `${(fitnessFigure(fitness) / FULL_FITNESS) * 100}%`;
}
