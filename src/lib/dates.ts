/** Whole years elapsed between birthDate and date, both read in UTC. */
export function ageInYears(birthDate: Date, date: Date): number {
  const years = date.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = date.getUTCMonth() - birthDate.getUTCMonth();
  const beforeBirthday =
    monthDelta < 0 || (monthDelta === 0 && date.getUTCDate() < birthDate.getUTCDate());
  return beforeBirthday ? years - 1 : years;
}
