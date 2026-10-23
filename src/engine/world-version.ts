import type { CompetitionTier } from "./tiers";

/**
 * The world a save plays in (Save.worldVersion), fixed at its creation: 1 = the five first divisions, as every save
 * before the second divisions; 2 = the first and second divisions, with promotion and relegation.
 */
export type WorldVersion = 1 | 2;

/** World of the saves the game creates. Stays 1 until the second divisions open to players; tests pass 2. */
export const DEFAULT_WORLD_VERSION: WorldVersion = 1;

/** Competition tiers of a world. */
export function worldTiers(version: WorldVersion): CompetitionTier[] {
  return version === 1 ? [1] : [1, 2];
}

/** A Save.worldVersion read from the database, checked. */
export function worldVersionOf(value: number): WorldVersion {
  if (value === 1 || value === 2) {
    return value;
  }
  throw new RangeError(`Unknown world version: ${value}`);
}
