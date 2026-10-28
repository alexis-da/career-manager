// The countries of the game's competitions, by the prefix of their codes (« fr.2 », « en.cup »). The screens name them
// in the player's language (the countries messages): the competitions' own names, in the reference tables, are French.

export const COUNTRIES = ["de", "en", "es", "fr", "it"] as const;

export type Country = (typeof COUNTRIES)[number];

function isCountry(value: string): value is Country {
  return (COUNTRIES as readonly string[]).includes(value);
}

/** The country of a competition, from its code: « fr.2 » is France's. Throws for a code of no country of the game. */
export function competitionCountry(code: string): Country {
  const [prefix] = code.split(".");
  if (!isCountry(prefix)) {
    throw new Error(`Competition ${code} belongs to no country of the game`);
  }
  return prefix;
}
