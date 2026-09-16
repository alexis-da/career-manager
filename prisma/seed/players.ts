import type { Position } from "../../src/engine/generation";
import { drawBirthDate, drawNameList, drawUniqueName } from "../../src/engine/identity";
import type { NameBank } from "../../src/engine/names";
import { WORLD_START_DATE } from "../../src/engine/world";
import { makeRng, pick, randomInt, weightedIndex } from "../../src/lib/rng";

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

/** The free agent pool, 120 players without a club: the squad template's 2/8/8/5 position shares. */
export const FREE_AGENT_POOL_TEMPLATE: readonly Position[] = [
  ...repeat("GK", 10),
  ...repeat("DF", 42),
  ...repeat("MF", 42),
  ...repeat("FW", 26),
];

export const FREE_AGENT_MIN_AGE = 24;
export const FREE_AGENT_MAX_AGE = 34;

export const MIN_AGE = 17;
export const MAX_AGE = 36;

/** Relative weight of each age from MIN_AGE to MAX_AGE: most players are 21 to 29. */
const AGE_WEIGHTS = [2, 3, 4, 5, 6, 7, 8, 8, 8, 8, 8, 7, 7, 6, 5, 4, 3, 2, 2, 1];

/** Share of players holding the nationality of their club's country; the others get a foreign one. */
export const HOME_NATIONALITY_SHARE = 0.7;

export type SeedPlayer = {
  squadSlot: number;
  firstName: string;
  lastName: string;
  birthDate: Date;
  nationality: string;
  position: Position;
};

export function generateSquad(
  club: { slug: string; country: string },
  names: NameBank,
  worldSeed: string = WORLD_SEED,
): SeedPlayer[] {
  // One stream per club: adding or renaming a club never changes another club's squad.
  const rng = makeRng(`${worldSeed}:squad:${club.slug}`);
  const taken = new Set<string>();

  return SQUAD_TEMPLATE.map((position, index) => {
    const list = drawNameList(rng, names, club.country, HOME_NATIONALITY_SHARE);
    const { firstName, lastName } = drawUniqueName(rng, list, taken);
    const age = MIN_AGE + weightedIndex(rng, AGE_WEIGHTS);
    return {
      squadSlot: index + 1,
      firstName,
      lastName,
      birthDate: drawBirthDate(rng, WORLD_REFERENCE_DATE, age),
      nationality: list.nationality,
      position,
    };
  });
}

/**
 * The free agent pool: world players without a club on 1 July 2024, aged 24 to 34, of any nationality. Its own
 * stream, "world-2024-25:free-agents": the pool and the squads never change each other. squadSlot numbers the
 * pool from 1; names are distinct within it.
 */
export function generateFreeAgentPool(names: NameBank, worldSeed: string = WORLD_SEED): SeedPlayer[] {
  const rng = makeRng(`${worldSeed}:free-agents`);
  const lists = [...names.values()];
  const taken = new Set<string>();

  return FREE_AGENT_POOL_TEMPLATE.map((position, index) => {
    const list = pick(rng, lists);
    const { firstName, lastName } = drawUniqueName(rng, list, taken);
    const age = randomInt(rng, FREE_AGENT_MIN_AGE, FREE_AGENT_MAX_AGE);
    return {
      squadSlot: index + 1,
      firstName,
      lastName,
      birthDate: drawBirthDate(rng, WORLD_REFERENCE_DATE, age),
      nationality: list.nationality,
      position,
    };
  });
}
