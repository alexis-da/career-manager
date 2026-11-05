import { weightedIndex, type Rng } from "../lib/rng";
import {
  BUDGET_CARRY_OVER_SHARE,
  BUDGET_STEP,
  CLUB_BUDGET_BY_TIER,
  CLUB_REPUTATION_BY_TIER,
  CLUB_WAGE_BUDGET_BY_TIER,
  CONTRACT_YEARS_WEIGHTS,
  LATE_CAREER_MAX_CONTRACT_YEARS,
  LONG_CONTRACT_MAX_AGE,
  MARKET_VALUE_AGE_FACTOR,
  MARKET_VALUE_BY_OVERALL,
  MARKET_VALUE_PER_GROWTH_POINT,
  MARKET_VALUE_STEP,
  WAGE_AGE_FACTOR,
  WAGE_BY_OVERALL,
  WAGE_STEP,
} from "./balance";
import { interpolate, lerp, rankStrength } from "./curves";
import { clampRating } from "./generation";
import type { CompetitionTier } from "./tiers";
import { seasonEndDate, seasonStartYear } from "./world";

export type ClubFinances = {
  budget: number; // euros
  wageBudget: number; // euros per season
  reputation: number; // 1–99
};

export type ContractProfile = {
  age: number;
  overall: number;
  potential: number;
};

export type PlayerContract = {
  marketValue: number; // euros
  wage: number; // euros per season
  contractUntil: Date;
};

/** Rounds to the nearest multiple of step, never below one step. */
function roundToStep(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/** Budgets and reputation of a club at save creation, from its final league rank and its league's tier. */
export function clubFinances(initialRank: number, clubCount: number, tier: CompetitionTier): ClubFinances {
  const strength = rankStrength(initialRank, clubCount);
  const moneyShare = strength * strength; // money concentrates at the top of the table
  const budget = CLUB_BUDGET_BY_TIER[tier];
  const wageBudget = CLUB_WAGE_BUDGET_BY_TIER[tier];
  const reputation = CLUB_REPUTATION_BY_TIER[tier];
  return {
    budget: roundToStep(lerp(budget.worst, budget.best, moneyShare), BUDGET_STEP),
    wageBudget: roundToStep(lerp(wageBudget.worst, wageBudget.best, moneyShare), BUDGET_STEP),
    reputation: clampRating(lerp(reputation.worst, reputation.best, strength)),
  };
}

/** What a club's board gives it for a season (gameplay v2, V2): the transfer budget's parts, and the wage budget. */
export type SeasonFinances = {
  dotation: number; // euros: the creation's budget (clubFinances) at its reputation rank in its division
  coefficient: number; // hundredths: its objectives' (budgetCoefficient)
  carryOver: number; // euros: BUDGET_CARRY_OVER_SHARE of the transfer budget it left unspent
  budget: number; // euros: the dotation times the coefficient, rounded to BUDGET_STEP, plus the carry-over
  wageBudget: number; // euros per season: the creation's wage budget at that rank, without the coefficient
};

/**
 * A club's finances for a new season: its dotation, the transfer budget clubFinances gives its reputation rank in its
 * (new) division, times its objectives' coefficient, plus half of what it left unspent (sales and cup prizes
 * included); its wage budget recalculated the same way, without the coefficient. Its reputation is its own
 * (src/engine/reputation.ts).
 */
export function seasonFinances(
  reputationRank: number,
  clubCount: number,
  tier: CompetitionTier,
  coefficient: number,
  unspent: number,
): SeasonFinances {
  const { budget: dotation, wageBudget } = clubFinances(reputationRank, clubCount, tier);
  const carryOver = Math.round(Math.max(0, unspent) * BUDGET_CARRY_OVER_SHARE);
  return {
    dotation,
    coefficient,
    carryOver,
    budget: roundToStep((dotation * coefficient) / 100, BUDGET_STEP) + carryOver,
    wageBudget,
  };
}

/** Market value in euros: a pure function of rating, age and growth room. */
export function marketValueFor(player: ContractProfile): number {
  const growthRoom = player.potential - player.overall;
  return roundToStep(
    interpolate(MARKET_VALUE_BY_OVERALL, player.overall) *
      interpolate(MARKET_VALUE_AGE_FACTOR, player.age) *
      (1 + growthRoom * MARKET_VALUE_PER_GROWTH_POINT),
    MARKET_VALUE_STEP,
  );
}

/** Wage in euros per season a player of this rating and age earns: the basis of every contract offer. */
export function wageFor(player: Pick<ContractProfile, "age" | "overall">): number {
  return roundToStep(
    interpolate(WAGE_BY_OVERALL, player.overall) * interpolate(WAGE_AGE_FACTOR, player.age),
    WAGE_STEP,
  );
}

/**
 * Contract length in seasons, drawn with CONTRACT_YEARS_WEIGHTS; players older than LONG_CONTRACT_MAX_AGE
 * get at most LATE_CAREER_MAX_CONTRACT_YEARS.
 */
export function contractYears(age: number, rng: Rng): number {
  const weights =
    age > LONG_CONTRACT_MAX_AGE ? CONTRACT_YEARS_WEIGHTS.slice(0, LATE_CAREER_MAX_CONTRACT_YEARS) : CONTRACT_YEARS_WEIGHTS;
  return 1 + weightedIndex(rng, weights);
}

/** End of a contract of `years` seasons signed on `date`: 30 June of the last season. */
export function contractEndDate(date: Date, years: number): Date {
  return seasonEndDate(seasonStartYear(date) + years - 1);
}

/**
 * Contract of a player at save creation. Market value and wage are pure functions of rating and age; only
 * the length is drawn. Pass the player's own stream, after generateAttributes, so a replay draws the same.
 */
export function generateContract(player: ContractProfile, currentDate: Date, rng: Rng): PlayerContract {
  return {
    marketValue: marketValueFor(player),
    wage: wageFor(player),
    contractUntil: contractEndDate(currentDate, contractYears(player.age, rng)),
  };
}
