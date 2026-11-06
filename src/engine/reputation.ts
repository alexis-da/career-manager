import { REPUTATION_TARGET_SHARE } from "./balance";
import { clubFinances } from "./economy";
import { clampRating } from "./generation";
import type { MoveReason } from "./promotion";
import type { CompetitionTier } from "./tiers";

// A club's reputation over the seasons (docs/design/gameplay-v2.md, V2): at the end of a season, it goes part of the way
// to its target, the reputation the creation gives the club ranked where it finished in its division; a promoted or a
// relegated club takes outright the target of its equivalent rank in its new division. Each division keeps the spread of
// its creation's reputations; its rank by reputation in its division is the rank expected of it, and its dotation's.
// Pure: the transition reads the tables and writes the clubs (src/db/season-finances.ts).

/** A club as its reputation rank reads it: its reputation, then what orders equal reputations. */
export type RankedClub<K> = {
  key: K;
  reputation: number;
  wageBudget: number; // its wage budget, given at the rank it had: the higher first among equal reputations
  slug: string; // then its slug, the same in every save: a replayed save ranks its clubs alike
};

/**
 * Each club's rank by reputation among the clubs given (a division): 1 for the highest, one club a rank, equal
 * reputations ordered by wage budget (the higher first: the club that was ranked higher stays so), then by slug. The
 * rank expected of a club in the season, and the rank its dotation is given at. Unique ranks keep a division's sums:
 * its dotations add up to its creation's, its expected ranks as its final ranks do.
 */
export function reputationRanks<K>(clubs: readonly RankedClub<K>[]): Map<K, number> {
  const ordered = [...clubs].sort(
    (a, b) => b.reputation - a.reputation || b.wageBudget - a.wageBudget || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
  return new Map(ordered.map((club, index) => [club.key, index + 1]));
}

/** Where a club's season leaves it: its final place, and the division it plays next. */
export type SeasonPlace = {
  finalRank: number; // in the division it played
  clubCount: number; // of that division
  move: MoveReason | null;
  moving: number; // clubs going each way between its division and the next one, its country's exchange (0 without a move)
  nextClubCount: number; // of the division it plays next, its own without a move
};

/**
 * The rank a club's season gives it in the division it plays next: its final rank when it stays; the promoted clubs take
 * the last places of the division above, in the order they finished (a champion below the clubs staying), the relegated
 * ones the first places of the division below.
 */
export function rankInNextDivision({ finalRank, clubCount, move, moving, nextClubCount }: SeasonPlace): number {
  if (move === "PROMOTED") {
    return nextClubCount - moving + finalRank;
  }
  if (move === "RELEGATED") {
    return finalRank - (clubCount - moving);
  }
  return finalRank;
}

/**
 * A club's reputation target after a season: the reputation the creation gives the club ranked there (clubFinances), at
 * its rank in the division it plays next (rankInNextDivision). A division's targets are its creation's reputations, one a
 * rank: the clubs staying take its staying ranks, the clubs arriving the others.
 */
export function reputationTarget(rank: number, clubCount: number, tier: CompetitionTier): number {
  return clubFinances(rank, clubCount, tier).reputation;
}

/**
 * A club's reputation after a season: REPUTATION_TARGET_SHARE of the way to its target, rounded alike up and down (half a
 * point away from its reputation), for a club staying in its division; a promoted or relegated club takes its target
 * outright, the reputation of its place in its new division: a club relegated with a first division's reputation would
 * otherwise stay far above the division below for seasons, stretching its spread. Within 1–99, as its target is.
 */
export function reputationAfterSeason(reputation: number, target: number, move: MoveReason | null): number {
  if (move !== null) {
    return target;
  }
  const step = REPUTATION_TARGET_SHARE * (target - reputation);
  return clampRating(reputation + Math.sign(step) * Math.round(Math.abs(step)));
}
