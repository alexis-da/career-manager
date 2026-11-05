import { REPUTATION_MOVE, REPUTATION_PER_PLACE, REPUTATION_PLACES_CAP } from "./balance";
import { clampRating } from "./generation";
import type { MoveReason } from "./promotion";

// A club's reputation over the seasons (docs/design/gameplay-v2.md, V2): its rank by reputation in its division is the
// rank expected of it; at the end of a season, its reputation follows its final place against that rank, and a
// promotion or a relegation. Pure: the transition reads the tables and writes the clubs (src/db/season-finances.ts).

/**
 * Each club's rank by reputation among the clubs given (a division), ties sharing the best one: 1 + the clubs strictly
 * above. The rank expected of a club in the season, and the rank its dotation is given at.
 */
export function reputationRanks<K>(clubs: readonly { key: K; reputation: number }[]): Map<K, number> {
  return new Map(clubs.map(({ key, reputation }) => [key, 1 + clubs.filter((other) => other.reputation > reputation).length]));
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
