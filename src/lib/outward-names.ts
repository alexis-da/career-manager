// What no text the game shows the world may name (CLAUDE.md, « Pas de marques sous licence » and « Communication
// sortante »): third-party brands, licensed competitions and competing games, and the real clubs. « football manager »
// stays allowed in lower case, the genre's own words, never as the name of a game. Pure: the tests of the public pages,
// their metadata, structured data and llms.txt give it their texts and the clubs' real names (prisma/seed).

/** Brands, licensed competitions and competing games, as they are written: matched with their case. */
export const FORBIDDEN_NAMES: readonly string[] = [
  "FIFA",
  "EA FC",
  "EA Sports",
  "EA SPORTS",
  "Football Manager",
  "eFootball",
  "Pro Evolution Soccer",
  "Top Eleven",
  "Online Soccer Manager",
  "Hattrick",
  "Premier League",
  "Ligue 1",
  "Ligue 2",
  "Bundesliga",
  "LaLiga",
  "La Liga",
  "Serie A",
  "Serie B",
  "Champions League",
  "Europa League",
  "Conference League",
  // The official European competitions, in both languages: ours are the Coupe des Lauriers and the Coupe des Fanions.
  "UEFA",
  "Ligue des champions",
  "Ligue Europa",
  "Ligue Europa Conférence",
  "Coupe UEFA",
  "UEFA Cup",
  "Coupe des coupes",
  "Cup Winners' Cup",
  "Intertoto",
  "FA Cup",
  "Coupe de France",
  "Copa del Rey",
  "Coppa Italia",
  "DFB-Pokal",
];

/** The words around a club's name that make no club of their own: « FC », « 1. », « Calcio »… */
const CLUB_AFFIXES = new Set(["FC", "CF", "AFC", "SC", "AC", "AS", "SS", "SSC", "US", "OGC", "RC", "RCD", "CD", "UD", "SD", "SV", "BSC", "1.", "Calcio"]);

/** A club's name without its leading and trailing affixes: « Real Madrid CF » → « Real Madrid », « 1. FC Köln » → « Köln ». */
export function clubNameCore(name: string): string {
  const words = name.split(" ");
  while (words.length > 1 && CLUB_AFFIXES.has(words[0])) {
    words.shift();
  }
  while (words.length > 1 && CLUB_AFFIXES.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(" ");
}

const escapeForRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether `text` holds `name` as words of its own, with its case: « Lensois » does not hold « Lens ». */
function holds(text: string, name: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeForRegExp(name)}(?![\\p{L}\\p{N}])`, "u").test(text);
}

/**
 * The forbidden names a text holds: a brand, a competition or a game of FORBIDDEN_NAMES, a real club's whole name, or
 * the core of it (clubNameCore), but for the cores `allowedCores` lets through, plain words a text may hold of its own
 * (a city named for its hour, a « Nice » that starts a sentence…).
 */
export function forbiddenNamesIn(
  text: string,
  clubNames: readonly string[],
  allowedCores: readonly string[] = [],
): string[] {
  const allowed = new Set(allowedCores);
  const names = new Set([
    ...FORBIDDEN_NAMES,
    ...clubNames,
    ...clubNames.map(clubNameCore).filter((core) => !allowed.has(core)),
  ]);
  return [...names].filter((name) => holds(text, name));
}
