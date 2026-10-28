// ISO 8601 weeks in UTC, those of the weekly challenge: Monday to Sunday, week 1 being the one with the year's first
// Thursday, so that a year has 52 or 53 weeks (2026 has 53: 28 December 2026 to 3 January 2027). Pure: the date is
// passed in; the real time of a request is the caller's.

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const WEEK_KEY = /^(\d{4})-W(\d{2})$/;

/** Days since Monday of a UTC date: 0 for Monday, 6 for Sunday. */
const daysSinceMonday = (time: number): number => (new Date(time).getUTCDay() + 6) % 7;

/** The ISO week of a date in UTC, « 2026-W45 »: its year is the one of the week's Thursday. */
export function isoWeekKey(date: Date): string {
  const thursday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday(date.getTime()) + 3);
  const year = new Date(thursday).getUTCFullYear();
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / WEEK_MS);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** An ISO week's bounds: its Monday at 00:00 UTC, and the next one's, excluded. Throws on a key that is no week. */
export function isoWeekBounds(weekKey: string): { startsAt: Date; endsAt: Date } {
  const match = WEEK_KEY.exec(weekKey);
  if (match === null) {
    throw new RangeError(`Not an ISO week key (YYYY-Www): ${weekKey}`);
  }
  // Week 1 is the one of 4 January.
  const january4 = Date.UTC(Number(match[1]), 0, 4);
  const startsAt = new Date(january4 - daysSinceMonday(january4) * DAY_MS + (Number(match[2]) - 1) * WEEK_MS);
  // Week 00, or a 53rd week in a year of 52, lands in another year's week.
  if (isoWeekKey(startsAt) !== weekKey) {
    throw new RangeError(`No such ISO week: ${weekKey}`);
  }
  return { startsAt, endsAt: new Date(startsAt.getTime() + WEEK_MS) };
}

/** The ISO week before this one, across years too: « 2027-W01 » follows « 2026-W53 ». */
export function previousIsoWeekKey(weekKey: string): string {
  return isoWeekKey(new Date(isoWeekBounds(weekKey).startsAt.getTime() - WEEK_MS));
}

/** The number of an ISO week, 1 to 53: 45 for « 2026-W45 ». */
export function isoWeekNumber(weekKey: string): number {
  isoWeekBounds(weekKey);
  return Number(weekKey.slice(-2));
}
