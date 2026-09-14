import { readdirSync, readFileSync } from "node:fs";
import * as z from "zod";
import type { Position } from "../../src/engine/generation";
import { WORLD_START_DATE } from "../../src/engine/world";
import { makeRng, pick, randomInt, weightedIndex, type Rng } from "../../src/lib/rng";

/** Fixed world seed: player identities are the same on every seed run, and shared by every save. */
export const WORLD_SEED = "world-2024-25";

/** Ages are counted on the day every save starts, 1 July 2024. */
export const WORLD_REFERENCE_DATE = WORLD_START_DATE;

const repeat = (position: Position, count: number): Position[] => Array.from({ length: count }, () => position);

/** Squad slots in order. A player's slot (1-based index) is their stable identity within the club. */
export const SQUAD_TEMPLATE: readonly Position[] = [
  ...repeat("GK", 2),
  ...repeat("DF", 8),
  ...repeat("MF", 8),
  ...repeat("FW", 5),
];

export const MIN_AGE = 17;
export const MAX_AGE = 36;

/** Relative weight of each age from MIN_AGE to MAX_AGE: most players are 21 to 29. */
const AGE_WEIGHTS = [2, 3, 4, 5, 6, 7, 8, 8, 8, 8, 8, 7, 7, 6, 5, 4, 3, 2, 2, 1];

/** Share of players holding the nationality of their club's country; the others get a foreign one. */
export const HOME_NATIONALITY_SHARE = 0.7;

const MAX_NAME_ATTEMPTS = 20;
const DAY_MS = 86_400_000;

const NAMES_DIR = new URL("./data/names/", import.meta.url);

const namesSchema = z
  .array(z.string().min(1))
  .min(20)
  .refine((names) => new Set(names).size === names.length, "Names must be unique");

const nameListSchema = z.object({
  nationality: z.string().min(1), // same label as Club.country
  firstNames: namesSchema,
  lastNames: namesSchema,
});

export type NameList = z.infer<typeof nameListSchema>;

/** Name lists keyed by nationality, in file name order. */
export type NameBank = ReadonlyMap<string, NameList>;

export type SeedPlayer = {
  squadSlot: number;
  firstName: string;
  lastName: string;
  birthDate: Date;
  nationality: string;
  position: Position;
};

export function readNameBank(): NameBank {
  const bank = new Map<string, NameList>();
  const files = readdirSync(NAMES_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const file of files) {
    const result = nameListSchema.safeParse(JSON.parse(readFileSync(new URL(file, NAMES_DIR), "utf8")));
    if (!result.success) {
      throw new Error(`Invalid name list ${file}:\n${z.prettifyError(result.error)}`);
    }
    if (bank.has(result.data.nationality)) {
      throw new Error(`Nationality "${result.data.nationality}" is defined twice (${file})`);
    }
    bank.set(result.data.nationality, result.data);
  }
  return bank;
}

function drawUniqueName(rng: Rng, list: NameList, taken: Set<string>): { firstName: string; lastName: string } {
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

/** Birth date making the player between MIN_AGE and MAX_AGE, in whole years, on WORLD_REFERENCE_DATE. */
function drawBirthDate(rng: Rng): Date {
  const age = MIN_AGE + weightedIndex(rng, AGE_WEIGHTS);
  const year = WORLD_REFERENCE_DATE.getUTCFullYear();
  const month = WORLD_REFERENCE_DATE.getUTCMonth();
  const day = WORLD_REFERENCE_DATE.getUTCDate();
  // Latest: turns `age` on the reference date. Earliest: the day after turning `age` one year earlier.
  const latest = Date.UTC(year - age, month, day);
  const earliest = Date.UTC(year - age - 1, month, day) + DAY_MS;
  return new Date(latest - randomInt(rng, 0, (latest - earliest) / DAY_MS) * DAY_MS);
}

export function generateSquad(
  club: { slug: string; country: string },
  names: NameBank,
  worldSeed: string = WORLD_SEED,
): SeedPlayer[] {
  const home = names.get(club.country);
  if (home === undefined) {
    throw new Error(`No name list for "${club.country}" (club ${club.slug})`);
  }
  const foreign = [...names.values()].filter((list) => list.nationality !== club.country);
  // One stream per club: adding or renaming a club never changes another club's squad.
  const rng = makeRng(`${worldSeed}:squad:${club.slug}`);
  const taken = new Set<string>();

  return SQUAD_TEMPLATE.map((position, index) => {
    const list = rng() < HOME_NATIONALITY_SHARE ? home : pick(rng, foreign);
    const { firstName, lastName } = drawUniqueName(rng, list, taken);
    return {
      squadSlot: index + 1,
      firstName,
      lastName,
      birthDate: drawBirthDate(rng),
      nationality: list.nationality,
      position,
    };
  });
}
