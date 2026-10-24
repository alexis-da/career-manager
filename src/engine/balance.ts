import type { Curve } from "./curves";
import type { AttributeName } from "./generation";
import type { MatchEventType, Outcome } from "./match";
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

/** Form and morale (1–99) at which a player plays exactly at their attribute values. */
export const CONDITION_NEUTRAL = 50;

/** Strength change per point of form (±10 % at the extremes) and per point of morale (±5 %). */
export const STRENGTH_PER_FORM_POINT = 0.002;
export const STRENGTH_PER_MORALE_POINT = 0.001;

// ------------------------------------------------------------------ Match: goals

/** Expected goals of a team facing an equal opponent on neutral ground. */
export const BASE_GOALS_PER_TEAM = 1.42;

/** How sharply the attack / defense ratio turns into expected goals: ratio ^ exponent. */
export const STRENGTH_EXPONENT = 2.5;

/** Expected goals are multiplied by this factor at home and divided by it away. */
export const HOME_ADVANTAGE = 1.15;

/** Upper bound on a team's expected goals, whatever the gap between the teams. */
export const MAX_EXPECTED_GOALS = 6;

/** Chance that a goal has an assist. */
export const ASSIST_CHANCE = 0.75;

/** Weight of a slot's group in the draw of the scorer (multiplied by shooting). */
export const SCORER_SLOT_WEIGHTS: Readonly<Record<PositionGroup, number>> = { GK: 0, DF: 0.12, MF: 0.4, FW: 1 };

/** Weight of a slot's group in the draw of the assist provider (multiplied by passing). */
export const ASSIST_SLOT_WEIGHTS: Readonly<Record<PositionGroup, number>> = { GK: 0.02, DF: 0.35, MF: 1, FW: 0.6 };

// ------------------------------------------------------------------ Match: time, cards, injuries, substitutions

export const REGULATION_MINUTES = 90;

/**
 * Last minute of the first half. Each half gets half of the expected goals, cards and injuries; stoppage time
 * only follows the second half. Half-time changes are dated the minute after.
 */
export const HALF_TIME_MINUTE = 45;

/** Stoppage time added to a match, drawn from 0 to this many minutes. */
export const MAX_STOPPAGE_MINUTES = 5;

/** Expected cards per team per match; a second yellow card sends the player off. */
export const YELLOW_CARDS_PER_TEAM = 1.8;
export const RED_CARDS_PER_TEAM = 0.05;

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
 * Tactical substitutions each team plans in the second half, within this minute range, while substitutions remain.
 * A player injured in the first half is replaced at half-time, one injured in the second half at once.
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

// ------------------------------------------------------------------ Match events kept in the database

/**
 * Event types written for a match without the managed club. Only its goals are ever shown (the other matches' scores
 * during a live match); season stats, form and injuries come from the whole match in memory, before this filter.
 * The managed club's matches keep every event. Three quarters of a season's events go otherwise.
 */
export const OTHER_MATCH_EVENT_TYPES: readonly MatchEventType[] = ["GOAL"];

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
