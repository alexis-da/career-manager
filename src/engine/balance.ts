import type { AttributeName, Position } from "./generation";

// ------------------------------------------------------------------ Attribute generation

/** Club level (1–99) of a league's champion and of its last club; ranks in between are interpolated. */
export const CLUB_LEVEL_BEST = 78;
export const CLUB_LEVEL_WORST = 60;

/** Maximum gap between a player's overall quality and their club level (bell-shaped draw). */
export const PLAYER_QUALITY_SPREAD = 8;

/** Maximum gap between one attribute and the player's position profile (bell-shaped draw). */
export const ATTRIBUTE_SPREAD = 7;

/**
 * Quality modifier by age, as [age, modifier] points: linear in between, flat outside.
 * Young players are not yet at their level, the peak is 26–29, decline starts after 30.
 */
export const AGE_QUALITY_CURVE: readonly (readonly [number, number])[] = [
  [17, -13],
  [20, -8],
  [23, -3],
  [26, 0],
  [29, 0],
  [31, -2],
  [33, -5],
  [36, -10],
];

/** Maximum room between overall and potential by age, as [age, room] points: none left from 29. */
export const AGE_GROWTH_CURVE: readonly (readonly [number, number])[] = [
  [17, 24],
  [21, 16],
  [24, 8],
  [27, 3],
  [29, 0],
];

/** Share of the growth room a player always gets; the rest is drawn. */
export const GROWTH_MIN_SHARE = 0.4;

/** Offset of each attribute from the player's quality, by position. */
export const POSITION_PROFILES: Readonly<Record<Position, Readonly<Record<AttributeName, number>>>> = {
  GK: { pace: -25, shooting: -35, passing: -15, dribbling: -25, defending: -20, physical: -5, goalkeeping: 3 },
  DF: { pace: -2, shooting: -22, passing: -6, dribbling: -12, defending: 6, physical: 4, goalkeeping: -60 },
  MF: { pace: -2, shooting: -2, passing: 6, dribbling: 2, defending: -6, physical: -2, goalkeeping: -60 },
  FW: { pace: 2, shooting: 4, passing: -6, dribbling: 2, defending: -30, physical: -1, goalkeeping: -60 },
};

/** Weight of each attribute in the overall rating, by position. Each row sums to 1. */
export const OVERALL_WEIGHTS: Readonly<Record<Position, Readonly<Record<AttributeName, number>>>> = {
  GK: { pace: 0, shooting: 0, passing: 0.1, dribbling: 0, defending: 0, physical: 0.1, goalkeeping: 0.8 },
  DF: { pace: 0.15, shooting: 0, passing: 0.15, dribbling: 0.1, defending: 0.4, physical: 0.2, goalkeeping: 0 },
  MF: { pace: 0.1, shooting: 0.1, passing: 0.35, dribbling: 0.2, defending: 0.1, physical: 0.15, goalkeeping: 0 },
  FW: { pace: 0.2, shooting: 0.4, passing: 0.05, dribbling: 0.2, defending: 0, physical: 0.15, goalkeeping: 0 },
};
