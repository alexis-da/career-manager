import { clubFinances } from "./economy";
import type { RankingObjective } from "./objectives";
import type { CompetitionTier } from "./tiers";

// The three clubs the creation form suggests to a new player, one per difficulty, among one country's clubs. Pure, and
// a fixed rule on the source season's ranks and the first season's objectives: every visitor of one language sees the
// same three clubs.

export const SUGGESTION_KINDS = ["favourite", "mid-table", "comeback"] as const;

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/**
 * A club of a division: its rank in the source season, and the ranking objective a save's first season with it has
 * (src/db/clubs.ts: leagueRankingObjective at its creation reputation rank).
 */
export type SuggestableClub = { id: string; name: string; rank: number; objective: RankingObjective };

export type SuggestableCompetition = { tier: CompetitionTier; clubs: readonly SuggestableClub[] };

export type ClubSuggestion = {
  kind: SuggestionKind;
  clubId: string;
  name: string;
  tier: CompetitionTier; // its division
  objective: RankingObjective; // the ranking objective its board sets it for a save's first season, as the save will
  budget: number; // euros: the transfer budget it starts with
  reputation: number; // the one it starts with: the club's level, its players being drawn with a save
};

/** What a suggestion's card shows before its club comes from the server: its kind, division and objective, no name. */
export type SuggestionPreview = Pick<ClubSuggestion, "kind" | "tier" | "objective">;

/**
 * Three clubs of a country, each with the objective its board will set it, coherent with the card's difficulty: the first
 * division's champion (easy: the top three); a club of the middle of the first division, the first of its lower half
 * (balanced: a place to finish at or above); the second division's weakest club its board asks to go up (hard:
 * promotion, from the last place that asks it). A club its rule does not find is left out, in a country without that
 * division.
 */
export function suggestClubs(competitions: readonly SuggestableCompetition[]): ClubSuggestion[] {
  const pick = (
    kind: SuggestionKind,
    tier: CompetitionTier,
    find: (clubs: readonly SuggestableClub[]) => SuggestableClub | undefined,
  ): ClubSuggestion[] => {
    const clubs = competitions.find((competition) => competition.tier === tier)?.clubs ?? [];
    const club = find(clubs);
    if (club === undefined) {
      return [];
    }
    const { budget, reputation } = clubFinances(club.rank, clubs.length, tier);
    return [{ kind, clubId: club.id, name: club.name, tier, objective: club.objective, budget, reputation }];
  };
  return [
    ...pick("favourite", 1, (clubs) => clubs.find(({ rank }) => rank === 1)),
    ...pick("mid-table", 1, (clubs) => clubs.find(({ rank }) => rank === Math.floor(clubs.length / 2) + 1)),
    ...pick("comeback", 2, (clubs) =>
      clubs
        .filter(({ objective }) => objective.variant === "PROMOTION")
        .reduce<SuggestableClub | undefined>((weakest, club) => (weakest === undefined || club.rank > weakest.rank ? club : weakest), undefined),
    ),
  ];
}

/** A suggestion as its card shows it before its club comes: without its name, its id, its budget nor reputation. */
export function suggestionPreview({ kind, tier, objective }: ClubSuggestion): SuggestionPreview {
  return { kind, tier, objective };
}
