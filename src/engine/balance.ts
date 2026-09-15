import type { Curve } from "./curves";
import type { AttributeName, Position } from "./generation";
import type { Outcome } from "./match";

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

// ------------------------------------------------------------------ Match: team strength

/** Weight of each attribute in a player's attacking value, by the slot they play in. */
export const ATTACK_WEIGHTS: Readonly<Record<Position, Partial<Record<AttributeName, number>>>> = {
  GK: { passing: 1 },
  DF: { passing: 0.4, pace: 0.3, physical: 0.3 },
  MF: { passing: 0.45, dribbling: 0.35, shooting: 0.2 },
  FW: { shooting: 0.5, dribbling: 0.25, pace: 0.25 },
};

/** Weight of each attribute in a player's defensive value, by the slot they play in. */
export const DEFENSE_WEIGHTS: Readonly<Record<Position, Partial<Record<AttributeName, number>>>> = {
  GK: { goalkeeping: 1 },
  DF: { defending: 0.6, physical: 0.25, pace: 0.15 },
  MF: { defending: 0.5, physical: 0.3, passing: 0.2 },
  FW: { physical: 0.7, defending: 0.3 },
};

/** Share of each line in the team's attack and defense, split evenly between the slots of the line. */
export const ATTACK_LINE_WEIGHTS: Readonly<Record<Position, number>> = { GK: 0, DF: 0.15, MF: 0.35, FW: 0.5 };
export const DEFENSE_LINE_WEIGHTS: Readonly<Record<Position, number>> = { GK: 0.35, DF: 0.45, MF: 0.2, FW: 0 };

/** Form and morale (1–99) at which a player plays exactly at their attribute values. */
export const CONDITION_NEUTRAL = 50;

/** Strength change per point of form (±10 % at the extremes) and per point of morale (±5 %). */
export const STRENGTH_PER_FORM_POINT = 0.002;
export const STRENGTH_PER_MORALE_POINT = 0.001;

// ------------------------------------------------------------------ Match: goals

/** Expected goals of a team facing an equal opponent on neutral ground. */
export const BASE_GOALS_PER_TEAM = 1.35;

/** How sharply the attack / defense ratio turns into expected goals: ratio ^ exponent. */
export const STRENGTH_EXPONENT = 2.5;

/** Expected goals are multiplied by this factor at home and divided by it away. */
export const HOME_ADVANTAGE = 1.15;

/** Upper bound on a team's expected goals, whatever the gap between the teams. */
export const MAX_EXPECTED_GOALS = 6;

/** Chance that a goal has an assist. */
export const ASSIST_CHANCE = 0.75;

/** Weight of a slot in the draw of the scorer (multiplied by shooting). */
export const SCORER_SLOT_WEIGHTS: Readonly<Record<Position, number>> = { GK: 0, DF: 0.12, MF: 0.4, FW: 1 };

/** Weight of a slot in the draw of the assist provider (multiplied by passing). */
export const ASSIST_SLOT_WEIGHTS: Readonly<Record<Position, number>> = { GK: 0.02, DF: 0.35, MF: 1, FW: 0.6 };

// ------------------------------------------------------------------ Match: time, cards, injuries, substitutions

export const REGULATION_MINUTES = 90;

/** Stoppage time added to a match, drawn from 0 to this many minutes. */
export const MAX_STOPPAGE_MINUTES = 5;

/** Expected cards per team per match; a second yellow card sends the player off. */
export const YELLOW_CARDS_PER_TEAM = 1.8;
export const RED_CARDS_PER_TEAM = 0.05;

/** Weight of a slot in the draw of the booked player; goalkeepers are never booked. */
export const CARD_SLOT_WEIGHTS: Readonly<Record<Position, number>> = { GK: 0, DF: 1.3, MF: 1.1, FW: 0.7 };

/** Card weight multiplier for a player already booked, who plays carefully to avoid a second yellow card. */
export const BOOKED_PLAYER_CARD_FACTOR = 0.2;

/** Expected injuries per team per match, and their length in days. */
export const INJURIES_PER_TEAM = 0.12;
export const INJURY_DAYS_MIN = 7;
export const INJURY_DAYS_MAX = 42;

/** Substitutions per team, injuries included; tactical ones happen within this minute range. */
export const SUBSTITUTIONS_PER_TEAM = 3;
export const SUBSTITUTION_MINUTE_MIN = 55;
export const SUBSTITUTION_MINUTE_MAX = 85;

// ------------------------------------------------------------------ Form after a match

/** Form change for a player who took part, by the team's result. */
export const FORM_BY_OUTCOME: Readonly<Record<Outcome, number>> = { win: 4, draw: 0, loss: -4 };

/** Extra form change per goal and per assist, and when sent off. */
export const FORM_PER_GOAL = 3;
export const FORM_PER_ASSIST = 2;
export const FORM_SENT_OFF = -6;

/** A player who did not take part drifts back toward CONDITION_NEUTRAL by this much per match of the club. */
export const FORM_REST_DRIFT = 1;

/** Fitness (0–100) of a fully rested player, as at the start of a season. */
export const FULL_FITNESS = 100;

// ------------------------------------------------------------------ End-of-season progression
// Ages below are the player's age at the start of the next season.

/** Share of the growth room (potential − overall) gained over a season, by age: nothing left from 29. */
export const GROWTH_SHARE_BY_AGE: Curve = [
  [17, 0.35],
  [21, 0.3],
  [24, 0.2],
  [27, 0.1],
  [29, 0],
];

/** Age from which the potential no longer sits above the overall: it follows the overall. */
export const GROWTH_END_AGE = 29;

/** Multiplier of growth by minutes played over the season: training alone brings a quarter of it. */
export const GROWTH_BY_MINUTES: Curve = [
  [0, 0.25],
  [900, 0.6],
  [2250, 1],
];

/** Points lost over a season by age: none up to 30, then faster and faster. */
export const DECLINE_BY_AGE: Curve = [
  [30, 0],
  [31, 1],
  [33, 2.5],
  [35, 4],
  [38, 6],
];

/** How much faster each attribute falls when a player declines: physical qualities go first. */
export const DECLINE_ATTRIBUTE_FACTORS: Readonly<Record<AttributeName, number>> = {
  pace: 1.5,
  shooting: 1,
  passing: 0.8,
  dribbling: 1.1,
  defending: 1,
  physical: 1.3,
  goalkeeping: 1,
};

/** Maximum random change of a player's season (bell-shaped draw), and of each attribute on top of it. */
export const PROGRESSION_SPREAD = 2;
export const ATTRIBUTE_PROGRESSION_SPREAD = 1;

// ------------------------------------------------------------------ Retirement

/** Chance to retire at the end of a season, by age at the start of the next one: likely after 34, certain at 38. */
export const RETIREMENT_CHANCE_BY_AGE: Curve = [
  [33, 0],
  [34, 0.2],
  [35, 0.55],
  [36, 0.75],
  [37, 0.9],
  [38, 1],
];
