// The end of a session, its pure part: what the next match is worth (its stake, read in the league table), and the
// assistant's word after a defeat. The « À demain » card shows both after a live match or a simulation, the dashboard's
// last match the word (src/db/next-appointment.ts reads the rest).

/** Points apart within which the next opponent is a direct rival: a win changes their order. */
export const RIVAL_POINTS = 3;

/** Points a win is worth: the places it may gain are those of the clubs above within them. */
const WIN_POINTS = 3;

/** What the next match is worth, the first that applies: a cup tie; the season's first league match; a direct rival; places a win may gain; else the opponent's rank. */
export type Stake =
  | { kind: "cup" }
  | { kind: "opening" }
  | { kind: "rival"; gap: number }
  | { kind: "climb"; places: number }
  | { kind: "rank"; rank: number };

/** A row of a league table, as the stake reads it: a club (its ClubSave id), its rank, points and matches. */
export type StakeRow = { club: string; rank: number; points: number; played: number };

export function stakeOf({ cup, table, own, opponent }: { cup: boolean; table: readonly StakeRow[]; own: string; opponent: string }): Stake {
  if (cup) {
    return { kind: "cup" };
  }
  const ownRow = table.find((row) => row.club === own);
  const opponentRow = table.find((row) => row.club === opponent);
  if (ownRow === undefined || opponentRow === undefined || ownRow.played === 0) {
    return { kind: "opening" };
  }
  const gap = Math.abs(ownRow.points - opponentRow.points);
  if (gap <= RIVAL_POINTS) {
    return { kind: "rival", gap };
  }
  // Clubs above within a win's points: a win may pass them, the other results permitting.
  const places = table.filter((row) => row.rank < ownRow.rank && row.points <= ownRow.points + WIN_POINTS).length;
  return places > 0 ? { kind: "climb", places } : { kind: "rank", rank: opponentRow.rank };
}

/** The assistant's word after a defeat: out of the cup, too early to judge, narrow, heavy, or neither. */
export type AssistantWord = "cupExit" | "early" | "narrow" | "heavy" | "plain";

/** Goals by which a defeat is heavy. */
const HEAVY_DEFEAT_MARGIN = 3;

/**
 * What the assistant says after a match: nothing after a win or a draw; after a defeat, the cup run over, the season too
 * young to judge (fewer than `judgedFrom` league matches played, the objectives' « too early »), a narrow defeat (by one
 * goal, or on penalties), a heavy one (by three or more), or else a plain word.
 */
export function assistantWordAfter(
  match: { result: "W" | "D" | "L"; scored: number; conceded: number; cup: boolean },
  leaguePlayed: number,
  judgedFrom: number,
): AssistantWord | null {
  if (match.result !== "L") {
    return null;
  }
  if (match.cup) {
    return "cupExit";
  }
  if (leaguePlayed < judgedFrom) {
    return "early";
  }
  const margin = match.conceded - match.scored;
  return margin >= HEAVY_DEFEAT_MARGIN ? "heavy" : margin <= 1 ? "narrow" : "plain";
}
