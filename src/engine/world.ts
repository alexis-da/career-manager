/** A season runs from 1 July to 30 June. Months are 0-based, as in Date.UTC. */
export const SEASON_START_MONTH = 6;

const JANUARY = 0;
const AUGUST = 7;
const SATURDAY = 6;
const DAY_MS = 86_400_000;

export type TransferWindow = "summer" | "winter";

/** First day of the season starting in startYear: 1 July. */
export function seasonStartDate(startYear: number): Date {
  return new Date(Date.UTC(startYear, SEASON_START_MONTH, 1));
}

/** Every new save starts on 1 July 2024. A fixed date, never the clock. */
export const WORLD_START_DATE = seasonStartDate(2024);

/** First matchday of a season: the third Saturday of August (17 August 2024, 16 August 2025). */
export function firstMatchdayDate(startYear: number): Date {
  const firstOfAugust = Date.UTC(startYear, AUGUST, 1);
  const daysToFirstSaturday = (SATURDAY - new Date(firstOfAugust).getUTCDay() + 7) % 7;
  return new Date(firstOfAugust + (daysToFirstSaturday + 14) * DAY_MS);
}

/** Start year of the season a date belongs to: 2024 for any date from 1 July 2024 to 30 June 2025. */
export function seasonStartYear(date: Date): number {
  return date.getUTCMonth() >= SEASON_START_MONTH ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/** Last day of the season starting in startYear: 30 June of the following year. */
export function seasonEndDate(startYear: number): Date {
  return new Date(Date.UTC(startYear + 1, SEASON_START_MONTH - 1, 30));
}

/** Transfer window open on a date: summer from 1 July to 31 August, winter from 1 to 31 January. */
export function transferWindowAt(date: Date): TransferWindow | null {
  const month = date.getUTCMonth();
  if (month === SEASON_START_MONTH || month === AUGUST) {
    return "summer";
  }
  return month === JANUARY ? "winter" : null;
}

export function isTransferWindowOpen(date: Date): boolean {
  return transferWindowAt(date) !== null;
}
