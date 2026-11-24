import { BUDGET_STEP, FULL_FITNESS, SQUAD_ROLES } from "./balance";
import { positionGroup, type Position, type PositionGroup } from "./positions";

// The shop of missions v2 (docs/design/missions-v2.md, § 2.3 and § 2.4): the career's items, bought with tokens in a
// normal career, never in a challenge one, with their limits by season and by career; and the player's, the streak's
// shield. Pure: prices, limits and what each item does to the save, which the database layer writes in the purchase's
// transaction. A purchase is the player's choice, as a transfer: replaying a save with the same purchases gives the same
// season.

export const CAREER_ITEMS = ["FITNESS_CAMP", "EXPRESS_CARE", "BUDGET_TOP_UP", "PROMISING_YOUTH"] as const;
export type CareerItem = (typeof CAREER_ITEMS)[number];

/** Prices in tokens. */
export const ITEM_PRICES: Readonly<Record<CareerItem | "STREAK_SHIELD", number>> = {
  FITNESS_CAMP: 40,
  EXPRESS_CARE: 60,
  BUDGET_TOP_UP: 200,
  PROMISING_YOUTH: 350,
  STREAK_SHIELD: 50,
};

/** How many of each item a career may buy in a season (its current one, reset at the next). */
export const SEASON_LIMITS: Readonly<Record<CareerItem, number>> = {
  FITNESS_CAMP: 5,
  EXPRESS_CARE: 3,
  BUDGET_TOP_UP: 1,
  PROMISING_YOUTH: 1,
};

/** How many of an item a career may buy in all; the others have none. */
export const CAREER_LIMITS: Readonly<Partial<Record<CareerItem, number>>> = { PROMISING_YOUTH: 3 };

/** The budget top-up: this share of the season's dotation, at least BUDGET_TOP_UP_MIN, rounded to BUDGET_STEP. */
export const BUDGET_TOP_UP_SHARE = 0.05;
export const BUDGET_TOP_UP_MIN = 100_000;

/** Express care halves the days an injury has left, when at least this many are. */
export const EXPRESS_CARE_MIN_DAYS = 4;

/** The promising youth: his age, his overall above his division's best young players', his potential's gap. */
export const PROMISING_YOUTH_AGE = 17;
export const PROMISING_YOUTH_OVERALL_BONUS = 3;
export const PROMISING_YOUTH_POTENTIAL_GAP: { readonly min: number; readonly max: number } = { min: 25, max: 30 };

/** His first contract, in seasons, the current one included: he can be neither sold nor released before it ends. */
export const PROMISING_YOUTH_CONTRACT_YEARS = 3;

/** The lines a promising youth may play in, the player's choice. */
export const YOUTH_LINES = ["GK", "DF", "MF", "FW"] as const satisfies readonly PositionGroup[];
export type YouthLine = (typeof YOUTH_LINES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

const roundToStep = (value: number, step: number): number => Math.round(value / step) * step;

/** The budget a top-up adds: 5 % of the season's dotation, never under 100 000 €. */
export function budgetTopUp(dotation: number): number {
  return Math.max(BUDGET_TOP_UP_MIN, roundToStep(dotation * BUDGET_TOP_UP_SHARE, BUDGET_STEP));
}

/** The days an injury has left on the save's date, rounded up; 0 when over. */
export function daysLeft(injuredUntil: Date | null, date: Date): number {
  return injuredUntil === null ? 0 : Math.max(0, Math.ceil((injuredUntil.getTime() - date.getTime()) / DAY_MS));
}

/** The end of an injury express care leaves: half its days left, rounded up; null when too few are left to halve. */
export function careUntil(injuredUntil: Date | null, date: Date): Date | null {
  const left = daysLeft(injuredUntil, date);
  return left < EXPRESS_CARE_MIN_DAYS ? null : new Date(date.getTime() + Math.ceil(left / 2) * DAY_MS);
}

/** A fitness camp: the squad's fitness, every player at FULL_FITNESS. */
export const campFitness = (): number => FULL_FITNESS;

/**
 * The position of a promising youth in his line: the squad's role of that line furthest below its count in SQUAD_ROLES
 * (the first on a tie), at its position with the fewest players; a goalkeeper for the goalkeepers' line.
 */
export function youthPositionIn(line: YouthLine, squadPositions: readonly Position[]): Position {
  const counts = new Map<Position, number>();
  for (const position of squadPositions) {
    counts.set(position, (counts.get(position) ?? 0) + 1);
  }
  const countOf = (position: Position): number => counts.get(position) ?? 0;
  const roles = SQUAD_ROLES.filter((role) => role.positions.every((position) => positionGroup(position) === line));
  const shortfall = (role: (typeof SQUAD_ROLES)[number]): number =>
    role.count - role.positions.reduce((sum, position) => sum + countOf(position), 0);
  const role = roles.reduce((best, candidate) => (shortfall(candidate) > shortfall(best) ? candidate : best));
  return role.positions.reduce((best, candidate) => (countOf(candidate) < countOf(best) ? candidate : best));
}

/** Why a purchase is refused, before anything is paid. */
export type PurchaseRefusal =
  | "challenge" // a challenge save has no shop
  | "live" // a match waits live
  | "season_limit"
  | "career_limit"
  | "tokens" // not enough
  | "not_injured" // express care: the player has too few days left, or is not the club's
  | "camp_today" // a fitness camp already on this date
  | "full_fitness" // a fitness camp: the whole squad is at FULL_FITNESS already
  | "squad_full" // the promising youth: the squad already has SQUAD_LIMIT players (docs/design/simplification.md § 1.4)
  | "shield_held" // a streak shield already in reserve
  | "owned" // a cosmetic already had
  | "not_for_sale";

/** What is left of an item's limits for a career this season. */
export function itemsLeft(item: CareerItem, boughtThisSeason: number, boughtInCareer: number): { season: number; career: number | null } {
  const careerLimit = CAREER_LIMITS[item];
  return {
    season: Math.max(0, SEASON_LIMITS[item] - boughtThisSeason),
    career: careerLimit === undefined ? null : Math.max(0, careerLimit - boughtInCareer),
  };
}
