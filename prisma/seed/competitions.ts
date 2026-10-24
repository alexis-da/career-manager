export type SeedCompetition = {
  code: string; // OpenFootball code, also the data file name: prisma/seed/data/<code>.json
  name: string;
  country: string;
  tier: number;
};

// Display names are neutral on purpose: licensed league names must never reach the game.
export const COMPETITIONS: readonly SeedCompetition[] = [
  { code: "en.1", name: "Angleterre — Division 1", country: "Angleterre", tier: 1 },
  { code: "es.1", name: "Espagne — Division 1", country: "Espagne", tier: 1 },
  { code: "de.1", name: "Allemagne — Division 1", country: "Allemagne", tier: 1 },
  { code: "it.1", name: "Italie — Division 1", country: "Italie", tier: 1 },
  { code: "fr.1", name: "France — Division 1", country: "France", tier: 1 },
  // Second divisions (worldVersion 2 saves): seeded after the first ones, so nothing of the first ones moves.
  { code: "en.2", name: "Angleterre — Division 2", country: "Angleterre", tier: 2 },
  { code: "es.2", name: "Espagne — Division 2", country: "Espagne", tier: 2 },
  { code: "de.2", name: "Allemagne — Division 2", country: "Allemagne", tier: 2 },
  { code: "it.2", name: "Italie — Division 2", country: "Italie", tier: 2 },
  { code: "fr.2", name: "France — Division 2", country: "France", tier: 2 },
];

export type SeedCup = {
  code: string; // "<country code>.cup": no OpenFootball file, its ties are drawn in the game (src/engine/cup.ts)
  name: string;
  country: string; // the country of the leagues whose clubs it gathers
};

// The national cups of worldVersion 2 saves, one per country, gathering its first and second divisions' clubs.
// Competition.kind CUP, tier 0: no reader of the leagues ever takes them for a division.
export const CUP_TIER = 0;
export const CUPS: readonly SeedCup[] = [
  { code: "en.cup", name: "Angleterre — Coupe", country: "Angleterre" },
  { code: "es.cup", name: "Espagne — Coupe", country: "Espagne" },
  { code: "de.cup", name: "Allemagne — Coupe", country: "Allemagne" },
  { code: "it.cup", name: "Italie — Coupe", country: "Italie" },
  { code: "fr.cup", name: "France — Coupe", country: "France" },
];
