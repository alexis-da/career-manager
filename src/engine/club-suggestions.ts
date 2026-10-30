import { clubFinances } from "./economy";
import type { CompetitionTier } from "./tiers";

// The three clubs the creation form suggests to a new player, one per difficulty, among one country's clubs. Pure, and
// a fixed rule on the source season's ranks: every visitor of one language sees the same three clubs.

export const SUGGESTION_KINDS = ["favourite", "mid-table", "comeback"] as const;

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** A club of a division, with its rank in the source season. */
export type SuggestableClub = { id: string; name: string; rank: number };

export type SuggestableCompetition = { tier: CompetitionTier; clubs: readonly SuggestableClub[] };

export type ClubSuggestion = {
  kind: SuggestionKind;
  clubId: string;
  name: string;
  budget: number; // euros: the transfer budget it starts with
};

/**
 * Three clubs of a country: the first division's champion; a club of the middle of the first division, the first of its
 * lower half; a club of the middle of the second division, the last of its upper half, with a real chance of going up.
 * A club its rank does not find is left out, in a country without that division.
 */
export function suggestClubs(competitions: readonly SuggestableCompetition[]): ClubSuggestion[] {
  const pick = (kind: SuggestionKind, tier: CompetitionTier, rankAmong: (clubs: number) => number): ClubSuggestion[] => {
    const clubs = competitions.find((competition) => competition.tier === tier)?.clubs ?? [];
    const club = clubs.find(({ rank }) => rank === rankAmong(clubs.length));
    return club === undefined
      ? []
      : [{ kind, clubId: club.id, name: club.name, budget: clubFinances(club.rank, clubs.length, tier).budget }];
  };
  return [
    ...pick("favourite", 1, () => 1),
    ...pick("mid-table", 1, (clubs) => Math.floor(clubs / 2) + 1),
    ...pick("comeback", 2, (clubs) => Math.floor(clubs / 2)),
  ];
}
