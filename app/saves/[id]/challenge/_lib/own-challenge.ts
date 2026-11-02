import type { ChallengePageView } from "@/src/db/challenge-view";

/** The player's score, as their line in the ranking has it: an anonymous player's has no rank. */
export type OwnScore = { points: number; rank: number | null };

/** The player in this week's challenge, whichever save is open: never a way to play it twice. */
export type OwnChallenge =
  | { kind: "playing"; saveId: string; played: number }
  | { kind: "submitted"; saveId: string; played: number; score: OwnScore | null }
  | { kind: "played" } // an entry outlives its save: deleting it gives no second go
  | { kind: "full" }
  | { kind: "open" };

/**
 * What the card « Ta partie » says, the cases of the public page's action. No score while the save plays: the game writes
 * one at the last matchday of the horizon, read from there in the player's line of the ranking.
 */
export function ownChallenge({ own, full, ranking }: Pick<ChallengePageView, "own" | "full" | "ranking">): OwnChallenge {
  if (own === null) {
    return { kind: full ? "full" : "open" };
  }
  const { saveId, matchdaysPlayed: played } = own;
  if (saveId === null) {
    return { kind: "played" };
  }
  if (!own.submitted) {
    return { kind: "playing", saveId, played };
  }
  const line = ranking.find((row) => row.isViewer);
  return { kind: "submitted", saveId, played, score: line === undefined ? null : { points: line.points, rank: line.rank } };
}
