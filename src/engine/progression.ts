import { centeredSpread, type Rng } from "../lib/rng";
import {
  ATTRIBUTE_PROGRESSION_SPREAD,
  DECLINE_ATTRIBUTE_FACTORS,
  DECLINE_BY_AGE,
  GROWTH_BY_MINUTES,
  GROWTH_END_AGE,
  GROWTH_SHARE_BY_AGE,
  PROGRESSION_SPREAD,
  RETIREMENT_CHANCE_BY_AGE,
} from "./balance";
import { interpolate } from "./curves";
import {
  ATTRIBUTE_NAMES,
  clampRating,
  overallFor,
  type AttributeName,
  type PlayerAttributes,
  type Position,
} from "./generation";

export type ProgressingPlayer = PlayerAttributes & { position: Position };

/**
 * Seed of a player's end-of-season stream: the season that ends and the player's stable key
 * (`initial club slug#squadSlot`), never PlayerSave.id, which differs from one database to another.
 */
export function progressionRngSeed(saveSeed: string, startYear: number, playerKey: string): string {
  return `${saveSeed}:progression:${startYear}:${playerKey}`;
}

/**
 * Attributes after a season. Players grow toward their potential according to their age and minutes
 * played, decline after 30 (physical attributes first), and every season has a seeded random share.
 * `age` is the player's age at the start of the next season.
 */
export function progressPlayer(
  player: ProgressingPlayer,
  age: number,
  minutesPlayed: number,
  rng: Rng,
): PlayerAttributes {
  const growthRoom = Math.max(0, player.potential - player.overall);
  const growth =
    growthRoom * interpolate(GROWTH_SHARE_BY_AGE, age) * interpolate(GROWTH_BY_MINUTES, minutesPlayed);
  const change = growth - interpolate(DECLINE_BY_AGE, age) + centeredSpread(rng) * PROGRESSION_SPREAD;

  const attributes = {} as Record<AttributeName, number>; // every key is filled by the loop below
  for (const name of ATTRIBUTE_NAMES) {
    const factor = change < 0 ? DECLINE_ATTRIBUTE_FACTORS[name] : 1;
    attributes[name] = clampRating(
      player[name] + change * factor + centeredSpread(rng) * ATTRIBUTE_PROGRESSION_SPREAD,
    );
  }

  const overall = overallFor(player.position, attributes);
  const potential = age >= GROWTH_END_AGE ? overall : Math.max(player.potential, overall);
  return { overall, potential, ...attributes };
}

/** Whether a player retires at the end of the season. Draw it after progressPlayer, on the same stream. */
export function willRetire(age: number, rng: Rng): boolean {
  return rng() < interpolate(RETIREMENT_CHANCE_BY_AGE, age);
}
