import type { ChoiceKind } from "./choices";
import type { Curve } from "./curves";
import type { FormationName } from "./formations";
import type { AttributeName } from "./generation";
import type { Instruction, Outcome } from "./match";
import type { NationCode } from "./nations";
import type { ObjectiveOutcome, ObjectiveProgress } from "./objectives";
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
// At the end of each season, a club's reputation goes part of the way to its target, the reputation the creation gives
// the club ranked where it finished in its division; a promoted or relegated club takes outright the reputation of its
// equivalent rank in its new division (src/engine/reputation.ts). AI clubs and the managed club alike.

/**
 * Share of the way to its target the reputation of a club staying in its division goes each season. A division's targets
 * being its creation's reputations, one a rank, its reputations keep their spread (npm run measure:seasons, « Étalement
 * des réputations »).
 */
export const REPUTATION_TARGET_SHARE = 0.25;

// ------------------------------------------------------------------ Season budgets (gameplay v2, V2)
// Each new season, every club gets a dotation from its board: the creation's finances (clubFinances) at its reputation
// rank in its new division, times a coefficient of its objectives, plus, for the managed club alone, half of its unspent
// transfer budget; its wage budget is its payroll times a margin, between half of the creation's at that rank and all
// of it (src/engine/economy.ts, seasonFinances).

/**
 * Share of the managed club's unspent transfer budget it keeps into the next season, on top of its dotation. AI clubs
 * keep nothing: each season starts from its dotation, which a budget never spent would otherwise double.
 */
export const BUDGET_CARRY_OVER_SHARE = 0.5;

/** A coefficient without objectives, in hundredths: the managed club of a save from before them, the first season. */
export const NEUTRAL_BUDGET_COEFFICIENT = 100;

/** The coefficient's range, in hundredths. */
export const BUDGET_COEFFICIENT_RANGE: RankRange = { worst: 70, best: 140 };

/**
 * A club's wage budget, as a multiple of its payroll (the season's, or the squad's at the creation): what it may add in
 * wages, about two to four typical signings. Never above the creation's wage budget at its rank (CLUB_WAGE_BUDGET_BY_TIER),
 * which alone left room for twenty.
 */
export const WAGE_BUDGET_MARGIN = 1.2;

/** The managed club's margin at the ends of its objectives' coefficient (70 and 140): WAGE_BUDGET_MARGIN at 100. */
export const MANAGED_WAGE_MARGIN_RANGE: RankRange = { worst: 1.1, best: 1.3 };

/**
 * The least a club's wage budget is, as a share of the creation's at its rank (CLUB_WAGE_BUDGET_BY_TIER): a club whose
 * payroll fell, having sold a lot or seen its contracts run out, keeps enough to rebuild.
 */
export const WAGE_BUDGET_FLOOR_SHARE = 0.5;

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

/**
 * Otherwise, a club is asked to finish its expected rank plus this, or better, by division. The cahier started at +2
 * and +3; measured over five seasons (npm run measure:seasons), the ranking objective was then met 69 % of the time,
 * against a target of about one season in two: at its expected rank, 55 %.
 */
export const FINISH_OBJECTIVE_MARGIN_BY_TIER: Readonly<Record<CompetitionTier, number>> = { 1: 0, 2: 0 };

/** Places better than its target a club must finish to exceed it (staying up: places above the relegation zone). */
export const EXCEEDED_OBJECTIVE_PLACES = 3;

// ------------------------------------------------------------------ Objectives of the season (gameplay v2, V3)
// The managed club's: the ranking and the cup imposed, one more chosen among three of four proposed
// (src/engine/objectives.ts, src/db/objectives.ts).

/**
 * The cup round to reach (1 preliminary … 6 final) by division and reputation third: the quarter-finals, the round of
 * 16 and the round of 32 for a first division's thirds; the round of 32 for a second division's best third, nothing
 * named for the others (0: one round past their entry). Always at least one round past the club's entry, so that no
 * objective is reached at the draw.
 */
export const CUP_OBJECTIVE_ROUNDS: Readonly<Record<CompetitionTier, readonly [number, number, number]>> = {
  1: [4, 3, 2],
  2: [2, 0, 0],
};

/** Rounds beyond its target a club must reach to exceed its cup objective. */
export const CUP_OBJECTIVE_EXCEEDED_ROUNDS = 2;

/** Jeunesse: a player this old or younger on the season's first day… */
export const YOUTH_OBJECTIVE_MAX_AGE = 21;
/** …with at least this many league starts. */
export const YOUTH_OBJECTIVE_STARTS = 15;

/**
 * A season's goals, as a share of the engine's expected goals against the division's average opponent: measured over
 * five seasons (npm run measure:seasons), clubs score 94 % and concede 91 % of them (fatigue, injuries, rotations,
 * the opponents' own choice of formation). Without it, Spectacle was met 15 % of the time and Solidité 48 %; with it,
 * both 31 %.
 */
export const EXPECTED_SEASON_GOALS_FACTOR = 0.93;

/** Spectacle: league goals scored at least the season's expected goals times this. */
export const ENTERTAINMENT_OBJECTIVE_FACTOR = 1.1;

/** Solidité: league goals conceded at most the season's expected goals against times this. */
export const SOLIDITY_OBJECTIVE_FACTOR = 0.9;

/** The president's confidence (1–99): this, plus each objective's points for where it stands. */
export const BOARD_CONFIDENCE_BASE = 50;

/**
 * Points of the president's confidence by objective (the ranking, the cup, the European one, the chosen one) and where
 * it stands. The European objective counts as the cup's.
 */
export const BOARD_CONFIDENCE_POINTS: Readonly<
  Record<"ranking" | "cup" | "europe" | "chosen", Readonly<Record<ObjectiveProgress, number>>>
> = {
  ranking: { EXCEEDED: 30, ACHIEVED: 20, ON_TRACK: 5, AT_RISK: -10, MISSED: -25 },
  cup: { EXCEEDED: 15, ACHIEVED: 10, ON_TRACK: 2, AT_RISK: -5, MISSED: -10 },
  europe: { EXCEEDED: 15, ACHIEVED: 10, ON_TRACK: 2, AT_RISK: -5, MISSED: -10 },
  chosen: { EXCEEDED: 10, ACHIEVED: 10, ON_TRACK: 2, AT_RISK: -5, MISSED: -10 },
};

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

// ------------------------------------------------------------------ European competitions (worldVersion 2, docs/design/europe.md)
// The Coupe des Lauriers (eu.1) gathers each country's first four, the Coupe des Fanions (eu.2) its 5th, 6th and cup
// winner (src/engine/europe.ts): a league phase, then knockout ties, single-leg, the final on neutral ground.

/** What a European competition pays a club, in euros, credited to its budget as it earns it. */
export type EuropePrizes = {
  participation: number; // at the opening
  leagueWin: number; // each league phase win
  quarterFinalQualification: number; // the top four of the league phase, and each play-off winner
  quarterFinalWin: number;
  semiFinalWin: number;
  finalWin: number;
  finalLoss: number;
};

/**
 * Prizes by competition: a perfect run is worth 23.6 M€ in the Coupe des Lauriers (16 to 23 % of its clubs' creation
 * budgets), 10 M€ in the Coupe des Fanions; a typical one, two wins and out in the play-offs, 4.2 and 2.1 M€. A national
 * cup won by a first division club pays 8.75 M€.
 */
export const EUROPE_PRIZES: Readonly<Record<"eu.1" | "eu.2", EuropePrizes>> = {
  "eu.1": {
    participation: 3_000_000,
    leagueWin: 600_000,
    quarterFinalQualification: 2_000_000,
    quarterFinalWin: 3_000_000,
    semiFinalWin: 4_000_000,
    finalWin: 8_000_000,
    finalLoss: 4_000_000,
  },
  "eu.2": {
    participation: 1_500_000,
    leagueWin: 300_000,
    quarterFinalQualification: 800_000,
    quarterFinalWin: 1_200_000,
    semiFinalWin: 1_800_000,
    finalWin: 3_500_000,
    finalLoss: 1_750_000,
  },
};

/**
 * What a European run adds to a club's reputation target at the end of the season (never to its reputation itself),
 * within 99, by the stage it reached (EUROPE_STAGES: 3 quarter-finals, 5 final, 6 won): the Coupe des Lauriers +1 for its
 * quarter-finalists, +2 for its finalists, +3 for its winner; the Coupe des Fanions +1 for its finalists, +2 for its winner.
 */
export const EUROPE_REPUTATION_BONUS: Readonly<Record<"eu.1" | "eu.2", readonly { stage: number; bonus: number }[]>> = {
  "eu.1": [
    { stage: 6, bonus: 3 },
    { stage: 5, bonus: 2 },
    { stage: 3, bonus: 1 },
  ],
  "eu.2": [
    { stage: 6, bonus: 2 },
    { stage: 5, bonus: 1 },
  ],
};

/**
 * The European objective of the managed club, by its reputation third among its competition's clubs at the opening: the
 * stage to reach (2 play-offs, 3 quarter-finals), exceeded EUROPE_OBJECTIVE_EXCEEDED_STAGES stages further (the final,
 * the semi-finals). The top third asked the semi-finals until 17/11, reached about one season in three or four
 * (measure:seasons): the quarter-finals since, as the middle third.
 */
export const EUROPE_OBJECTIVE_STAGES: readonly [number, number, number] = [3, 3, 2];
export const EUROPE_OBJECTIVE_EXCEEDED_STAGES = 2;

/** What the European objective's outcome adds to the managed club's budget coefficient, in hundredths: the cup's. */
export const EUROPE_COEFFICIENT: Readonly<Record<ObjectiveOutcome, number>> = { EXCEEDED: 10, ACHIEVED: 5, MISSED: -5 };

/**
 * European yellow cards: this many suspend a player for the club's next European match (5 in the league and the cup,
 * which 6 to 10 matches would hardly ever reach).
 */
export const EUROPE_YELLOWS_PER_SUSPENSION = 3;

// ------------------------------------------------------------------ National teams (worldVersion 2, docs/design/selections.md)
// The 14 nations of the game's nationalities (src/engine/nations.ts) call their best players at each international
// break, from our clubs or from their reserve, the players they have outside our five countries' leagues.

/**
 * The ratings of a nation's reserve players are drawn in its range (§ 2.3): what the nation has outside our leagues. Our
 * five countries keep most of their best players at home, a low reserve; Brazil, Argentina and Portugal have a strong one.
 */
export const NATION_RESERVE_LEVELS: Readonly<Record<NationCode, RankRange>> = {
  GER: { worst: 62, best: 70 },
  ENG: { worst: 62, best: 70 },
  ESP: { worst: 62, best: 70 },
  FRA: { worst: 62, best: 70 },
  ITA: { worst: 62, best: 70 },
  POR: { worst: 72, best: 81 },
  NED: { worst: 69, best: 77 },
  BEL: { worst: 69, best: 77 },
  CRO: { worst: 69, best: 77 },
  BRA: { worst: 72, best: 81 },
  ARG: { worst: 72, best: 81 },
  MAR: { worst: 66, best: 74 },
  SEN: { worst: 66, best: 74 },
  CIV: { worst: 66, best: 74 },
};
/** A reserve player's age when he is drawn: from his first years as a professional to his last. */
export const NATION_RESERVE_AGE: RankRange = { worst: 21, best: 33 };
/** At this age, at a season's start, a reserve player retires and a 21-year-old of his position takes his place. */
export const NATION_RESERVE_RETIREMENT_AGE = 34;
/** The minutes a reserve player is deemed to play in a season, for his progression: a regular of his league. */
export const NATION_RESERVE_SEASON_MINUTES = 2500;
/** A nation calls, for a break, the best of its players at each line, then the best outfield players left. */
export const CALL_UP_BY_GROUP: Readonly<Record<PositionGroup, number>> = { GK: 3, DF: 7, MF: 7, FW: 4 };
export const CALL_UP_SIZE = 23;
/**
 * A light match's changes (§ 4.7), friendly, qualifier or tournament, all at this minute: the most tired outfield starters
 * make way for the best of the bench. Five, not the three at 60', 70' and 80' the cahier gave a match that counts: with
 * them, the Laurel Cup's clubs had 1.31 times the other clubs' injuries (measure:balance, 18/11), above the 1.3 aimed at.
 */
export const LIGHT_SUBSTITUTIONS = 5;
export const LIGHT_SUBSTITUTION_MINUTE = 60;
/** A light knockout match's extra time (§ 4.6): this share of the 90 minutes' expected goals, over its two periods. */
export const LIGHT_EXTRA_TIME_GOAL_SHARE = 1 / 3;

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
 * the 4-3-3, 1.31 since gameplay v2 (V1), the six targets of docs/design/gameplay-v1.md where they were; 1.35 since the
 * balancing chantier (23/11): 2.60 goals a match, the floor of the target (2.6 to 2.8), raised to about 2.68.
 */
export const BASE_GOALS_PER_TEAM = 1.35;

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

/**
 * Penalty: the best shooters on the pitch offered as takers, the best rated first. A kick's chance starts from the
 * shoot-out's (shootoutChance: his shooting against the goalkeeper's goalkeeping), then moves with the taker as he is at
 * that moment of the match (penaltyChance, choices.ts):
 * - his form: PENALTY_FORM_CHANCE per point away from CONDITION_NEUTRAL, multiplied by 1 + PENALTY_PRESSURE_FORM × the
 *   pressure: the tighter the moment, the more his form counts, both ways;
 * - his fitness at that minute: PENALTY_FITNESS_CHANCE per point away from PENALTY_FITNESS_REFERENCE, about a starter's
 *   fitness at a boundary: a fresh substitute's legs against a starter's at the end of a match;
 * - the pressure, from 0 to 1 (penaltyPressure: the minute and the score), PENALTY_PRESSURE_CHANCE times its gap to
 *   PENALTY_PRESSURE_REFERENCE off every taker, and his experience facing it: PENALTY_EXPERIENCE_CHANCE times the
 *   pressure, for the calm of a taker PENALTY_EXPERIENCE_AGE_SPAN years or more above PENALTY_EXPERIENCE_NEUTRAL_AGE, as
 *   much off for one as far below it, in proportion between;
 * within SHOOTOUT_MIN_CHANCE and SHOOTOUT_MAX_CHANCE. The chance shown is the one played, and the assistant takes the
 * best. Form and fitness alone hardly separate three teammates (the same form or fitness for the three in many matches):
 * the best rated was still the best choice 60 % of the time at the most. Measured on real squads (measure:balance,
 * « Choice events on real squads »): the best rated taker is the best choice about one penalty in two, two in three at
 * 15', two in five at 75'.
 */
export const PENALTY_TAKERS = 3;
export const PENALTY_FORM_CHANCE = 0.004;
export const PENALTY_PRESSURE_FORM = 1;
export const PENALTY_FITNESS_CHANCE = 0.005;
export const PENALTY_FITNESS_REFERENCE = 85;
export const PENALTY_PRESSURE_CHANCE = 0.05;
export const PENALTY_PRESSURE_REFERENCE = 0.5;
export const PENALTY_EXPERIENCE_CHANCE = 0.12;
export const PENALTY_EXPERIENCE_NEUTRAL_AGE = 26;
export const PENALTY_EXPERIENCE_AGE_SPAN = 5;

/**
 * The pressure of a kick: the minute's part, PENALTY_PRESSURE_FLOOR at kick-off up to 1 at the end of regular time and in
 * extra time, times the score's, as seen by its side: the most when level or one goal behind (an equaliser or the lead),
 * then one ahead, two behind, two ahead, three or more either way.
 */
export const PENALTY_PRESSURE_FLOOR = 0.3;
export const PENALTY_PRESSURE_BY_LEAD: Readonly<Record<"level" | "oneBehind" | "oneAhead" | "twoBehind" | "twoAhead" | "decided", number>> = {
  level: 1,
  oneBehind: 1,
  oneAhead: 0.8,
  twoBehind: 0.6,
  twoAhead: 0.4,
  decided: 0.2,
};

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
 * A scuffle, its captain (the best outfield player on the pitch) in the middle. Calming the players down is safe: nothing
 * happens. Protesting is a bet on the next PROTEST_SEGMENTS segments of the period of play: with PROTEST_SUCCESS_CHANCE the
 * players are fired up, their side's expected goals multiplied by PROTEST_GOALS; otherwise they lose their heads, the
 * opponent's multiplied by PROTEST_BACKFIRE_GOALS. Whatever comes of it, the captain is booked with PROTEST_YELLOW_CHANCE,
 * sent off if he already was. Measured on real squads (measure:balance, « Choice events on real squads »): on average
 * as good as calming down (−0.002 point a match ± 0.012; +0.003 with the captain not booked, −0.065 when he is), the final
 * score changed by it in 28 % of the scuffles, the points in 13 %, as often for better as for worse. Until 23/11, ×1.08 on
 * the next segment half the time: the score changed in 1.4 % of them.
 */
export const PROTEST_SEGMENTS = 2;
export const PROTEST_SUCCESS_CHANCE = 0.5;
export const PROTEST_GOALS = 2;
export const PROTEST_BACKFIRE_GOALS = 1.95;
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
 * ROTATION_MAX_RATING_GAP below him in the slot, plus ROTATION_GAP_PER_FITNESS_POINT for each point of fitness below
 * ROTATION_FITNESS (maxRotationGap: 7 at 74, 15 at 70, 25 at 65). With 5 points flat until 17/11, the European clubs,
 * whose benches fall further behind their elevens season after season, rested fewer and fewer: 12 % of their starters
 * below 75 in October of the first season, 25 % in the fifth; 1 to 4 % since (measure:seasons).
 */
export const ROTATION_FITNESS = 75;
export const ROTATION_MAX_RATING_GAP = 5;
export const ROTATION_GAP_PER_FITNESS_POINT = 2;

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
 * In the year after a player joined the managed club, the AI clubs offer it at most this share, in percent, of the fee
 * it paid for him: buying a player cheap to sell him on at once is no business…
 */
export const RESALE_CAP_FEE_PERCENT = 110;

/** …and at most this share of his market value, in percent, for a player it signed free. */
export const RESALE_CAP_VALUE_PERCENT = 50;

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
