import { centeredSpread, type Rng } from "../lib/rng";
import {
  AGE_GROWTH_CURVE,
  AGE_QUALITY_CURVE,
  ATTRIBUTE_SPREAD,
  CLUB_LEVEL_BEST,
  CLUB_LEVEL_WORST,
  GROWTH_MIN_SHARE,
  OVERALL_WEIGHTS,
  PLAYER_QUALITY_SPREAD,
  POSITION_PROFILES,
} from "./balance";
import { interpolate, lerp, rankStrength } from "./curves";
import type { Position } from "./positions";

/** Draw order matters for replays: never reorder this list. */
export const ATTRIBUTE_NAMES = [
  "pace",
  "shooting",
  "passing",
  "dribbling",
  "defending",
  "physical",
  "goalkeeping",
] as const;

export type AttributeName = (typeof ATTRIBUTE_NAMES)[number];

export type PlayerProfile = {
  position: Position;
  age: number; // whole years at the save's current date
};

export type PlayerAttributes = Record<AttributeName, number> & {
  overall: number;
  potential: number;
};

export const RATING_MIN = 1;
export const RATING_MAX = 99;

export function clampRating(value: number): number {
  return Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(value)));
}

/** Overall rating of a set of attributes for a position: their weighted mean, rounded. */
export function overallFor(position: Position, attributes: Readonly<Record<AttributeName, number>>): number {
  const weights = OVERALL_WEIGHTS[position];
  return clampRating(ATTRIBUTE_NAMES.reduce((sum, name) => sum + attributes[name] * weights[name], 0));
}

/** Level of a club from its final league rank: CLUB_LEVEL_BEST for the champion, CLUB_LEVEL_WORST for the last. */
export function clubLevelFromRank(rank: number, clubCount: number): number {
  return Math.round(lerp(CLUB_LEVEL_WORST, CLUB_LEVEL_BEST, rankStrength(rank, clubCount)));
}

/**
 * Seed of the stream generating one player's attributes in a save. Built from the stable identity
 * (club slug + squad slot), never from Player.id, which differs from one database to another.
 */
export function attributeRngSeed(saveSeed: string, clubSlug: string, squadSlot: number): string {
  return `${saveSeed}:attributes:${clubSlug}:${squadSlot}`;
}

export function generateAttributes(player: PlayerProfile, clubLevel: number, rng: Rng): PlayerAttributes {
  if (clubLevel < RATING_MIN || clubLevel > RATING_MAX) {
    throw new RangeError(`Club level must be within ${RATING_MIN}–${RATING_MAX}, got ${clubLevel}`);
  }

  const profile = POSITION_PROFILES[player.position];
  const quality =
    clubLevel + interpolate(AGE_QUALITY_CURVE, player.age) + centeredSpread(rng) * PLAYER_QUALITY_SPREAD;

  const attributes = {} as Record<AttributeName, number>; // every key is filled by the loop below
  for (const name of ATTRIBUTE_NAMES) {
    attributes[name] = clampRating(quality + profile[name] + centeredSpread(rng) * ATTRIBUTE_SPREAD);
  }

  const overall = overallFor(player.position, attributes);
  const growthRoom = interpolate(AGE_GROWTH_CURVE, player.age);
  const potential = clampRating(overall + growthRoom * (GROWTH_MIN_SHARE + (1 - GROWTH_MIN_SHARE) * rng()));

  return { overall, potential, ...attributes };
}

const MAX_SHIFT_PASSES = 6;

/**
 * Moves the attributes until the overall reaches `overall`. The first pass shifts every attribute by the
 * gap. The overall is a rounded weighted mean: when it sits on a .5, whole shifts keep it there and rounding
 * can miss the target, so later passes move only the attribute weighing most for the position.
 */
export function shiftToOverall(
  position: Position,
  attributes: Readonly<Record<AttributeName, number>>,
  overall: number,
): Record<AttributeName, number> & { overall: number } {
  const weights = OVERALL_WEIGHTS[position];
  const heaviest = ATTRIBUTE_NAMES.reduce((best, name) => (weights[name] > weights[best] ? name : best));
  let shifted = {} as Record<AttributeName, number>; // every key is filled by the loop below
  for (const name of ATTRIBUTE_NAMES) {
    shifted[name] = attributes[name];
  }
  let current = overallFor(position, shifted);

  for (let pass = 0; pass < MAX_SHIFT_PASSES && current !== overall; pass++) {
    const gap = overall - current;
    const next = { ...shifted };
    if (pass === 0) {
      for (const name of ATTRIBUTE_NAMES) {
        next[name] = clampRating(shifted[name] + gap);
      }
    } else {
      next[heaviest] = clampRating(shifted[heaviest] + Math.sign(gap));
    }
    shifted = next;
    current = overallFor(position, shifted);
  }
  return { ...shifted, overall: current };
}
