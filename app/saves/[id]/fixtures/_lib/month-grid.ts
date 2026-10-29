import { SEASON_START_MONTH } from "@/src/engine/world";
import { INTL_LOCALES, type Locale } from "@/src/i18n/locale";

const DAY_MS = 86_400_000;
const MONTHS_PER_SEASON = 12;
/** A Monday, 27 July 2026: the weekdays are named from its week. */
const A_MONDAY = Date.UTC(2026, 6, 27);

/** A month of the calendar; month is 0-based, as in Date.UTC. */
export type Month = { year: number; month: number };

/** « 2026-08-15 »: the key of an in-game day, a UTC midnight. */
export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/** « 2026-08 », the month's search param. */
export const monthParam = ({ year, month }: Month): string => `${year}-${String(month + 1).padStart(2, "0")}`;

export const monthOf = (date: Date): Month => ({ year: date.getUTCFullYear(), month: date.getUTCMonth() });

export const firstDayOf = ({ year, month }: Month): Date => new Date(Date.UTC(year, month, 1));

const sameMonth = (a: Month, b: Month): boolean => a.year === b.year && a.month === b.month;

/** The twelve months of the season starting in startYear, July to June. */
export function seasonMonths(startYear: number): Month[] {
  return Array.from({ length: MONTHS_PER_SEASON }, (_, index) => monthOf(new Date(Date.UTC(startYear, SEASON_START_MONTH + index, 1))));
}

/** The month a search param names, when it is one of the season's months; else the fallback. */
export function monthFromParam(value: string | undefined, months: readonly Month[], fallback: Month): Month {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (match !== null) {
    const wanted = { year: Number(match[1]), month: Number(match[2]) - 1 };
    const found = months.find((month) => sameMonth(month, wanted));
    if (found !== undefined) {
      return found;
    }
  }
  return months.find((month) => sameMonth(month, fallback)) ?? months[0];
}

/** The grid's column headers, Monday first, in the player's language: « Lun. », « Mar. »…, « Mon », « Tue »… */
export function weekdayNames(locale: Locale): string[] {
  const format = new Intl.DateTimeFormat(INTL_LOCALES[locale], { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, day) => {
    const name = format.format(new Date(A_MONDAY + day * DAY_MS));
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
}

/**
 * The weeks of a month's grid, Monday first: every day of the month, with the days of the neighbouring months that
 * complete its first and last weeks.
 */
export function monthWeeks(month: Month): Date[][] {
  const first = firstDayOf(month);
  const daysSinceMonday = (first.getUTCDay() + 6) % 7;
  const start = first.getTime() - daysSinceMonday * DAY_MS;
  const last = new Date(Date.UTC(month.year, month.month + 1, 0));
  const daysUntilSunday = (7 - last.getUTCDay()) % 7;
  const end = last.getTime() + daysUntilSunday * DAY_MS;

  const weeks: Date[][] = [];
  for (let time = start; time <= end; time += 7 * DAY_MS) {
    weeks.push(Array.from({ length: 7 }, (_, day) => new Date(time + day * DAY_MS)));
  }
  return weeks;
}
