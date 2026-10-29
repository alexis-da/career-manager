import { CHALLENGE_FIRST_DIVISION_RANKS, CHALLENGE_SAVE_RETENTION_HOURS } from "../config/challenge";
import { makeRng, pick } from "../lib/rng";
import { POINTS_FOR_DRAW, POINTS_FOR_WIN } from "./standings";

// The weekly challenge: every player of a week gets the same save (seed and club), and is ranked on the club's first
// league matchdays. Pure: the club draw, the score and the ranking's order; the database is src/db/challenge.ts.

const HOUR_MS = 3_600_000;

/** A club a challenge may give, read from the reference tables: its division and its rank in the source season. */
export type ChallengeClubCandidate = { slug: string; tier: number; rank: number };

/** Whether a challenge may give a club: any second division club, and the first division's mid-to-low table. */
export function isChallengeClub({ tier, rank }: ChallengeClubCandidate): boolean {
  return tier === 2 || (tier === 1 && rank >= CHALLENGE_FIRST_DIVISION_RANKS.from && rank <= CHALLENGE_FIRST_DIVISION_RANKS.to);
}

/**
 * The club of a challenge: drawn with its seed among the clubs it may give, sorted by slug (ids differ from one database
 * to another), the previous week's club left out. The same seed and clubs always give the same club.
 */
export function drawChallengeClub(
  clubs: readonly ChallengeClubCandidate[],
  previousSlug: string | null,
  seed: string,
): string {
  const pool = clubs
    .filter(isChallengeClub)
    .map((club) => club.slug)
    .filter((slug) => slug !== previousSlug)
    .sort();
  return pick(makeRng(`${seed}:club`), pool);
}


/** When the purge deletes a challenge's saves: CHALLENGE_SAVE_RETENTION_HOURS after the challenge ends. */
export function challengeSavesPurgedAt(endsAt: Date): Date {
  return new Date(endsAt.getTime() + CHALLENGE_SAVE_RETENTION_HOURS * HOUR_MS);
}

/** A played league match of the challenge's club, from its side. */
export type ChallengeMatch = { round: number; goalsFor: number; goalsAgainst: number };

export type ChallengeScore = {
  matchdaysPlayed: number; // of the first `horizon` matchdays
  points: number;
  goalDiff: number;
  goalsFor: number;
};

/**
 * The score of a challenge save so far: its club's played league matches of matchdays 1 to `horizon`, three points a
 * win and one a draw, as in the standings. Later matchdays never count; the score is final once matchdaysPlayed reaches
 * `horizon`. A club plays once a matchday: a matchday twice is refused.
 */
export function challengeScore(matches: readonly ChallengeMatch[], horizon: number): ChallengeScore {
  const counted = matches.filter((match) => match.round >= 1 && match.round <= horizon);
  if (new Set(counted.map((match) => match.round)).size !== counted.length) {
    throw new RangeError("A club plays one league match a matchday");
  }
  return counted.reduce(
    (score, { goalsFor, goalsAgainst }) => ({
      matchdaysPlayed: score.matchdaysPlayed + 1,
      points: score.points + (goalsFor > goalsAgainst ? POINTS_FOR_WIN : goalsFor === goalsAgainst ? POINTS_FOR_DRAW : 0),
      goalDiff: score.goalDiff + goalsFor - goalsAgainst,
      goalsFor: score.goalsFor + goalsFor,
    }),
    { matchdaysPlayed: 0, points: 0, goalDiff: 0, goalsFor: 0 },
  );
}

/** A submitted entry, as a challenge's ranking orders it. */
export type RankableChallengeEntry = { id: string; points: number; goalDiff: number; goalsFor: number; submittedAt: Date };

/**
 * The order of a challenge's ranking: points, goal difference, goals scored, then the earlier submission (players who
 * change nothing all get the same score); the entry's id last, so that two submissions of one millisecond still have
 * an order.
 */
export function compareChallengeEntries(a: RankableChallengeEntry, b: RankableChallengeEntry): number {
  return (
    b.points - a.points ||
    b.goalDiff - a.goalDiff ||
    b.goalsFor - a.goalsFor ||
    a.submittedAt.getTime() - b.submittedAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** A challenge's ranking: its entries in order, ranked from 1, no two with the same rank. */
export function rankChallengeEntries<T extends RankableChallengeEntry>(entries: readonly T[]): (T & { rank: number })[] {
  return [...entries].sort(compareChallengeEntries).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * The rank an entry would have among others, ranked or not: one more than those that come before it, itself left out.
 * For a player's own entry, which an anonymous player sees where it would stand.
 */
export function rankAmong(entry: RankableChallengeEntry, others: readonly RankableChallengeEntry[]): number {
  return 1 + others.filter((other) => other.id !== entry.id && compareChallengeEntries(other, entry) < 0).length;
}

/** The name a public ranking shows: the first name of the Google account, no more; null without one (« Anonyme »). */
export function rankingName(accountName: string | null): string | null {
  const [first] = (accountName ?? "").trim().split(/\s+/);
  return first === undefined || first === "" ? null : first;
}
