import { FORMATION_PROFILES } from "@/src/engine/balance";
import { FORMATION_NAMES, type FormationName } from "@/src/engine/formations";

/** How a formation leans, from the most attacking to the most defensive: the words of its profile on the lineup screen. */
export const FORMATION_LEANS = [
  "VERY_ATTACKING",
  "MORE_ATTACKING",
  "SLIGHTLY_ATTACKING",
  "BALANCED",
  "SLIGHTLY_DEFENSIVE",
  "MORE_DEFENSIVE",
  "VERY_DEFENSIVE",
] as const;

export type FormationLean = (typeof FORMATION_LEANS)[number];

/** What a formation does to an eleven's attack and defense (FORMATION_PROFILES), in whole percent, and its lean. */
export type FormationProfile = { attack: number; defense: number; lean: FormationLean };

/** Points of spread between attack and defense from which a formation leans more one way, then very much. */
const MORE_SPREAD = 4;
const VERY_SPREAD = 8;

const MINUS = "−";

/** The percent a profile's multiplier adds or takes: 1.03 is +3, 0.97 is −3. */
const percentOf = (multiplier: number): number => Math.round((multiplier - 1) * 100);

/** The lean of a spread, attack less defense: symmetric, the 4-4-2's 0 balanced. */
function leanOf(spread: number): FormationLean {
  if (spread >= VERY_SPREAD) {
    return "VERY_ATTACKING";
  }
  if (spread >= MORE_SPREAD) {
    return "MORE_ATTACKING";
  }
  if (spread > 0) {
    return "SLIGHTLY_ATTACKING";
  }
  if (spread === 0) {
    return "BALANCED";
  }
  if (spread > -MORE_SPREAD) {
    return "SLIGHTLY_DEFENSIVE";
  }
  return spread > -VERY_SPREAD ? "MORE_DEFENSIVE" : "VERY_DEFENSIVE";
}

/** The profile of a formation as the screen says it: « Plus offensif : +3 % en attaque, −3 % en défense ». */
export function formationProfile(formation: FormationName): FormationProfile {
  const attack = percentOf(FORMATION_PROFILES[formation].attack);
  const defense = percentOf(FORMATION_PROFILES[formation].defense);
  return { attack, defense, lean: leanOf(attack - defense) };
}

/** The largest bonus or penalty of a formation, in percent (5): the end of the profile's bars. */
export const PROFILE_SCALE = Math.max(
  1,
  ...FORMATION_NAMES.flatMap((formation) => {
    const { attack, defense } = formationProfile(formation);
    return [Math.abs(attack), Math.abs(defense)];
  }),
);

/** The share of a half bar a bonus or a penalty fills, from the middle, as a CSS width. */
export function profileBarWidth(percent: number): string {
  return `${(Math.min(Math.abs(percent), PROFILE_SCALE) / PROFILE_SCALE) * 50}%`;
}

/**
 * A figure with its sign, the true minus for a negative one and none for zero: « +3 », « −3 », « 0 ». `format` writes
 * its size (a decimal in the player's language); the sign follows the value given, to be rounded as it is shown.
 */
export function signedFigure(value: number, format: (size: number) => string = String): string {
  const figure = format(Math.abs(value));
  return value > 0 ? `+${figure}` : value < 0 ? `${MINUS}${figure}` : figure;
}
