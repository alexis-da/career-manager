/** A season runs from 1 July to 30 June. Months are 0-based, as in Date.UTC. */
export const SEASON_START_MONTH = 6;

/** Every new save starts on 1 July 2024. A fixed date, never the clock. */
export const WORLD_START_DATE = new Date(Date.UTC(2024, SEASON_START_MONTH, 1));

/** First matchday of the 2024-25 season, Saturday 17 August 2024; matchdays then come one week apart. */
export const FIRST_MATCHDAY_DATE = new Date(Date.UTC(2024, 7, 17));

/** Start year of the season a date belongs to: 2024 for any date from 1 July 2024 to 30 June 2025. */
export function seasonStartYear(date: Date): number {
  return date.getUTCMonth() >= SEASON_START_MONTH ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/** Last day of the season starting in startYear: 30 June of the following year. */
export function seasonEndDate(startYear: number): Date {
  return new Date(Date.UTC(startYear + 1, SEASON_START_MONTH - 1, 30));
}
