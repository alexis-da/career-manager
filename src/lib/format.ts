import { INTL_LOCALES, type Locale } from "../i18n/locale";

// Each function writes in the player's language (src/i18n/locale.ts), French unless told otherwise: French as in
// France, English as in Britain (en-GB), for dates as for amounts.

// In-game dates are stored as UTC midnights: format them in UTC so a French clock never shifts the day.
const TIME_ZONE = "UTC";

// Real times, not in-game dates (the weekly challenge's end, its saves' purge): in the players' clock, Paris time.
const PARIS = "Europe/Paris";

function formattersOf(tag: string) {
  return {
    decimal: new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }),
    oneDecimal: new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    integer: new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }),
    longDate: new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE }),
    shortDate: new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE }),
    dayDate: new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE }),
    shortMonth: new Intl.DateTimeFormat(tag, { month: "short", timeZone: TIME_ZONE }),
    monthYear: new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: TIME_ZONE }),
    parisDateTime: new Intl.DateTimeFormat(tag, {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: PARIS,
    }),
    parisDay: new Intl.DateTimeFormat(tag, { weekday: "long", day: "2-digit", month: "2-digit", timeZone: PARIS }),
  };
}

const FORMATTERS: Record<Locale, ReturnType<typeof formattersOf>> = {
  fr: formattersOf(INTL_LOCALES.fr),
  en: formattersOf(INTL_LOCALES.en),
};

/** Amount in euros: « 12,5 M€ », « 850 k€ », « 900 € »; in English « €12.5m », « €850k », « €900 ». */
export function formatMoney(euros: number, locale: Locale = "fr"): string {
  const { decimal, integer } = FORMATTERS[locale];
  const magnitude = Math.abs(euros);
  const [amount, unit] =
    magnitude >= 1_000_000
      ? [decimal.format(magnitude / 1_000_000), "M"]
      : magnitude >= 1_000
        ? [decimal.format(magnitude / 1_000), "k"]
        : [integer.format(magnitude), ""];
  const sign = euros < 0 ? "-" : "";
  return locale === "fr" ? `${sign}${amount} ${unit}€` : `${sign}€${amount}${unit.toLowerCase()}`;
}

/** Millions with one decimal and no unit, for large figures: « 45,0 », « 38,2 » (« 45.0 » in English). */
export function formatMillions(euros: number, locale: Locale = "fr"): string {
  return FORMATTERS[locale].oneDecimal.format(euros / 1_000_000);
}

/** One decimal: « 68,2 » (« 68.2 » in English). */
export function formatDecimal(value: number, locale: Locale = "fr"): string {
  return FORMATTERS[locale].oneDecimal.format(value);
}

/** « 17 août 2026 », « 1er juillet 2026 »: the French ordinal for the first, as formatDayMonth. « 1 July 2026 ». */
export function formatDate(date: Date, locale: Locale = "fr"): string {
  const { longDate, monthYear } = FORMATTERS[locale];
  return locale === "fr" && date.getUTCDate() === 1 ? `1er ${monthYear.format(date)}` : longDate.format(date);
}

/** « sam. 17 août », « Sat 17 Aug ». */
export function formatShortDate(date: Date, locale: Locale = "fr"): string {
  return FORMATTERS[locale].shortDate.format(date);
}

/** « sam. 14 sept. 2024 », « Sat, 14 Sept 2024 ». */
export function formatDayDate(date: Date, locale: Locale = "fr"): string {
  return FORMATTERS[locale].dayDate.format(date);
}

/** « 1er janv. », « 31 août »: the day and the short month, with the French ordinal for the first. « 1 Jan ». */
export function formatDayMonth(date: Date, locale: Locale = "fr"): string {
  const day = date.getUTCDate();
  return `${locale === "fr" && day === 1 ? "1er" : day} ${FORMATTERS[locale].shortMonth.format(date)}`;
}

/** « septembre 2026 », « September 2026 ». */
export function formatMonth(date: Date, locale: Locale = "fr"): string {
  return FORMATTERS[locale].monthYear.format(date);
}

/** A real time in Paris: « lundi 2 novembre à 01:00 », « Monday 2 November at 01:00 ». */
export function formatParisDateTime(date: Date, locale: Locale = "fr"): string {
  return FORMATTERS[locale].parisDateTime.format(date);
}

/** A real day in Paris: « mardi 03/11 », « Tuesday 03/11 ». */
export function formatParisDay(date: Date, locale: Locale = "fr"): string {
  return FORMATTERS[locale].parisDay.format(date);
}

/** A goal difference with its sign when positive: « +4 », « 0 », « -2 ». */
export function formatGoalDifference(difference: number): string {
  return difference > 0 ? `+${difference}` : `${difference}`;
}
