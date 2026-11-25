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
} from "./generation";
import type { Position } from "./positions";

export type ProgressingPlayer = PlayerAttributes & { position: Position };

/**
 * Seed of a player's end-of-season stream: the season that ends and the player's stable key
 * (`initial club slug#squadSlot`), never PlayerSave.id, which differs from one database to another.
 */
export function progressionRngSeed(saveSeed: string, startYear: number, playerKey: string): string {
  return `${saveSeed}:progression:${startYear}:${playerKey}`;
}

/**
 * The change of a player's overall a season's turn gives on average, without its draw: the growth of his room (potential
 * above overall) at his age and minutes, less his age's decline. `age` is his age at the start of the next season, as
 * progressPlayer's, and `minutesPlayed` his league minutes of the season. What the squad shows of the summer to come
 * (docs/design/effectif-adjoint.md § 3.2), never the turn's result: its draw stays hidden, seeded with the retirement's.
 */
export function expectedProgression(player: { overall: number; potential: number }, age: number, minutesPlayed: number): number {
  const growthRoom = Math.max(0, player.potential - player.overall);
  const growth =
    growthRoom * interpolate(GROWTH_SHARE_BY_AGE, age) * interpolate(GROWTH_BY_MINUTES, minutesPlayed);
  return growth - interpolate(DECLINE_BY_AGE, age);
}

/**
 * A player's league minutes at the season's end if he keeps his rhythm: his minutes so far, prorated to the league
 * matches of his club's season over those it has played. 0 before its first: no rhythm yet.
 */
export function projectedLeagueMinutes(minutes: number, clubMatchesPlayed: number, clubMatches: number): number {
  return clubMatchesPlayed <= 0 ? 0 : (minutes * Math.max(clubMatches, clubMatchesPlayed)) / clubMatchesPlayed;
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
  // The same operations, in the same order, as before expectedProgression: a save replays its seasons to the bit.
  const change = expectedProgression(player, age, minutesPlayed) + centeredSpread(rng) * PROGRESSION_SPREAD;

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
