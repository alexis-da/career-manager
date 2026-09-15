import { pick, randomInt, type Rng } from "../lib/rng";
import type { NameBank, NameList } from "./names";

const MAX_NAME_ATTEMPTS = 20;
const DAY_MS = 86_400_000;

/** Stable key of a world player in a save: the initial club and the squad slot. */
export function worldPlayerKey(initialClubSlug: string, squadSlot: number): string {
  return `${initialClubSlug}#${squadSlot}`;
}

export type PlayerIdentity = {
  firstName: string;
  lastName: string;
  birthDate: Date;
  nationality: string;
};

/** Name list of a new player: the club's country with probability homeShare, another nationality otherwise. */
export function drawNameList(rng: Rng, names: NameBank, country: string, homeShare: number): NameList {
  const home = names.get(country);
  if (home === undefined) {
    throw new Error(`No name list for "${country}"`);
  }
  return rng() < homeShare ? home : pick(rng, [...names.values()].filter((list) => list.nationality !== country));
}

/** First and last name from a list, never a full name already in `taken`, which is updated. */
export function drawUniqueName(rng: Rng, list: NameList, taken: Set<string>): { firstName: string; lastName: string } {
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
    const firstName = pick(rng, list.firstNames);
    const lastName = pick(rng, list.lastNames);
    const fullName = `${firstName} ${lastName}`;
    if (!taken.has(fullName)) {
      taken.add(fullName);
      return { firstName, lastName };
    }
  }
  throw new Error(`Could not draw a unique name from the "${list.nationality}" list`);
}

/** Birth date making the player exactly `age` whole years old on referenceDate (UTC). */
export function drawBirthDate(rng: Rng, referenceDate: Date, age: number): Date {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const day = referenceDate.getUTCDate();
  // Latest: turns `age` on the reference date. Earliest: the day after turning `age` one year earlier.
  const latest = Date.UTC(year - age, month, day);
  const earliest = Date.UTC(year - age - 1, month, day) + DAY_MS;
  return new Date(latest - randomInt(rng, 0, (latest - earliest) / DAY_MS) * DAY_MS);
}
