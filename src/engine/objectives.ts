import { randomInt, type Rng } from "../lib/rng";
import {
  BOARD_CONFIDENCE_BASE,
  BOARD_CONFIDENCE_POINTS,
  BUDGET_COEFFICIENT_RANGE,
  CHOSEN_COEFFICIENT,
  CUP_COEFFICIENT,
  CUP_OBJECTIVE_EXCEEDED_ROUNDS,
  CUP_OBJECTIVE_ROUNDS,
  ENTERTAINMENT_OBJECTIVE_FACTOR,
  EXCEEDED_OBJECTIVE_PLACES,
  EXPECTED_SEASON_GOALS_FACTOR,
  FINISH_OBJECTIVE_MARGIN_BY_TIER,
  HOME_ADVANTAGE,
  NEUTRAL_BUDGET_COEFFICIENT,
  PROMOTION_OBJECTIVE_RANKS,
  PROMOTION_RELEGATION,
  RANKING_COEFFICIENT,
  SOLIDITY_OBJECTIVE_FACTOR,
  SURVIVAL_OBJECTIVE_MARGIN,
  TOP_OBJECTIVE_RANKS,
  YOUTH_OBJECTIVE_STARTS,
} from "./balance";
import { countryOf } from "./promotion";
import { expectedGoals, type TeamStrength } from "./strength";
import type { CompetitionTier } from "./tiers";
import type { WorldVersion } from "./world-version";

// A club's objectives for a season and what they are worth to its budget (docs/design/gameplay-v2.md, V2 and V3).
// Pure: the transition and the screens read and write the objectives (src/db).

/** How an objective ends: beyond what was asked, as asked, or short of it. */
export type ObjectiveOutcome = "EXCEEDED" | "ACHIEVED" | "MISSED";

/** The ranking objective's kinds: the top three, going up, staying up, or a place to finish at or above. */
export type RankingVariant = "TOP" | "PROMOTION" | "SURVIVAL" | "FINISH";

/** The ranking objective: the rank to finish at or above, and the rank that exceeds it. */
export type RankingObjective = { variant: RankingVariant; target: number; exceed: number };

/** A division as its objectives see it: its size, its tier, its places going up and going down. */
export type Division = {
  clubCount: number;
  tier: CompetitionTier;
  promotionPlaces: number; // a second division of a worldVersion 2 save; 0 elsewhere
  relegationPlaces: number; // a first division of a worldVersion 2 save; 0 elsewhere (a worldVersion 1 save has one a country)
};

/** A league as its objectives see it: its places going up and down are its country's in a worldVersion 2 save. */
export function divisionOf(code: string, tier: CompetitionTier, clubCount: number, worldVersion: WorldVersion): Division {
  const places = worldVersion === 2 ? (PROMOTION_RELEGATION[countryOf(code)] ?? 0) : 0;
  return {
    clubCount,
    tier,
    promotionPlaces: tier === 2 ? places : 0,
    relegationPlaces: tier === 1 ? places : 0,
  };
}

/**
 * The ranking objective of a club expected at a rank (its reputation rank in its division): the top three for the best
 * of a first division (exceeded: the title), going up for the best of a second one (exceeded: its title), staying up
 * for those expected in the relegation zone or just above it (exceeded: three places above the zone), otherwise a place
 * to finish at or above, the expected rank plus FINISH_OBJECTIVE_MARGIN_BY_TIER (exceeded: three places better). Never
 * the last place, where no club goes down: finishing last is no objective.
 */
export function rankingObjective(expectedRank: number, division: Division): RankingObjective {
  const { clubCount, tier, promotionPlaces, relegationPlaces } = division;
  if (tier === 1 && expectedRank <= TOP_OBJECTIVE_RANKS) {
    return { variant: "TOP", target: TOP_OBJECTIVE_RANKS, exceed: 1 };
  }
  if (promotionPlaces > 0 && expectedRank <= PROMOTION_OBJECTIVE_RANKS) {
    return { variant: "PROMOTION", target: promotionPlaces, exceed: 1 };
  }
  const safeRank = clubCount - relegationPlaces;
  if (relegationPlaces > 0 && expectedRank > safeRank - SURVIVAL_OBJECTIVE_MARGIN) {
    return { variant: "SURVIVAL", target: safeRank, exceed: Math.max(1, safeRank + 1 - EXCEEDED_OBJECTIVE_PLACES) };
  }
  const target = Math.min(expectedRank + FINISH_OBJECTIVE_MARGIN_BY_TIER[tier], clubCount - 1);
  return { variant: "FINISH", target, exceed: Math.max(1, target - EXCEEDED_OBJECTIVE_PLACES) };
}

/** How a ranking objective ends at a final rank. */
export function rankingOutcome(objective: Pick<RankingObjective, "target" | "exceed">, finalRank: number): ObjectiveOutcome {
  return finalRank <= objective.exceed ? "EXCEEDED" : finalRank <= objective.target ? "ACHIEVED" : "MISSED";
}

/** The outcomes a budget coefficient reads: the ranking's for every club, the cup's and the chosen objective's. */
export type CoefficientOutcomes = { ranking?: ObjectiveOutcome; cup?: ObjectiveOutcome; chosen?: ObjectiveOutcome };

/**
 * The budget coefficient of a season's objectives, in hundredths: 100, plus what each outcome is worth
 * (RANKING_COEFFICIENT, CUP_COEFFICIENT, CHOSEN_COEFFICIENT), within BUDGET_COEFFICIENT_RANGE. An AI club has its
 * ranking alone; without any objective, 100.
 */
export function budgetCoefficient({ ranking, cup, chosen }: CoefficientOutcomes): number {
  const sum =
    NEUTRAL_BUDGET_COEFFICIENT +
    (ranking === undefined ? 0 : RANKING_COEFFICIENT[ranking]) +
    (cup === undefined ? 0 : CUP_COEFFICIENT[cup]) +
    (chosen === undefined ? 0 : CHOSEN_COEFFICIENT[chosen]);
  return Math.min(BUDGET_COEFFICIENT_RANGE.best, Math.max(BUDGET_COEFFICIENT_RANGE.worst, sum));
}

// ------------------------------------------------------------------ The season's objectives (gameplay v2, V3)

/** The four objectives a board proposes three of, one to choose: Jeunesse, Spectacle, Solidité, Bonne gestion. */
export const OPTIONAL_OBJECTIVES = ["YOUTH", "ENTERTAINMENT", "SOLIDITY", "FINANCES"] as const;
export type OptionalObjective = (typeof OPTIONAL_OBJECTIVES)[number];

/** Every objective: the ranking and the cup, imposed, and the optional ones. */
export type ObjectiveKind = "RANKING" | "CUP" | OptionalObjective;

/** Where an objective stands during the season: on track, at risk, or already decided. */
export type ObjectiveProgress = "ON_TRACK" | "AT_RISK" | ObjectiveOutcome;

/** An objective as the rules read it: its target, and what exceeds it (ranking and cup only). */
export type Objective = { kind: ObjectiveKind; target: number; exceed: number | null };

/** The round a cup's winner has reached: the one after the final. */
export const CUP_WON_ROUND = 7;

/** Seed of a season's objectives: which three the board proposes. */
export function objectivesRngSeed(saveSeed: string, startYear: number): string {
  return `${saveSeed}:objectives:${startYear}`;
}

/** The three optional objectives a board proposes for a season: the four but one, drawn; in OPTIONAL_OBJECTIVES order. */
export function proposedObjectives(rng: Rng): OptionalObjective[] {
  const left = randomInt(rng, 0, OPTIONAL_OBJECTIVES.length - 1);
  return OPTIONAL_OBJECTIVES.filter((_, index) => index !== left);
}

/**
 * The assistant's choice when the player chose none before the season's first match: Jeunesse, or, when it is not
 * proposed, the first one proposed.
 */
export function assistantObjective(proposed: readonly OptionalObjective[]): OptionalObjective {
  const [first] = proposed;
  if (first === undefined) {
    throw new Error("No objective proposed");
  }
  return proposed.includes("YOUTH") ? "YOUTH" : first;
}

/** A club's third of its division by reputation rank: 1 for the best, 3 for the last. */
export function reputationThird(rank: number, clubCount: number): 1 | 2 | 3 {
  const third = Math.ceil((3 * rank) / clubCount);
  return third <= 1 ? 1 : third === 2 ? 2 : 3;
}

/**
 * The cup objective: the round named for its division and reputation third (CUP_OBJECTIVE_ROUNDS), at least one round
 * past the round it enters the cup at (1 when it plays the preliminary round, 2 when exempt from it); exceeded
 * CUP_OBJECTIVE_EXCEEDED_ROUNDS rounds further.
 */
export function cupObjective(tier: CompetitionTier, third: 1 | 2 | 3, entryRound: number): { target: number; exceed: number } {
  const target = Math.max(CUP_OBJECTIVE_ROUNDS[tier][third - 1], entryRound + 1);
  return { target, exceed: target + CUP_OBJECTIVE_EXCEEDED_ROUNDS };
}

/**
 * A club's goals expected over its league season: the engine's expected goals, home and away averaged, per match, as a
 * season gives them (EXPECTED_SEASON_GOALS_FACTOR).
 */
export function expectedSeasonGoals(team: TeamStrength, opponent: TeamStrength, matches: number): { scored: number; conceded: number } {
  const scored = (expectedGoals(team, opponent, HOME_ADVANTAGE) + expectedGoals(team, opponent, 1 / HOME_ADVANTAGE)) / 2;
  const conceded = (expectedGoals(opponent, team, 1 / HOME_ADVANTAGE) + expectedGoals(opponent, team, HOME_ADVANTAGE)) / 2;
  const season = matches * EXPECTED_SEASON_GOALS_FACTOR;
  return { scored: scored * season, conceded: conceded * season };
}

/**
 * An optional objective's target: league starts for Jeunesse, goals scored at least for Spectacle, goals conceded at
 * most for Solidité (the season's expected goals of the squad at its start, against its division's average opponent),
 * a transfer balance at least for Bonne gestion.
 */
export function optionalTarget(kind: OptionalObjective, expected: { scored: number; conceded: number }): number {
  // To the millionth first: 50 × 1.1 is 55.000000000000007 in floating point, which Math.ceil would make 56.
  const exact = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
  switch (kind) {
    case "YOUTH":
      return YOUTH_OBJECTIVE_STARTS;
    case "ENTERTAINMENT":
      return Math.ceil(exact(expected.scored * ENTERTAINMENT_OBJECTIVE_FACTOR));
    case "SOLIDITY":
      return Math.floor(exact(expected.conceded * SOLIDITY_OBJECTIVE_FACTOR));
    case "FINANCES":
      return 0;
  }
}

/** What a season has given the managed club so far, as its objectives read it. */
export type SeasonProgress = {
  played: number; // league matches played
  total: number; // league matches of the season
  rank: number; // its place in the league table now
  cup: { reached: number; out: boolean } | null; // the cup round it reached (CUP_WON_ROUND: won it), and whether it is out
  youthStarts: number; // the most league starts of a player aged YOUTH_OBJECTIVE_MAX_AGE or less on the season's first day
  scored: number; // league goals
  conceded: number;
  balance: number; // euros: transfer fees received, less those paid, over the season
  over: boolean; // every match of the season played: each objective has its outcome
};

/** Whether a running total is on pace for a season's target (at least, or at most): played over total. */
function onPace(value: number, target: number, progress: SeasonProgress, atLeast: boolean): boolean {
  const due = progress.total === 0 ? 0 : (target * progress.played) / progress.total;
  return atLeast ? value >= due : value <= due;
}

/**
 * Where an objective stands: its outcome once decided (the season over, or earlier when nothing can change it: a cup
 * run ended or exceeded, the starts or the goals reached, too many goals conceded, too few matches left), otherwise on
 * track or at risk, against its target or its pace (played over total). Before the first match, on track.
 */
export function objectiveProgress(objective: Objective, progress: SeasonProgress): ObjectiveProgress {
  const { target } = objective;
  switch (objective.kind) {
    case "RANKING": {
      if (progress.over) {
        return rankingOutcome({ target, exceed: objective.exceed ?? 0 }, progress.rank);
      }
      return progress.played === 0 || progress.rank <= target ? "ON_TRACK" : "AT_RISK";
    }
    case "CUP": {
      const exceed = objective.exceed ?? Number.POSITIVE_INFINITY;
      if (progress.cup === null) {
        return progress.over ? "MISSED" : "ON_TRACK";
      }
      const { reached, out } = progress.cup;
      if (reached >= exceed) {
        return "EXCEEDED";
      }
      if (out || progress.over) {
        return reached >= target ? "ACHIEVED" : "MISSED";
      }
      return reached >= target ? "ACHIEVED" : "ON_TRACK";
    }
    case "YOUTH": {
      if (progress.youthStarts >= target) {
        return "ACHIEVED";
      }
      if (progress.over || progress.youthStarts + (progress.total - progress.played) < target) {
        return "MISSED";
      }
      return onPace(progress.youthStarts, target, progress, true) ? "ON_TRACK" : "AT_RISK";
    }
    case "ENTERTAINMENT": {
      if (progress.scored >= target) {
        return "ACHIEVED";
      }
      if (progress.over) {
        return "MISSED";
      }
      return onPace(progress.scored, target, progress, true) ? "ON_TRACK" : "AT_RISK";
    }
    case "SOLIDITY": {
      if (progress.conceded > target) {
        return "MISSED";
      }
      if (progress.over) {
        return "ACHIEVED";
      }
      return onPace(progress.conceded, target, progress, false) ? "ON_TRACK" : "AT_RISK";
    }
    case "FINANCES": {
      if (progress.over) {
        return progress.balance >= target ? "ACHIEVED" : "MISSED";
      }
      return progress.balance >= target ? "ON_TRACK" : "AT_RISK";
    }
  }
}

/** An objective's outcome at the end of the season. */
export function objectiveOutcome(objective: Objective, progress: SeasonProgress): ObjectiveOutcome {
  const final = objectiveProgress(objective, { ...progress, over: true });
  if (final === "ON_TRACK" || final === "AT_RISK") {
    throw new Error(`Objective ${objective.kind} undecided at the end of the season`);
  }
  return final;
}

/**
 * The president's confidence (1–99): BOARD_CONFIDENCE_BASE, plus each objective's points for where it stands
 * (BOARD_CONFIDENCE_POINTS): the ranking, the cup when the club plays one, the chosen objective once chosen. Shown, never
 * acted upon: nobody is ever sacked.
 */
export function boardConfidence(standing: { ranking: ObjectiveProgress; cup?: ObjectiveProgress; chosen?: ObjectiveProgress }): number {
  const points =
    BOARD_CONFIDENCE_POINTS.ranking[standing.ranking] +
    (standing.cup === undefined ? 0 : BOARD_CONFIDENCE_POINTS.cup[standing.cup]) +
    (standing.chosen === undefined ? 0 : BOARD_CONFIDENCE_POINTS.chosen[standing.chosen]);
  return Math.min(99, Math.max(1, BOARD_CONFIDENCE_BASE + points));
}
