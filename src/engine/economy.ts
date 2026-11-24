import { weightedIndex, type Rng } from "../lib/rng";
import {
  BUDGET_CARRY_OVER_SHARE,
  BUDGET_COEFFICIENT_RANGE,
  BUDGET_STEP,
  CLUB_BUDGET_BY_TIER,
  CLUB_REPUTATION_BY_TIER,
  CLUB_WAGE_BUDGET_BY_TIER,
  CONTRACT_YEARS_WEIGHTS,
  LATE_CAREER_MAX_CONTRACT_YEARS,
  LONG_CONTRACT_MAX_AGE,
  MANAGED_WAGE_MARGIN_RANGE,
  MARKET_VALUE_AGE_FACTOR,
  MARKET_VALUE_BY_OVERALL,
  MARKET_VALUE_PER_GROWTH_POINT,
  MARKET_VALUE_STEP,
  NEUTRAL_BUDGET_COEFFICIENT,
  SIGNING_BONUS_MIN,
  SIGNING_BONUS_SHARE,
  SIGNING_BONUS_STEP,
  WAGE_AGE_FACTOR,
  WAGE_BUDGET_FLOOR_SHARE,
  WAGE_BUDGET_MARGIN,
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
  carryOver: number; // euros: BUDGET_CARRY_OVER_SHARE of the transfer budget it left unspent (the managed club's alone)
  budget: number; // euros: the dotation times the coefficient, rounded to BUDGET_STEP, plus the carry-over
  wageBudget: number; // euros per season: its payroll times its margin, within half and all of the table's (wageBudgetFor)
};

/**
 * A club's finances for a new season: its dotation, the transfer budget clubFinances gives its reputation rank in its
 * (new) division, times its objectives' coefficient, plus half of what it left unspent (sales and cup prizes
 * included; the managed club's alone, an AI club's unspent being 0); its wage budget, its payroll at the end of the
 * season closed times its margin, between half of the creation's wage budget at that rank and all of it (wageBudgetFor). Its reputation is its own (src/engine/reputation.ts).
 */
export function seasonFinances({
  reputationRank,
  clubCount,
  tier,
  coefficient,
  unspent,
  payroll,
  wageMargin,
}: SeasonFinancesInput): SeasonFinances {
  const { budget: dotation, wageBudget: tableWageBudget } = clubFinances(reputationRank, clubCount, tier);
  const carryOver = Math.round(Math.max(0, unspent) * BUDGET_CARRY_OVER_SHARE);
  return {
    dotation,
    coefficient,
    carryOver,
    budget: roundToStep((dotation * coefficient) / 100, BUDGET_STEP) + carryOver,
    wageBudget: wageBudgetFor(payroll, wageMargin, tableWageBudget),
  };
}

/** What a season's finances are given from. */
export type SeasonFinancesInput = {
  reputationRank: number; // in its (new) division
  clubCount: number; // of that division
  tier: CompetitionTier;
  coefficient: number; // hundredths: its objectives' (budgetCoefficient)
  unspent: number; // euros: the transfer budget it left unspent; 0 carries nothing over, as for every AI club
  payroll: number; // euros per season: its payroll at the end of the season closed
  wageMargin: number; // WAGE_BUDGET_MARGIN, or the managed club's (managedWageMargin)
};

/**
 * A club's wage budget: its payroll times its margin, rounded to BUDGET_STEP, within the table's, the creation's wage
 * budget at its rank (clubFinances): never above it, never under its floor (wageBudgetFloor). What it may add in wages is
 * a few signings, as its transfer budget is; a club whose payroll fell keeps enough to rebuild.
 */
export function wageBudgetFor(payroll: number, margin: number, tableWageBudget: number): number {
  return Math.min(tableWageBudget, Math.max(wageBudgetFloor(tableWageBudget), roundToStep(payroll * margin, BUDGET_STEP)));
}

/** The least a club's wage budget is: WAGE_BUDGET_FLOOR_SHARE of the table's at its rank, rounded to BUDGET_STEP. */
export function wageBudgetFloor(tableWageBudget: number): number {
  return roundToStep(tableWageBudget * WAGE_BUDGET_FLOOR_SHARE, BUDGET_STEP);
}

/**
 * The managed club's wage margin for a season, from its objectives' coefficient: MANAGED_WAGE_MARGIN_RANGE's worst at the
 * lowest coefficient (70), WAGE_BUDGET_MARGIN at 100, its best at the highest (140), straight in between. AI clubs have
 * WAGE_BUDGET_MARGIN.
 */
export function managedWageMargin(coefficient: number): number {
  const { worst: low, best: high } = BUDGET_COEFFICIENT_RANGE;
  const bounded = Math.min(high, Math.max(low, coefficient));
  if (bounded <= NEUTRAL_BUDGET_COEFFICIENT) {
    const share = (bounded - low) / (NEUTRAL_BUDGET_COEFFICIENT - low);
    return MANAGED_WAGE_MARGIN_RANGE.worst + share * (WAGE_BUDGET_MARGIN - MANAGED_WAGE_MARGIN_RANGE.worst);
  }
  const share = (bounded - NEUTRAL_BUDGET_COEFFICIENT) / (high - NEUTRAL_BUDGET_COEFFICIENT);
  return WAGE_BUDGET_MARGIN + share * (MANAGED_WAGE_MARGIN_RANGE.best - WAGE_BUDGET_MARGIN);
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
 * The wage a player extends his contract for, euros per season: his current wage or his market wage (wageFor), whichever
 * is higher. The managed club's renewals and the AI clubs' (planSquad) alike; nothing is ever refused below it, nothing
 * is asked above it (docs/design/simplification.md § 1.1).
 */
export function renewalWage(player: Pick<ContractProfile, "age" | "overall"> & { wage: number }): number {
  return Math.max(player.wage, wageFor(player));
}

/**
 * A free agent's signing bonus in euros, paid on the signing club's transfer budget (docs/design/simplification.md § 1.3):
 * SIGNING_BONUS_SHARE of his market value on the signing day (marketValueFor), rounded up to SIGNING_BONUS_STEP, never
 * under SIGNING_BONUS_MIN. Rounded to the euro first: a product such as 1 010 000 × 0.25 must not reach the next step by
 * a floating-point hair.
 */
export function signingBonus(marketValue: number): number {
  return Math.max(
    SIGNING_BONUS_MIN,
    Math.ceil(Math.round(marketValue * SIGNING_BONUS_SHARE) / SIGNING_BONUS_STEP) * SIGNING_BONUS_STEP,
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
