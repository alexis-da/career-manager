import { weightedIndex, type Rng } from "../lib/rng";
import {
  BUDGET_STEP,
  CLUB_BUDGET_BEST,
  CLUB_BUDGET_WORST,
  CLUB_REPUTATION_BEST,
  CLUB_REPUTATION_WORST,
  CLUB_WAGE_BUDGET_BEST,
  CLUB_WAGE_BUDGET_WORST,
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

export function clubFinances(initialRank: number, clubCount: number): ClubFinances {
  const strength = rankStrength(initialRank, clubCount);
  const moneyShare = strength * strength; // money concentrates at the top of the table
  return {
    budget: roundToStep(lerp(CLUB_BUDGET_WORST, CLUB_BUDGET_BEST, moneyShare), BUDGET_STEP),
    wageBudget: roundToStep(lerp(CLUB_WAGE_BUDGET_WORST, CLUB_WAGE_BUDGET_BEST, moneyShare), BUDGET_STEP),
    reputation: clampRating(lerp(CLUB_REPUTATION_WORST, CLUB_REPUTATION_BEST, strength)),
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
