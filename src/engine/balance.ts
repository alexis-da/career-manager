import type { ChoiceKind } from "./choices";
import type { Curve } from "./curves";
import type { FormationName } from "./formations";
import type { AttributeName } from "./generation";
import type { Instruction, MatchEventType, Outcome } from "./match";
import type { ObjectiveOutcome } from "./objectives";
import type { Position, PositionGroup } from "./positions";
import type { CompetitionTier } from "./tiers";

// ------------------------------------------------------------------ Attribute generation

/** A value at a league's last club and at its champion; ranks in between are interpolated. */
export type RankRange = { readonly worst: number; readonly best: number };

/**
 * Club level (1–99) of a league's champion and of its last club, by tier: a second division's champion sits a little
 * above the first division's last club. The first division's range is the one of every save before the second ones.
 */
export const CLUB_LEVEL_BY_TIER: Readonly<Record<CompetitionTier, RankRange>> = {
  1: { worst: 60, best: 78 },
  2: { worst: 52, best: 64 },
};

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

/**
 * Offset of each attribute from the player's quality, by position: centre-backs defend and win duels, full-backs
 * run and defend, holding midfielders defend and pass, playmakers pass and dribble, wingers run and dribble,
 * strikers shoot and run. Weighted by OVERALL_WEIGHTS, each profile lands one to two points above the quality.
 */
export const POSITION_PROFILES: Readonly<Record<Position, Readonly<Record<AttributeName, number>>>> = {
  GK: { pace: -25, shooting: -35, passing: -15, dribbling: -25, defending: -20, physical: -5, goalkeeping: 3 },
  RB: { pace: 5, shooting: -20, passing: -4, dribbling: -6, defending: 2, physical: -2, goalkeeping: -60 },
  CB: { pace: -6, shooting: -25, passing: -8, dribbling: -15, defending: 4, physical: 3, goalkeeping: -60 },
  LB: { pace: 5, shooting: -20, passing: -4, dribbling: -6, defending: 2, physical: -2, goalkeeping: -60 },
  CDM: { pace: -6, shooting: -12, passing: 3, dribbling: -6, defending: 2, physical: 0, goalkeeping: -60 },
  CM: { pace: -3, shooting: -3, passing: 5, dribbling: 2, defending: -3, physical: 0, goalkeeping: -60 },
  CAM: { pace: -1, shooting: 0, passing: 2, dribbling: 2, defending: -22, physical: -6, goalkeeping: -60 },
  RM: { pace: 4, shooting: -6, passing: 3, dribbling: 1, defending: -10, physical: -5, goalkeeping: -60 },
  LM: { pace: 4, shooting: -6, passing: 3, dribbling: 1, defending: -10, physical: -5, goalkeeping: -60 },
  RW: { pace: 3, shooting: 0, passing: -6, dribbling: 3, defending: -30, physical: -6, goalkeeping: -60 },
  LW: { pace: 3, shooting: 0, passing: -6, dribbling: 3, defending: -30, physical: -6, goalkeeping: -60 },
  ST: { pace: 2, shooting: 3, passing: -8, dribbling: 0, defending: -30, physical: 0, goalkeeping: -60 },
};

/** Weight of each attribute in the overall rating, by position. Each row sums to 1. */
export const OVERALL_WEIGHTS: Readonly<Record<Position, Readonly<Record<AttributeName, number>>>> = {
  GK: { pace: 0, shooting: 0, passing: 0.1, dribbling: 0, defending: 0, physical: 0.1, goalkeeping: 0.8 },
  RB: { pace: 0.3, shooting: 0, passing: 0.15, dribbling: 0.1, defending: 0.35, physical: 0.1, goalkeeping: 0 },
  CB: { pace: 0.1, shooting: 0, passing: 0.1, dribbling: 0, defending: 0.5, physical: 0.3, goalkeeping: 0 },
  LB: { pace: 0.3, shooting: 0, passing: 0.15, dribbling: 0.1, defending: 0.35, physical: 0.1, goalkeeping: 0 },
  CDM: { pace: 0.05, shooting: 0, passing: 0.35, dribbling: 0.05, defending: 0.35, physical: 0.2, goalkeeping: 0 },
  CM: { pace: 0.1, shooting: 0.1, passing: 0.3, dribbling: 0.2, defending: 0.15, physical: 0.15, goalkeeping: 0 },
  CAM: { pace: 0.1, shooting: 0.2, passing: 0.35, dribbling: 0.35, defending: 0, physical: 0, goalkeeping: 0 },
  RM: { pace: 0.3, shooting: 0.05, passing: 0.25, dribbling: 0.3, defending: 0.05, physical: 0.05, goalkeeping: 0 },
  LM: { pace: 0.3, shooting: 0.05, passing: 0.25, dribbling: 0.3, defending: 0.05, physical: 0.05, goalkeeping: 0 },
  RW: { pace: 0.35, shooting: 0.2, passing: 0.1, dribbling: 0.35, defending: 0, physical: 0, goalkeeping: 0 },
  LW: { pace: 0.35, shooting: 0.2, passing: 0.1, dribbling: 0.35, defending: 0, physical: 0, goalkeeping: 0 },
  ST: { pace: 0.25, shooting: 0.45, passing: 0, dribbling: 0.15, defending: 0, physical: 0.15, goalkeeping: 0 },
};

// ------------------------------------------------------------------ Positions: familiarity with a slot

/** A player at their own position plays at their overall. */
export const SAME_POSITION_FAMILIARITY = 1;

/** A player at one of their secondary positions: almost their own, better than another position of the line. */
export const SECONDARY_POSITION_FAMILIARITY = 0.97;

/** Chances of a player having no, one or two secondary positions (a goalkeeper never has any). */
export const SECONDARY_POSITION_COUNT_WEIGHTS = [0.25, 0.55, 0.2] as const;

/**
 * Plausible secondary positions of each outfield position, the closest first. A player's secondary positions are
 * drawn from his primary position's list only.
 */
export const SECONDARY_POSITION_NEIGHBOURS: Readonly<Record<Position, readonly Position[]>> = {
  GK: [],
  RB: ["RM", "CB"],
  LB: ["LM", "CB"],
  CB: ["CDM", "RB", "LB"],
  CDM: ["CM", "CB"],
  CM: ["CDM", "CAM"],
  CAM: ["CM", "RW", "LW", "ST"],
  RM: ["RW", "RB"],
  LM: ["LW", "LB"],
  RW: ["RM", "ST", "LW"],
  LW: ["LM", "ST", "RW"],
  ST: ["CAM", "RW", "LW"],
};

/** Share of the overall a player keeps in a slot of another position, by their group and the slot's group. */
export const SAME_GROUP_FAMILIARITY = 0.92; // a centre-back at right-back, a winger up front
export const NEIGHBOUR_GROUP_FAMILIARITY = 0.8; // the next line: defence and midfield, midfield and attack
export const DISTANT_GROUP_FAMILIARITY = 0.6; // two lines apart: a defender up front, a forward at the back
export const GOAL_SWAP_FAMILIARITY = 0.4; // a goalkeeper outfield, an outfield player in goal

/** Familiarity between groups (the player's, then the slot's); a group's own entry applies to its other positions. */
export const GROUP_FAMILIARITY: Readonly<Record<PositionGroup, Readonly<Record<PositionGroup, number>>>> = {
  GK: { GK: SAME_POSITION_FAMILIARITY, DF: GOAL_SWAP_FAMILIARITY, MF: GOAL_SWAP_FAMILIARITY, FW: GOAL_SWAP_FAMILIARITY },
  DF: { GK: GOAL_SWAP_FAMILIARITY, DF: SAME_GROUP_FAMILIARITY, MF: NEIGHBOUR_GROUP_FAMILIARITY, FW: DISTANT_GROUP_FAMILIARITY },
  MF: { GK: GOAL_SWAP_FAMILIARITY, DF: NEIGHBOUR_GROUP_FAMILIARITY, MF: SAME_GROUP_FAMILIARITY, FW: NEIGHBOUR_GROUP_FAMILIARITY },
  FW: { GK: GOAL_SWAP_FAMILIARITY, DF: DISTANT_GROUP_FAMILIARITY, MF: NEIGHBOUR_GROUP_FAMILIARITY, FW: SAME_GROUP_FAMILIARITY },
};

// ------------------------------------------------------------------ Club finances at save creation
// Money follows the square of the rank strength (1 = champion, 0 = last club), so it concentrates at the
// top of each league; reputation follows the rank strength linearly.

/** Transfer budget in euros of a league's last club and of its champion, by tier. */
export const CLUB_BUDGET_BY_TIER: Readonly<Record<CompetitionTier, RankRange>> = {
  1: { worst: 5_000_000, best: 150_000_000 },
  2: { worst: 1_000_000, best: 20_000_000 },
};

/** Wage budget in euros per season of a league's last club and of its champion, by tier. */
export const CLUB_WAGE_BUDGET_BY_TIER: Readonly<Record<CompetitionTier, RankRange>> = {
  1: { worst: 20_000_000, best: 200_000_000 },
  2: { worst: 5_000_000, best: 30_000_000 },
};

/** Reputation (1–99) of a league's last club and of its champion, by tier. */
export const CLUB_REPUTATION_BY_TIER: Readonly<Record<CompetitionTier, RankRange>> = {
  1: { worst: 55, best: 90 },
  2: { worst: 40, best: 60 },
};

/** Budgets are rounded to this step, in euros. */
export const BUDGET_STEP = 100_000;

// ------------------------------------------------------------------ Reputation over the seasons (gameplay v2, V2)
// At the end of each season, a club's reputation follows its place against its expected rank, its reputation rank in
// its division (src/engine/reputation.ts): AI clubs and the managed club alike.

/** Reputation points per place a club finishes above its expected rank, or lost per place below it. */
export const REPUTATION_PER_PLACE = 1;

/** The most a season's places move a club's reputation, up or down, before a promotion or a relegation. */
export const REPUTATION_PLACES_CAP = 5;

/** Reputation a promoted club gains, and a relegated one loses, on top of its places. */
export const REPUTATION_MOVE = 4;

// ------------------------------------------------------------------ Season budgets (gameplay v2, V2)
// Each new season, every club gets a dotation from its board: the creation's finances (clubFinances) at its reputation
// rank in its new division, times a coefficient of its objectives, plus half of its unspent transfer budget; its wage
// budget is recalculated the same way, without the coefficient (src/engine/economy.ts, seasonFinances).

/** Share of a club's unspent transfer budget it keeps into the next season, on top of its dotation. */
export const BUDGET_CARRY_OVER_SHARE = 0.5;

/** A coefficient without objectives, in hundredths: the managed club of a save from before them, the first season. */
export const NEUTRAL_BUDGET_COEFFICIENT = 100;

/** The coefficient's range, in hundredths. */
export const BUDGET_COEFFICIENT_RANGE: RankRange = { worst: 70, best: 140 };

/** What each objective's outcome adds to the coefficient, in hundredths: the ranking's (every club's), the cup's and
 * the chosen objective's (the managed club's). */
export const RANKING_COEFFICIENT: Readonly<Record<ObjectiveOutcome, number>> = { EXCEEDED: 20, ACHIEVED: 10, MISSED: -15 };
export const CUP_COEFFICIENT: Readonly<Record<ObjectiveOutcome, number>> = { EXCEEDED: 10, ACHIEVED: 5, MISSED: -5 };
export const CHOSEN_COEFFICIENT: Readonly<Record<ObjectiveOutcome, number>> = { EXCEEDED: 10, ACHIEVED: 10, MISSED: 0 };

// ------------------------------------------------------------------ The ranking objective (gameplay v2, V2 and V3)
// Set from a club's expected rank, its reputation rank in its division (src/engine/objectives.ts).

/** In a first division, a club expected this high or higher is asked for the top three; exceeded: the title. */
export const TOP_OBJECTIVE_RANKS = 3;

/** In a second division, a club expected this high or higher is asked to go up; exceeded: the title. */
export const PROMOTION_OBJECTIVE_RANKS = 4;

/** Places above the relegation zone whose clubs are still asked only to stay up. */
export const SURVIVAL_OBJECTIVE_MARGIN = 3;

/** Otherwise, a club is asked to finish its expected rank plus this, or better, by division. */
export const FINISH_OBJECTIVE_MARGIN_BY_TIER: Readonly<Record<CompetitionTier, number>> = { 1: 2, 2: 3 };

/** Places better than its target a club must finish to exceed it (staying up: places above the relegation zone). */
export const EXCEEDED_OBJECTIVE_PLACES = 3;

// ------------------------------------------------------------------ Promotion and relegation (worldVersion 2)

/**
 * Clubs going up and down between a country's first and second divisions at the end of each season, by country (the
 * prefix of the competition code: "en" for en.1 and en.2). Direct moves only, no play-off: the N last of the first
 * division swap with the N first of the second, so both keep their size.
 */
export const PROMOTION_RELEGATION: Readonly<Record<string, number>> = {
  en: 3,
  es: 3,
  it: 3,
  de: 2,
  fr: 2,
};

// ------------------------------------------------------------------ National cups (worldVersion 2)

/**
 * A national cup gathers a country's first and second divisions in knockout ties: a preliminary round between its
 * 2 × (N − CUP_MAIN_DRAW) lowest clubs brings it to CUP_MAIN_DRAW, then round of 32, of 16, quarter-finals,
 * semi-finals and the final: CUP_ROUNDS rounds, N − 1 ties.
 */
export const CUP_MAIN_DRAW = 32;
export const CUP_ROUNDS = 6;

/**
 * Prize for each round won, the same in every division (euros, credited to the club's budget as the tie ends):
 * preliminary, round of 32, of 16, quarter-final, semi-final. A second division club reaching the semi-finals earns
 * some 3.9 M€, one to four times its budget; a great first division club hardly notices.
 */
export const CUP_ROUND_PRIZES: readonly number[] = [100_000, 250_000, 500_000, 1_000_000, 2_000_000];
export const CUP_WINNER_PRIZE = 5_000_000;
export const CUP_RUNNER_UP_PRIZE = 2_500_000;

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

/** Relative weight of each contract length, from 1 to 5 seasons. */
export const CONTRACT_YEARS_WEIGHTS: readonly number[] = [10, 25, 30, 25, 10];

/** Oldest age still offered a contract longer than LATE_CAREER_MAX_CONTRACT_YEARS. */
export const LONG_CONTRACT_MAX_AGE = 33;

/** Longest contract, in seasons, offered to a player older than LONG_CONTRACT_MAX_AGE. */
export const LATE_CAREER_MAX_CONTRACT_YEARS = 2;

// ------------------------------------------------------------------ Match: team strength

/** Weight of each attribute in a player's attacking value, by the group of the slot they play in. */
export const ATTACK_WEIGHTS: Readonly<Record<PositionGroup, Partial<Record<AttributeName, number>>>> = {
  GK: { passing: 1 },
  DF: { passing: 0.4, pace: 0.3, physical: 0.3 },
  MF: { passing: 0.45, dribbling: 0.35, shooting: 0.2 },
  FW: { shooting: 0.5, dribbling: 0.25, pace: 0.25 },
};

/** Weight of each attribute in a player's defensive value, by the group of the slot they play in. */
export const DEFENSE_WEIGHTS: Readonly<Record<PositionGroup, Partial<Record<AttributeName, number>>>> = {
  GK: { goalkeeping: 1 },
  DF: { defending: 0.6, physical: 0.25, pace: 0.15 },
  MF: { defending: 0.5, physical: 0.3, passing: 0.2 },
  FW: { physical: 0.7, defending: 0.3 },
};

/** Share of each line in the team's attack and defense, split evenly between the starters of the line. */
export const ATTACK_LINE_WEIGHTS: Readonly<Record<PositionGroup, number>> = { GK: 0, DF: 0.15, MF: 0.35, FW: 0.5 };
export const DEFENSE_LINE_WEIGHTS: Readonly<Record<PositionGroup, number>> = { GK: 0.35, DF: 0.45, MF: 0.2, FW: 0 };

/**
 * Multipliers of a team's attack and defense by formation: the 4-4-2 à plat and the 4-4-1-1 are neutral, more attack
 * always costs defense. The seven of gameplay v1 keep their values (G1); the ten of gameplay v2 start from its table
 * (docs/design/gameplay-v2.md, V1). AI clubs choose their formation (chooseFormation).
 */
export const FORMATION_PROFILES: Readonly<Record<FormationName, { readonly attack: number; readonly defense: number }>> = {
  "3-4-3": { attack: 1.05, defense: 0.95 },
  "4-3-3-attacking": { attack: 1.05, defense: 0.95 },
  "3-4-2-1": { attack: 1.04, defense: 0.96 },
  "4-2-3-1-narrow": { attack: 1.03, defense: 0.97 },
  "4-3-3": { attack: 1.03, defense: 0.97 },
  "4-3-3-flat": { attack: 1.02, defense: 0.98 },
  "4-2-3-1": { attack: 1.02, defense: 0.99 },
  "3-4-1-2": { attack: 1.02, defense: 0.98 },
  "3-5-2": { attack: 1.01, defense: 0.99 },
  "4-4-2-diamond": { attack: 1.01, defense: 0.99 },
  "4-4-2": { attack: 1, defense: 1 },
  "4-4-1-1": { attack: 1, defense: 1 },
  "4-3-3-defensive": { attack: 0.99, defense: 1.01 },
  "4-1-4-1": { attack: 0.98, defense: 1.02 },
  "4-4-2-defensive": { attack: 0.97, defense: 1.03 },
  "5-3-2": { attack: 0.95, defense: 1.05 },
  "5-4-1": { attack: 0.94, defense: 1.06 },
};

/** Form and morale (1–99) at which a player plays exactly at their attribute values. */
export const CONDITION_NEUTRAL = 50;

/** Strength change per point of form (±10 % at the extremes) and per point of morale (±5 %). */
export const STRENGTH_PER_FORM_POINT = 0.002;
export const STRENGTH_PER_MORALE_POINT = 0.001;

// ------------------------------------------------------------------ Match: goals

/**
 * Expected goals of a team facing an equal opponent on neutral ground, both in the neutral 4-4-2 à plat. Calibrated with
 * npm run measure:balance on complete seasons, fatigue included, AI clubs in the formation each chooses (chooseFormation:
 * an underdog closes the game, a favourite opens it, fewer goals on the whole than two 4-3-3s): 1.23 when they all played
 * the 4-3-3, 1.31 since gameplay v2 (V1), the six targets of docs/design/gameplay-v1.md where they were.
 */
export const BASE_GOALS_PER_TEAM = 1.31;

/**
 * When a match's goals come: the weight of each quarter of an hour of regular time in its expected goals, from kick-off
 * to the last one (stoppage time included), then of each period of extra time. Goals come late, as in real football:
 * legs tire, teams chasing the score open the match, stoppage time is played. The weights also make up for the
 * goalkeeper's slower wear, which keeps the defenses fresher than the attacks as a match goes on. Each list averages 1:
 * a match's goals stay BASE_GOALS_PER_TEAM's. Measured with npm run measure:balance, equal teams: 13.8, 15.3, 16.4, 16.6,
 * 17.2 and 20.6 % of the goals from the first quarter of an hour to the last, 45 and 55 % of extra time's (all at 1:
 * 18.1 % down to 14.7 %, 50 and 50 %).
 */
export const REGULATION_GOAL_WEIGHTS: readonly number[] = [0.76, 0.86, 0.96, 1.02, 1.02, 1.38];
export const EXTRA_TIME_GOAL_WEIGHTS: readonly number[] = [0.9, 1.1];

/** How sharply the attack / defense ratio turns into expected goals: ratio ^ exponent. */
export const STRENGTH_EXPONENT = 2.4;

/** Expected goals are multiplied by this factor at home and divided by it away. */
export const HOME_ADVANTAGE = 1.12;

/** Upper bound on a team's expected goals, whatever the gap between the teams. */
export const MAX_EXPECTED_GOALS = 6;

/**
 * An instruction's multipliers on the expected goals of the segments it is given for: the side's own, and its
 * opponent's. Attaquer opens the match, more goals on both sides; Fermer closes it, fewer on both. Measured with
 * npm run measure:balance (the other side following the assistant's rule): between equal teams, neither is more than
 * 0.015 point a match from Équilibré; behind from the 60th, Attaquer is worth more than Équilibré, one goal ahead from the
 * 75th, Fermer is; and the assistant's rule is within 0.01 point of every variant measured. A favourite gains from an
 * open match and an underdog from a closed one, whatever the multipliers.
 */
export const INSTRUCTION_EFFECTS: Readonly<Record<Instruction, { readonly own: number; readonly opponent: number }>> = {
  ATTACK: { own: 1.13, opponent: 1.15 },
  BALANCED: { own: 1, opponent: 1 },
  DEFEND: { own: 0.89, opponent: 0.89 },
};

/**
 * The assistant's rule, AI clubs' too: Attaquer when behind once this many minutes are played, Fermer when one goal
 * ahead once this many are, Équilibré otherwise. Read at the start of each segment.
 */
export const ASSISTANT_ATTACK_MINUTE = 60;
export const ASSISTANT_DEFEND_MINUTE = 75;

/** Chance that a goal has an assist. */
export const ASSIST_CHANCE = 0.75;

/** Weight of a slot's group in the draw of the scorer (multiplied by shooting). */
export const SCORER_SLOT_WEIGHTS: Readonly<Record<PositionGroup, number>> = { GK: 0, DF: 0.12, MF: 0.4, FW: 1 };

/** Weight of a slot's group in the draw of the assist provider (multiplied by passing). */
export const ASSIST_SLOT_WEIGHTS: Readonly<Record<PositionGroup, number>> = { GK: 0.02, DF: 0.35, MF: 1, FW: 0.6 };

// ------------------------------------------------------------------ Match: time, cards, injuries, substitutions

export const REGULATION_MINUTES = 90;

/**
 * The engine's unit of play, in minutes: six segments make regular time, one makes each period of extra time. Each gets
 * its share of the expected goals, cards and injuries, from the strengths at its start.
 */
export const SEGMENT_MINUTES = 15;

/**
 * Last minute of the first half, after three segments; half-time changes are dated the minute after. Stoppage time only
 * follows the last segment of the second half.
 */
export const HALF_TIME_MINUTE = 45;

/** Stoppage time added to a match, drawn from 0 to this many minutes. */
export const MAX_STOPPAGE_MINUTES = 5;

/** Expected cards per team per match; a second yellow card sends the player off. */
export const YELLOW_CARDS_PER_TEAM = 1.8;
export const RED_CARDS_PER_TEAM = 0.05;

/**
 * Suspensions: a sent-off player misses the club's next official match, whatever the competition; YELLOWS_PER_SUSPENSION
 * yellow cards in a competition, counted apart in the league and in the cup since the last suspension or the season's
 * start, suspend for its next match. The yellows of a match its player is sent off in do not count.
 */
export const YELLOWS_PER_SUSPENSION = 5;
export const SUSPENSION_MATCHES = 1;

/** Weight of a slot's group in the draw of the booked player; goalkeepers are never booked. */
export const CARD_SLOT_WEIGHTS: Readonly<Record<PositionGroup, number>> = { GK: 0, DF: 1.3, MF: 1.1, FW: 0.7 };

/** Card weight multiplier for a player already booked, who plays carefully to avoid a second yellow card. */
export const BOOKED_PLAYER_CARD_FACTOR = 0.2;

/** Expected injuries per team per match, and their length in days. */
export const INJURIES_PER_TEAM = 0.12;
export const INJURY_DAYS_MIN = 7;
export const INJURY_DAYS_MAX = 42;

/** Substitutions a team may make in a match, half-time, injury and tactical ones together. */
export const MAX_SUBSTITUTIONS = 5;

/**
 * The windows a manager may substitute in during play, the real rule: half-time and the breaks before and in the middle of
 * extra time are not windows, and an injured player's replacement, made at once, takes none. Every tactical substitution
 * during play counts, the assistant's and a choice event's included, but the rule only binds a manager making his own.
 */
export const MAX_SUBSTITUTION_WINDOWS = 3;

/**
 * Tactical substitutions each team plans in the second half, within this minute range, while substitutions remain.
 * An injured player is replaced at once.
 */
export const SUBSTITUTIONS_PER_TEAM = 3;
export const SUBSTITUTION_MINUTE_MIN = 55;
export const SUBSTITUTION_MINUTE_MAX = 85;

// ------------------------------------------------------------------ Knockout matches: extra time and shoot-out

/** A knockout match level after 90 minutes plays two periods of extra time, 91' to 105' and 106' to 120'. */
export const EXTRA_TIME_PERIOD_MINUTES = 15;
export const EXTRA_TIME_END_MINUTE = REGULATION_MINUTES + 2 * EXTRA_TIME_PERIOD_MINUTES;

/**
 * Goals in extra time, against the same minutes of a regular match. At 1, as many as in regular time: with some 21 %
 * of cup ties level after 90 minutes, about half of them stay level and 10 % go to a shoot-out (measured at 0.8:
 * 11.5 %; at 1.2: 9.2 %). Pinned in match-cup.slow.test.ts.
 */
export const EXTRA_TIME_INTENSITY = 1;

/** One more substitution in extra time, and the tactical change each team makes with it in its first period. */
export const EXTRA_TIME_SUBSTITUTIONS = 1;

/**
 * Shoot-out: five kicks each, then one each until one side misses; a kick's chance is SHOOTOUT_BASE_CHANCE, moved by
 * the kicker's shooting and the goalkeeper's goalkeeping away from SHOOTOUT_REFERENCE_RATING, within the bounds.
 */
export const SHOOTOUT_KICKS = 5;
export const SHOOTOUT_BASE_CHANCE = 0.75;
export const SHOOTOUT_REFERENCE_RATING = 70;
export const SHOOTOUT_KICKER_FACTOR = 0.004; // per point of shooting
export const SHOOTOUT_KEEPER_FACTOR = 0.004; // per point of goalkeeping
export const SHOOTOUT_MIN_CHANCE = 0.55;
export const SHOOTOUT_MAX_CHANCE = 0.9;

// ------------------------------------------------------------------ Match: choice events (gameplay v1, G4)

/**
 * The managed club's matches only. How many choice events a match has, 1, 2 or 3, with these chances; the boundaries of
 * regular time they come at, drawn among these without repeat; and the chance of one at 105' when a cup tie goes to
 * extra time. All drawn at kick-off from the match's stream …:events.
 */
export const CHOICE_EVENT_COUNT_WEIGHTS: readonly number[] = [35, 45, 20];
export const CHOICE_EVENT_MINUTES: readonly number[] = [15, 30, 60, 75];
export const EXTRA_TIME_CHOICE_EVENT_CHANCE = 0.5;

/**
 * The goals of the managed club's choice events are taken from its match's: its expected goals are multiplied by this
 * in every segment, so that its events, decided by its assistant, give it nothing by themselves (a penalty or a free kick
 * scores goals the club would otherwise have scored in play). Its decisions win or lose points around that.
 */
export const OWN_GOALS_WITH_CHOICE_EVENTS = 0.89;

/** The weight of each kind of event among those possible at its boundary. */
export const CHOICE_EVENT_WEIGHTS: Readonly<Record<ChoiceKind, number>> = {
  PENALTY: 3,
  FREE_KICK: 12,
  HOTHEAD: 14,
  SCUFFLE: 10,
  KNOCK: 12,
  EXHAUSTED: 20,
  LEADING: 24,
  CHASING: 24,
};

/** Penalty: the best shooters on the pitch offered as takers, each kick's chance as in a shoot-out (shootoutChance). */
export const PENALTY_TAKERS = 3;

/**
 * Dangerous free kick: a direct shot's chance, from the taker's shooting and the goalkeeper's goalkeeping away from the
 * reference ratings, within the bounds; a worked combination multiplies the side's expected goals in the next segment.
 * The assistant shoots when his best shooter has FREE_KICK_ASSISTANT_SHOOTING.
 */
export const FREE_KICK_BASE_CHANCE = 0.13;
export const FREE_KICK_REFERENCE_SHOOTING = 75;
export const FREE_KICK_REFERENCE_GOALKEEPING = 70;
export const FREE_KICK_KICKER_FACTOR = 0.005; // per point of shooting
export const FREE_KICK_KEEPER_FACTOR = 0.004; // per point of goalkeeping
export const FREE_KICK_MIN_CHANCE = 0.08;
export const FREE_KICK_MAX_CHANCE = 0.18;
export const FREE_KICK_COMBINATION_GOALS = 1.5;
export const FREE_KICK_ASSISTANT_SHOOTING = 75;

/** A booked player losing his temper, from this minute: kept on, he is sent off in the next segment with this chance. */
export const HOTHEAD_MINUTE = 30;
export const HOTHEAD_RED_CHANCE = 0.12;

/**
 * A scuffle: protesting multiplies the side's expected goals in the next segment with the first chance, and books its
 * captain (the best outfield player on the pitch) with the second.
 */
export const PROTEST_GOALS = 1.08;
export const PROTEST_GOALS_CHANCE = 0.5;
export const PROTEST_YELLOW_CHANCE = 0.3;

/**
 * A knock: played on, the player keeps KNOCK_SHARE of his share of strength until he goes off, and gets injured in the
 * rest of the match with this chance, for these days.
 */
export const KNOCK_SHARE = 0.85;
export const KNOCK_INJURY_CHANCE = 0.25;
export const KNOCK_INJURY_DAYS_MIN = 7;
export const KNOCK_INJURY_DAYS_MAX = 21;

/**
 * An exhausted player, from this minute: one who has lost this much fitness on the pitch. Kept on, he gets injured in
 * the rest of the match with this chance, for INJURY_DAYS_MIN to INJURY_DAYS_MAX days.
 */
export const EXHAUSTED_MINUTE = 75;
export const EXHAUSTED_FITNESS_LOST = 25;
export const EXHAUSTED_INJURY_CHANCE = 0.1;

/** The tactical events: at these boundaries; « Tu mènes » one or two goals ahead, « Tu es mené ou à égalité » otherwise. */
export const TACTICAL_CHOICE_MINUTES: readonly number[] = [60, 75];
export const LEADING_MAX_MARGIN = 2;

// ------------------------------------------------------------------ Match events kept in the database

/**
 * Event types written for a match without the managed club. Only its goals are ever shown (the other matches' scores
 * during a live match); season stats, form and injuries come from the whole match in memory, before this filter.
 * The managed club's matches keep every event. Three quarters of a season's events go otherwise.
 */
export const OTHER_MATCH_EVENT_TYPES: readonly MatchEventType[] = ["GOAL"];

// ------------------------------------------------------------------ Form after a match

/** Form change for a player who took part, by the team's result. */
export const FORM_BY_OUTCOME: Readonly<Record<Outcome, number>> = { win: 2, draw: 0, loss: -2 };

/** Extra form change per goal and per assist, and when sent off. */
export const FORM_PER_GOAL = 1.5;
export const FORM_PER_ASSIST = 1;
export const FORM_SENT_OFF = -3;

/** A player who did not take part drifts back toward CONDITION_NEUTRAL by this much per match of the club. */
export const FORM_REST_DRIFT = 1;

/**
 * After each match of his club, a player's form keeps this share of its gap to CONDITION_NEUTRAL: a run of results
 * moves it, never to the bounds.
 */
export const FORM_RETENTION = 0.94;

// ------------------------------------------------------------------ Fatigue

/** Fitness (0–100) of a fully rested player, as at the start of a season. */
export const FULL_FITNESS = 100;

/**
 * Freshness: a player's share of his team's strength is multiplied by 1 − this × (FULL_FITNESS − his fitness at
 * kick-off): 0.9775 at 85, what the days since his last match have not given back.
 */
export const STRENGTH_PER_FITNESS_POINT = 0.0015;

/**
 * Wear: and by 1 − this × the fitness he has lost on the pitch since kick-off, read when each segment starts: a starter
 * who has played an hour (20 points) gives way to a fresh substitute at a real loss. 0.010 since goals come late
 * (REGULATION_GOAL_WEIGHTS), which gives a substitute's last half hour more weight: 0.011 made him worth 0.04 point.
 */
export const STRENGTH_PER_WEAR_POINT = 0.01;

/** Fitness lost per segment (15 minutes) on the pitch: an outfield player, a goalkeeper. 30 for a whole match. */
export const FITNESS_LOSS_PER_SEGMENT = 5;
export const GOALKEEPER_FITNESS_LOSS_PER_SEGMENT = 1.5;

/** Fitness recovered each day, up to FULL_FITNESS: a starter of a whole match is fresh again six days later. */
export const FITNESS_RECOVERY_PER_DAY = 5;

/** Below this fitness, a player's injury risk grows by 1 / INJURY_RISK_FITNESS_SPAN per point: twice as high at 40. */
export const INJURY_RISK_FITNESS = 70;
export const INJURY_RISK_FITNESS_SPAN = 30;

/**
 * AI clubs' lineups: a player below ROTATION_FITNESS gives way to the best rested player (at or above it) rated at most
 * ROTATION_MAX_RATING_GAP below him in the slot.
 */
export const ROTATION_FITNESS = 75;
export const ROTATION_MAX_RATING_GAP = 5;

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

// ------------------------------------------------------------------ Squads (AI clubs)

/** Squad size every club aims for, and the goalkeepers it needs. */
export const SQUAD_SIZE_MIN = 20;
export const SQUAD_SIZE_MAX = 25;
export const MIN_GOALKEEPERS = 2;

/** A line of the squad template: positions that stand in for each other, and the players they need together. */
export type SquadRole = { positions: readonly Position[]; count: number };

/**
 * Players per role in a complete squad (23 in all), as in the world squads: world squads, young players and the
 * free agent pool follow these proportions, and AI clubs sign to fill them. Never reorder: it is the order of the
 * world squads' slots.
 */
export const SQUAD_ROLES: readonly SquadRole[] = [
  { positions: ["GK"], count: 2 },
  { positions: ["RB"], count: 2 },
  { positions: ["CB"], count: 4 },
  { positions: ["LB"], count: 2 },
  { positions: ["CDM"], count: 2 },
  { positions: ["CM"], count: 3 },
  { positions: ["CAM"], count: 2 },
  { positions: ["RM", "RW"], count: 2 },
  { positions: ["LM", "LW"], count: 2 },
  { positions: ["ST"], count: 2 },
];

/** Squad standard: mean overall of the club's best players, the bar for keeping a player. */
export const SQUAD_STANDARD_SIZE = 16;

/** An expiring contract is renewed when the player is rated at least the squad standard minus this. */
export const RENEWAL_RATING_MARGIN = 5;

/** Oldest age renewed with that margin; older players must reach the squad standard itself. */
export const RENEWAL_MAX_AGE = 32;

/** Players up to this age are also renewed when their potential reaches the squad standard. */
export const PROSPECT_MAX_AGE = 23;

// ------------------------------------------------------------------ Youth arrivals and leaving the world

/** Young players joining every club at each preseason. */
export const YOUTH_PLAYERS_PER_CLUB = 2;

/** Age of a young player on arrival (1 July). */
export const YOUTH_AGE_MIN = 16;
export const YOUTH_AGE_MAX = 18;

/** Overall of a young player at the least and at the most reputed club, and the random spread around it. */
export const YOUTH_OVERALL_MIN = 45;
export const YOUTH_OVERALL_MAX = 60;

/**
 * The same by tier: a club's reputation is placed within its own division's range (CLUB_REPUTATION_BY_TIER), then
 * turned into the young player's overall within his division's range. The first division's is the one above.
 */
export const YOUTH_OVERALL_BY_TIER: Readonly<Record<CompetitionTier, RankRange>> = {
  1: { worst: YOUTH_OVERALL_MIN, best: YOUTH_OVERALL_MAX },
  2: { worst: 42, best: 55 },
};
export const YOUTH_OVERALL_SPREAD = 3;

/** Potential of a young player: overall plus a gap drawn in this range. */
export const YOUTH_POTENTIAL_GAP_MIN = 15;
export const YOUTH_POTENTIAL_GAP_MAX = 30;

/** Share of young players holding the nationality of their club's country. */
export const YOUTH_HOME_NATIONALITY_SHARE = 0.85;

/** First contract of a young player, in seasons. */
export const YOUTH_CONTRACT_YEARS = 3;

/** A free agent still without a club at the next preseason leaves the world, unless rated above this. */
export const FREE_AGENT_STAY_MIN_OVERALL = 65;

/** Free agents of the initial pool, without a club when the save starts, are rated from this… */
export const FREE_AGENT_POOL_OVERALL_MIN = 50;
/** …to this, in every save… */
export const FREE_AGENT_POOL_OVERALL_MAX = 66;
/** …except this share of them, rated above, up to FREE_AGENT_POOL_TOP_OVERALL_MAX. */
export const FREE_AGENT_POOL_TOP_SHARE = 0.1;
export const FREE_AGENT_POOL_TOP_OVERALL_MAX = 70;

// ------------------------------------------------------------------ Transfer market

/** Share of the market value a club asks for a player, by seasons left on his contract, this one included. */
export const ASKING_PRICE_BY_SEASONS_LEFT: Curve = [
  [1, 0.6],
  [2, 0.9],
  [3, 1.1],
  [4, 1.3],
];

/** Raise over his current wage a player under contract wants before changing clubs. */
export const TRANSFER_MIN_WAGE_RAISE = 0.1;

/** Share of his market wage a free agent accepts. */
export const FREE_AGENT_MIN_WAGE_SHARE = 0.9;

/** A player joins no club whose reputation is more than this below his own overall… */
export const PLAYER_REPUTATION_MARGIN = 15;

/** …nor more than this below the reputation of the club he leaves. */
export const REPUTATION_STEP_DOWN = 10;

/** Share of the wages left on his contract a released player receives from the club. */
export const RELEASE_COMPENSATION_SHARE = 0.5;

/** Bids for a player put on sale: at most this many AI clubs, each offering a drawn share of his market value. */
export const SALE_MAX_BIDDERS = 5;
export const SALE_BID_SHARE_MIN = 0.8;
export const SALE_BID_SHARE_MAX = 1.2;

/**
 * An AI club whose payroll is above its wage budget (a relegated club, typically) sells its best-paid players to other
 * AI clubs in the preseason until it is back within it, never for less than this share of a player's market value.
 */
export const WAGE_SALE_MIN_FEE_SHARE = 0.8;

// ------------------------------------------------------------------ Faces (src/engine/face.ts)
// A face is drawn once from the player's key; only the hair changes with age, and never back.

/** Relative weight of each hair color but gray (black, dark brown, brown, auburn, blond). */
export const HAIR_COLOR_WEIGHTS: readonly number[] = [35, 25, 20, 8, 12];

/** Relative weight of each kind of facial hair (none, stubble, moustache, beard). */
export const FACIAL_HAIR_WEIGHTS: readonly number[] = [45, 25, 10, 20];

/** Gray hair is only possible above this age. */
export const GRAY_HAIR_MIN_AGE = 33;

/** Chance of gray hair by age, above GRAY_HAIR_MIN_AGE. */
export const GRAY_HAIR_CHANCE_BY_AGE: Curve = [
  [33, 0],
  [36, 0.25],
  [40, 0.6],
];

/** Chance of being bald by age: a few shaved heads among the young, more and more after 30. */
export const BALD_CHANCE_BY_AGE: Curve = [
  [17, 0.03],
  [27, 0.06],
  [33, 0.15],
  [38, 0.35],
];

/** Share of players whose hair is one of the styles added later (wavy, short afro, tied back, fade). */
export const LATER_HAIR_STYLE_SHARE = 4 / 11;

/** Relative weight of each eye color (brown, blue, green). */
export const EYE_COLOR_WEIGHTS: readonly number[] = [60, 22, 18];

/** Rare features: glasses, a headband, a scar through an eyebrow. */
export const GLASSES_CHANCE = 0.04;
export const HEADBAND_CHANCE = 0.03;
export const BROW_SCAR_CHANCE = 0.02;

/** Wrinkles at the corners of the eyes are only possible above this age. */
export const WRINKLES_MIN_AGE = 30;

/** Chance of wrinkles at the corners of the eyes by age, above WRINKLES_MIN_AGE. */
export const WRINKLES_CHANCE_BY_AGE: Curve = [
  [30, 0],
  [34, 0.35],
  [38, 0.7],
];

// Season rating (src/engine/season-result.ts). The game keeps no rating per match: the season rating, out of 10, is
// read from the season's statistics alone, so that it can be computed again from PlayerSeasonStats at any time.

/** Season rating of a player who played without scoring, assisting or being booked. */
export const SEASON_RATING_BASE = 6;
/** Added per goal per appearance: a goal every other match adds 0.6. */
export const SEASON_RATING_GOAL = 1.2;
/** Added per assist per appearance. */
export const SEASON_RATING_ASSIST = 0.8;
/** Added for full matches: times the share of 90 minutes played per appearance, so a regular starter gets it all. */
export const SEASON_RATING_MINUTES = 0.6;
/** Taken off per yellow card per appearance. */
export const SEASON_RATING_YELLOW_CARD = 0.15;
/** Taken off per red card per appearance. */
export const SEASON_RATING_RED_CARD = 1;
/** Bounds of the season rating. */
export const SEASON_RATING_MIN = 1;
export const SEASON_RATING_MAX = 10;

/** Appearances a player needs in the season to be its best player. */
export const BEST_PLAYER_MIN_APPEARANCES = 10;
