import { YOUTH_ENTRY_MAX_TARGETS, YOUTH_POLICY_MAX_AGE } from "./balance";
import type { Position } from "./positions";

// The young players the manager marks « Le lancer » (docs/design/effectif-adjoint.md § 9): « Lancer les jeunes » brings
// them on when they do not start (youthTargets, src/engine/lineup.ts). Pure: the save's list is Save.youthLaunches.

/** What the marks read of a player of the club: his position, and his age on 1 July of the season (whole years). */
export type LaunchCandidate = { position: Position; seasonAge: number };

/** Whether the manager may mark a player of his club: an outfield player YOUTH_POLICY_MAX_AGE or younger on 1 July. */
export const canBeLaunched = (player: LaunchCandidate): boolean => player.position !== "GK" && player.seasonAge <= YOUTH_POLICY_MAX_AGE;

/**
 * The marks that still hold, by the keys of the club's players: each one once, in the manager's order, of a player of the
 * club who can still be marked (canBeLaunched), YOUTH_ENTRY_MAX_TARGETS at most. A player sold, gone free or retired is
 * no longer in the club, one past the age or a goalkeeper can no longer be marked: their marks drop out. An injured or
 * suspended player keeps his: the match leaves him out while he is (youthTargets, withYouthEntries).
 */
export function keptYouthLaunches(marks: readonly string[], squad: ReadonlyMap<string, LaunchCandidate>): string[] {
  const kept: string[] = [];
  for (const key of marks) {
    const player = squad.get(key);
    if (player !== undefined && canBeLaunched(player) && !kept.includes(key)) {
      kept.push(key);
    }
  }
  return kept.slice(0, YOUTH_ENTRY_MAX_TARGETS);
}
