import {
  BUDGET_COEFFICIENT_RANGE,
  CHOSEN_COEFFICIENT,
  CUP_COEFFICIENT,
  EXCEEDED_OBJECTIVE_PLACES,
  FINISH_OBJECTIVE_MARGIN_BY_TIER,
  NEUTRAL_BUDGET_COEFFICIENT,
  PROMOTION_OBJECTIVE_RANKS,
  PROMOTION_RELEGATION,
  RANKING_COEFFICIENT,
  SURVIVAL_OBJECTIVE_MARGIN,
  TOP_OBJECTIVE_RANKS,
} from "./balance";
import { countryOf } from "./promotion";
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
