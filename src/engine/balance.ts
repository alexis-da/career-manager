import type { Curve } from "./curves";
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
export const AGE_QUALITY_CURVE: Curve = [
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
export const AGE_GROWTH_CURVE: Curve = [
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

// ------------------------------------------------------------------ Club finances at save creation
// Money follows the square of the rank strength (1 = champion, 0 = last club), so it concentrates at the
// top of each league; reputation follows the rank strength linearly.

/** Transfer budget in euros of a league's last club and of its champion. */
export const CLUB_BUDGET_WORST = 5_000_000;
export const CLUB_BUDGET_BEST = 150_000_000;

/** Wage budget in euros per season of a league's last club and of its champion. */
export const CLUB_WAGE_BUDGET_WORST = 20_000_000;
export const CLUB_WAGE_BUDGET_BEST = 200_000_000;

/** Reputation (1–99) of a league's last club and of its champion. */
export const CLUB_REPUTATION_WORST = 55;
export const CLUB_REPUTATION_BEST = 90;

/** Budgets are rounded to this step, in euros. */
export const BUDGET_STEP = 100_000;

// ------------------------------------------------------------------ Player contracts at save creation

/** Market value in euros by overall rating. */
export const MARKET_VALUE_BY_OVERALL: Curve = [
  [40, 50_000],
  [50, 300_000],
  [60, 1_500_000],
  [68, 6_000_000],
  [75, 20_000_000],
  [82, 50_000_000],
  [88, 100_000_000],
  [99, 180_000_000],
];

/** Market value multiplier by age: young players are priced on their future, veterans lose value fast. */
export const MARKET_VALUE_AGE_FACTOR: Curve = [
  [17, 1.2],
  [21, 1.4],
  [24, 1.3],
  [27, 1],
  [30, 0.7],
  [33, 0.35],
  [36, 0.15],
];

/** Extra market value, as a share, per point of growth room (potential − overall). */
export const MARKET_VALUE_PER_GROWTH_POINT = 0.02;

/** Market values are rounded to this step, in euros. */
export const MARKET_VALUE_STEP = 10_000;

/** Wage in euros per season by overall rating. */
export const WAGE_BY_OVERALL: Curve = [
  [40, 40_000],
  [50, 120_000],
  [60, 400_000],
  [68, 1_200_000],
  [75, 3_000_000],
  [82, 7_000_000],
  [88, 12_000_000],
  [99, 20_000_000],
];

/** Wage multiplier by age: first professional contracts are cheap. */
export const WAGE_AGE_FACTOR: Curve = [
  [17, 0.3],
  [20, 0.6],
  [23, 0.9],
  [25, 1],
];

/** Wages are rounded to this step, in euros. */
export const WAGE_STEP = 1_000;

/** Longest contract, in seasons, by age (rounded); the actual length is drawn from 1 to this value. */
export const CONTRACT_MAX_YEARS_BY_AGE: Curve = [
  [29, 5],
  [31, 3],
  [33, 2],
  [35, 1],
];
