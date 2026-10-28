// In-game dates are stored as UTC midnights: format them in UTC so a French clock never shifts the day.
const TIME_ZONE = "UTC";

const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const oneDecimal = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE });
const shortDate = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE });
const dayDate = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const shortMonth = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: TIME_ZONE });
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: TIME_ZONE });

// Real times, not in-game dates (the weekly challenge's end, its saves' purge): in the players' clock, Paris time.
const PARIS = "Europe/Paris";
const parisDateTime = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: PARIS,
});
const parisDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: PARIS });

/** Amount in euros: « 12,5 M€ », « 850 k€ », « 900 € ». */
export function formatMoney(euros: number): string {
  const magnitude = Math.abs(euros);
  if (magnitude >= 1_000_000) {
    return `${decimal.format(euros / 1_000_000)} M€`;
  }
  if (magnitude >= 1_000) {
    return `${decimal.format(euros / 1_000)} k€`;
  }
  return `${integer.format(euros)} €`;
}

/** Millions with one decimal and no unit, for large figures: « 45,0 », « 38,2 ». */
export function formatMillions(euros: number): string {
  return oneDecimal.format(euros / 1_000_000);
}

/** One decimal: « 68,2 ». */
export function formatDecimal(value: number): string {
  return oneDecimal.format(value);
}

/** « 17 août 2026 », « 1er juillet 2026 »: the French ordinal for the first, as formatDayMonth. */
export function formatDate(date: Date): string {
  return date.getUTCDate() === 1 ? `1er ${monthYear.format(date)}` : longDate.format(date);
}

/** « sam. 17 août ». */
export function formatShortDate(date: Date): string {
  return shortDate.format(date);
}

/** « sam. 14 sept. 2024 ». */
export function formatDayDate(date: Date): string {
  return dayDate.format(date);
}

/** « 1er janv. », « 31 août »: the day and the short month, with the French ordinal for the first. */
export function formatDayMonth(date: Date): string {
  const day = date.getUTCDate();
  return `${day === 1 ? "1er" : day} ${shortMonth.format(date)}`;
}

/** « septembre 2026 ». */
export function formatMonth(date: Date): string {
  return monthYear.format(date);
}

/** A real time in Paris: « lundi 2 novembre à 01:00 ». */
export function formatParisDateTime(date: Date): string {
  return parisDateTime.format(date);
}

/** A real day in Paris: « mardi 03/11 ». */
export function formatParisDay(date: Date): string {
  return parisDay.format(date);
}

/** A goal difference with its sign when positive: « +4 », « 0 », « -2 ». */
export function formatGoalDifference(difference: number): string {
  return difference > 0 ? `+${difference}` : `${difference}`;
}
