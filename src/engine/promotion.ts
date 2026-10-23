import type { StandingRow } from "./standings";
import type { CompetitionTier } from "./tiers";

export type MoveReason = "PROMOTED" | "RELEGATED";

/** A competition's final table, its clubs keyed as the table keys them (the slug, as computeStandings sorts them). */
export type CompetitionStanding = {
  code: string; // OpenFootball code: "en.1"; its prefix is the country
  tier: CompetitionTier;
  table: readonly Pick<StandingRow, "club" | "rank">[];
};

/** A club changing division at the end of a season. */
export type ClubMove = {
  club: string; // the table's key
  from: string; // competition code
  to: string;
  reason: MoveReason;
  rank: number; // final rank in the competition it leaves
};

/** Country of a competition: the prefix of its code, "en" for "en.2". */
export function countryOf(code: string): string {
  const [country] = code.split(".");
  return country;
}

/**
 * The moves between first and second divisions at the end of a season: for each country with both a tier 1 and a tier 2
 * competition among the standings, the N last of the first division go down and the N first of the second go up, N from
 * the rules (PROMOTION_RELEGATION). The order is the tables' own, ties included: a table from computeStandings breaks
 * them by goal difference, goals scored, then key, as the league table shows. A country with one division (every
 * worldVersion 1 save) moves no club. Moves come out country by country in code order, relegations first.
 */
export function applyPromotionRelegation(
  standings: readonly CompetitionStanding[],
  rules: Readonly<Record<string, number>>,
): ClubMove[] {
  const byCountry = Map.groupBy(standings, (standing) => countryOf(standing.code));
  const moves: ClubMove[] = [];

  for (const country of [...byCountry.keys()].sort()) {
    const competitions = byCountry.get(country) ?? [];
    const first = competitions.filter((standing) => standing.tier === 1);
    const second = competitions.filter((standing) => standing.tier === 2);
    if (first.length === 0 || second.length === 0) {
      continue;
    }
    if (first.length > 1 || second.length > 1) {
      throw new Error(`Country ${country} has several competitions of the same tier`);
    }
    const [upper] = first;
    const [lower] = second;
    const count = rules[country];
    if (count === undefined || !Number.isInteger(count) || count < 1) {
      throw new Error(`No promotion and relegation rule for country ${country}`);
    }
    if (upper.table.length <= count || lower.table.length <= count) {
      throw new RangeError(`Country ${country}: ${count} moves need more than ${count} clubs in each division`);
    }

    const byRank = (table: CompetitionStanding["table"]) => [...table].sort((a, b) => a.rank - b.rank);
    for (const row of byRank(upper.table).slice(-count)) {
      moves.push({ club: row.club, from: upper.code, to: lower.code, reason: "RELEGATED", rank: row.rank });
    }
    for (const row of byRank(lower.table).slice(0, count)) {
      moves.push({ club: row.club, from: lower.code, to: upper.code, reason: "PROMOTED", rank: row.rank });
    }
  }
  return moves;
}
