import { REPUTATION_MOVE, REPUTATION_PER_PLACE, REPUTATION_PLACES_CAP } from "./balance";
import { clampRating } from "./generation";
import type { MoveReason } from "./promotion";

// A club's reputation over the seasons (docs/design/gameplay-v2.md, V2): its rank by reputation in its division is the
// rank expected of it; at the end of a season, its reputation follows its final place against that rank, and a
// promotion or a relegation. Pure: the transition reads the tables and writes the clubs (src/db/season-finances.ts).

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
 * its expected ranks add up as its final ranks do, so that its reputations move only by the caps; its dotations add up
 * to its creation's.
 */
export function reputationRanks<K>(clubs: readonly RankedClub<K>[]): Map<K, number> {
  const ordered = [...clubs].sort(
    (a, b) => b.reputation - a.reputation || b.wageBudget - a.wageBudget || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
  return new Map(ordered.map((club, index) => [club.key, index + 1]));
}

/**
 * A club's reputation after a season: one point per place it finished above its expected rank (lost per place below),
 * at most REPUTATION_PLACES_CAP either way, then REPUTATION_MOVE more for a promotion, less for a relegation; within
 * 1–99.
 */
export function reputationAfterSeason(reputation: number, expectedRank: number, finalRank: number, move: MoveReason | null): number {
  const places = Math.max(-REPUTATION_PLACES_CAP, Math.min(REPUTATION_PLACES_CAP, expectedRank - finalRank));
  const moved = move === "PROMOTED" ? REPUTATION_MOVE : move === "RELEGATED" ? -REPUTATION_MOVE : 0;
  return clampRating(reputation + places * REPUTATION_PER_PLACE + moved);
}
