import type { Translator } from "./translator";

// The countries of the game's competitions, by the prefix of their codes (« fr.2 », « en.cup »). The screens name them,
// and the competitions, in the player's language (the world messages): the names in the reference tables are French.

export const COUNTRIES = ["de", "en", "es", "fr", "it"] as const;

export type Country = (typeof COUNTRIES)[number];

function isCountry(value: string): value is Country {
  return (COUNTRIES as readonly string[]).includes(value);
}

/** A country of the game's name in the player's language, from its prefix (« en »); the prefix itself for no country of it. */
export function countryName(prefix: string, t: Translator<"world">): string {
  return isCountry(prefix) ? t(`countries.${prefix}`) : prefix;
}

/** The country of a competition, from its code: « fr.2 » is France's. Throws for a code of no country of the game. */
export function competitionCountry(code: string): Country {
  const [prefix] = code.split(".");
  if (!isCountry(prefix)) {
    throw new Error(`Competition ${code} belongs to no country of the game`);
  }
  return prefix;
}

/** The message key of a European competition: « eu1 » for « eu.1 »; null for any other code. */
export function europeKey(code: string): "eu1" | "eu2" | null {
  return code === "eu.1" ? "eu1" : code === "eu.2" ? "eu2" : null;
}

/**
 * A competition's name in the player's language, from its code: « England — Division 2 », « France — Cup », and a
 * European competition's own: « Laurel Cup ».
 */
export function competitionName(code: string, t: Translator<"world">): string {
  const europe = europeKey(code);
  if (europe !== null) {
    return t(`europe.${europe}`);
  }
  const country = t(`countries.${competitionCountry(code)}`);
  const [, level] = code.split(".");
  return level === "cup" ? t("cup", { country }) : t("league", { country, tier: Number(level) });
}
