/** Whole years elapsed between birthDate and date, both read in UTC. */
export function ageInYears(birthDate: Date, date: Date): number {
  const years = date.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = date.getUTCMonth() - birthDate.getUTCMonth();
  const beforeBirthday =
    monthDelta < 0 || (monthDelta === 0 && date.getUTCDate() < birthDate.getUTCDate());
  return beforeBirthday ? years - 1 : years;
}

/**
 * The same day `years` later, in UTC. 29 February becomes 28 February in a common year, as PostgreSQL's
 * `+ interval 'N years'` does: a date shifted here and one shifted by a migration stay equal.
 */
export function addYears(date: Date, years: number): Date {
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDayOfMonth)));
}
