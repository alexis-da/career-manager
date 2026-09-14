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
];
