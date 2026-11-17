// The end of a session, its pure part: what the next match is worth (its stake, read in the league table), and the
// assistant's word after a defeat. The « À demain » card shows both after a live match or a simulation, the dashboard's
// last match the word (src/db/next-appointment.ts reads the rest).

/** Points apart within which the next opponent is a direct rival: a win changes their order. */
export const RIVAL_POINTS = 3;

/** Points a win is worth: the places it may gain are those of the clubs above within them. */
const WIN_POINTS = 3;

/**
 * What the next match is worth, the first that applies: a cup tie; the season's first league match; a direct rival; places
 * a win may gain; else the opponent's rank. A European match: a knockout tie (the final apart); in the league phase, the
 * first match, a win that may take the club into the first four or the first twelve, else the opponent's rank there.
 */
export type Stake =
  | { kind: "cup" }
  | { kind: "opening" }
  | { kind: "rival"; gap: number }
  | { kind: "climb"; places: number }
  | { kind: "rank"; rank: number }
  | { kind: "europeKnockout" }
  | { kind: "europeFinal" }
  | { kind: "europeOpening" }
  | { kind: "europeTopFour" }
  | { kind: "europeTopTwelve" }
  | { kind: "europeRank"; rank: number };

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

/**
 * What a European match is worth: a knockout tie, the final apart; in the league phase (its table), the club's first
 * match, a win that may take it into the first four (straight to the quarter-finals) or the first twelve (the play-offs),
 * else the opponent's rank there.
 */
export function europeStakeOf({
  knockout,
  final,
  table,
  own,
  opponent,
}: {
  knockout: boolean;
  final: boolean;
  table: readonly StakeRow[];
  own: string;
  opponent: string;
}): Stake {
  if (final) {
    return { kind: "europeFinal" };
  }
  if (knockout) {
    return { kind: "europeKnockout" };
  }
  const ownRow = table.find((row) => row.club === own);
  const opponentRow = table.find((row) => row.club === opponent);
  if (ownRow === undefined || opponentRow === undefined || ownRow.played === 0) {
    return { kind: "europeOpening" };
  }
  // The points of the last club in a place: a win may reach them, the other results permitting.
  const reaches = (places: number): boolean => {
    const last = table.find((row) => row.rank === places);
    return ownRow.rank > places && last !== undefined && ownRow.points + WIN_POINTS >= last.points;
  };
  if (reaches(4)) {
    return { kind: "europeTopFour" };
  }
  if (reaches(12)) {
    return { kind: "europeTopTwelve" };
  }
  return { kind: "europeRank", rank: opponentRow.rank };
}

/** The assistant's word after a defeat: out of the cup or of Europe, too early to judge, narrow, heavy, or neither. */
export type AssistantWord = "cupExit" | "europeExit" | "early" | "narrow" | "heavy" | "plain";

/** Goals by which a defeat is heavy. */
const HEAVY_DEFEAT_MARGIN = 3;

/**
 * What the assistant says after a match: nothing after a win or a draw; after a defeat, the cup run or the European one
 * (a knockout tie lost) over, the season too
 * young to judge (fewer than `judgedFrom` league matches played, the objectives' « too early »), a narrow defeat (by one
 * goal, or on penalties), a heavy one (by three or more), or else a plain word.
 */
export function assistantWordAfter(
  match: { result: "W" | "D" | "L"; scored: number; conceded: number; cup: boolean; europeKnockout?: boolean },
  leaguePlayed: number,
  judgedFrom: number,
): AssistantWord | null {
  if (match.result !== "L") {
    return null;
  }
  if (match.cup) {
    return "cupExit";
  }
  if (match.europeKnockout === true) {
    return "europeExit";
  }
  if (leaguePlayed < judgedFrom) {
    return "early";
  }
  const margin = match.conceded - match.scored;
  return margin >= HEAVY_DEFEAT_MARGIN ? "heavy" : margin <= 1 ? "narrow" : "plain";
}
