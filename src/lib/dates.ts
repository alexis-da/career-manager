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

/**
 * The earliest birth date of a player at most maxAge on `date`, as ageInYears counts: born on or after it, for a filter
 * the database applies. He is maxAge + 1 or more once (birth year, month, day) ≤ (date's year − maxAge − 1, month, day):
 * at most maxAge when born after that day, from midnight UTC the next day on; a 29 February that the year lacks is
 * followed by 1 March.
 */
export function earliestBirthForMaxAge(maxAge: number, date: Date): Date {
  const year = date.getUTCFullYear() - maxAge - 1;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const exists = new Date(Date.UTC(year, month, day)).getUTCMonth() === month;
  return new Date(exists ? Date.UTC(year, month, day + 1) : Date.UTC(year, month + 1, 1));
}
