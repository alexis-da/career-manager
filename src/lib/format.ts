// In-game dates are stored as UTC midnights: format them in UTC so a French clock never shifts the day.
const TIME_ZONE = "UTC";

const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE });
const shortDate = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE });

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

/** « 17 août 2024 ». */
export function formatDate(date: Date): string {
  return longDate.format(date);
}

/** « sam. 17 août ». */
export function formatShortDate(date: Date): string {
  return shortDate.format(date);
}
