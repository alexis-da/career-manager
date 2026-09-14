import { randomInt, type Rng } from "../lib/rng";
import {
  BUDGET_STEP,
  CLUB_BUDGET_BEST,
  CLUB_BUDGET_WORST,
  CLUB_REPUTATION_BEST,
  CLUB_REPUTATION_WORST,
  CLUB_WAGE_BUDGET_BEST,
  CLUB_WAGE_BUDGET_WORST,
  CONTRACT_MAX_YEARS_BY_AGE,
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

/**
 * Market value and wage are pure functions of rating and age; only the contract length is drawn.
 * Pass the player's own stream, after generateAttributes, so a replay draws the same length.
 */
export function generateContract(player: ContractProfile, currentDate: Date, rng: Rng): PlayerContract {
  const growthRoom = player.potential - player.overall;
  const marketValue = roundToStep(
    interpolate(MARKET_VALUE_BY_OVERALL, player.overall) *
      interpolate(MARKET_VALUE_AGE_FACTOR, player.age) *
      (1 + growthRoom * MARKET_VALUE_PER_GROWTH_POINT),
    MARKET_VALUE_STEP,
  );
  const wage = roundToStep(
    interpolate(WAGE_BY_OVERALL, player.overall) * interpolate(WAGE_AGE_FACTOR, player.age),
    WAGE_STEP,
  );
  const maxYears = Math.max(1, Math.round(interpolate(CONTRACT_MAX_YEARS_BY_AGE, player.age)));
  const years = randomInt(rng, 1, maxYears);

  return { marketValue, wage, contractUntil: seasonEndDate(seasonStartYear(currentDate) + years - 1) };
}
