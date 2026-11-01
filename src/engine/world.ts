/** A season runs from 1 July to 30 June. Months are 0-based, as in Date.UTC. */
export const SEASON_START_MONTH = 6;

const JANUARY = 0;
const AUGUST = 7;
const SATURDAY = 6;
const DAY_MS = 86_400_000;

export type TransferWindow = "summer" | "winter";

/** Start year of every new save's first season: the one place that sets the game's year. */
export const WORLD_START_YEAR = 2026;

/** First day of the season starting in startYear: 1 July. */
export function seasonStartDate(startYear: number): Date {
  return new Date(Date.UTC(startYear, SEASON_START_MONTH, 1));
}

/** Every new save starts on 1 July of WORLD_START_YEAR. A fixed date, never the clock. */
export const WORLD_START_DATE = seasonStartDate(WORLD_START_YEAR);

/** Short name of the season starting in startYear: « 2026-27 ». */
export function seasonLabel(startYear: number): string {
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

/** First matchday of a season: the third Saturday of August (15 August 2026, 21 August 2027). */
export function firstMatchdayDate(startYear: number): Date {
  const firstOfAugust = Date.UTC(startYear, AUGUST, 1);
  const daysToFirstSaturday = (SATURDAY - new Date(firstOfAugust).getUTCDay() + 7) % 7;
  return new Date(firstOfAugust + (daysToFirstSaturday + 14) * DAY_MS);
}

/** Start year of the season a date belongs to: 2026 for any date from 1 July 2026 to 30 June 2027. */
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

/** First day of the transfer window open on a date (1 July or 1 January), or null when none is open. */
export function transferWindowOpenDate(date: Date): Date | null {
  const window = transferWindowAt(date);
  if (window === null) {
    return null;
  }
  const year = date.getUTCFullYear();
  return window === "summer" ? seasonStartDate(year) : new Date(Date.UTC(year, JANUARY, 1));
}

/** Last day of the transfer window open on a date (31 August or 31 January), or null when none is open. */
export function transferWindowCloseDate(date: Date): Date | null {
  const window = transferWindowAt(date);
  if (window === null) {
    return null;
  }
  const year = date.getUTCFullYear();
  return window === "summer" ? new Date(Date.UTC(year, AUGUST, 31)) : new Date(Date.UTC(year, JANUARY, 31));
}

/** First day of the next transfer window to open after the current one: 1 January or 1 July. */
export function nextTransferWindowOpening(date: Date): Date {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= SEASON_START_MONTH
    ? new Date(Date.UTC(year + 1, JANUARY, 1))
    : new Date(Date.UTC(year, SEASON_START_MONTH, 1));
}

/** Last day of the transfer window open on a date, or else of the next one to open: 31 August or 31 January. */
export function upcomingWindowCloseDate(date: Date): Date {
  const open = transferWindowCloseDate(date);
  if (open !== null) {
    return open;
  }
  const nextOpening = nextTransferWindowOpening(date);
  const close = transferWindowCloseDate(nextOpening);
  if (close === null) {
    throw new Error(`No transfer window opens on ${nextOpening.toISOString()}`);
  }
  return close;
}

/** Last day of the month a date falls in. */
export function monthEndDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export type TransferWindowBound = {
  date: Date;
  window: TransferWindow;
  bound: "open" | "close";
};

/** Opening and closing days of the two transfer windows of the season starting in startYear, in date order. */
export function transferWindowBounds(startYear: number): TransferWindowBound[] {
  return [
    { date: seasonStartDate(startYear), window: "summer", bound: "open" },
    { date: new Date(Date.UTC(startYear, AUGUST, 31)), window: "summer", bound: "close" },
    { date: new Date(Date.UTC(startYear + 1, JANUARY, 1)), window: "winter", bound: "open" },
    { date: new Date(Date.UTC(startYear + 1, JANUARY, 31)), window: "winter", bound: "close" },
  ];
}
