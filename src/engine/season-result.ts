import {
  BEST_PLAYER_MIN_APPEARANCES,
  SEASON_RATING_ASSIST,
  SEASON_RATING_BASE,
  SEASON_RATING_GOAL,
  SEASON_RATING_MAX,
  SEASON_RATING_MIN,
  SEASON_RATING_MINUTES,
  SEASON_RATING_RED_CARD,
  SEASON_RATING_YELLOW_CARD,
} from "./balance";
import type { Position } from "./positions";
import type { StandingRow } from "./standings";

/** The one trophy so far: first of the league. */
export const CHAMPION_TROPHY = "champion";

const MINUTES_PER_MATCH = 90;

/** A player's season for the managed club, from PlayerSeasonStats. */
export type SeasonPlayerLine = {
  playerKey: string;
  name: string; // first and last name
  position: Position;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

export type BestPlayer = {
  playerKey: string;
  name: string;
  position: Position;
  goals: number;
  assists: number;
  rating: number; // out of 10, one decimal
};

export type SeasonResultData = {
  rank: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  trophies: string[];
  bestPlayer: BestPlayer | null; // null when nobody played BEST_PLAYER_MIN_APPEARANCES matches
  formation: string;
};

/**
 * A player's season rating out of 10, one decimal: SEASON_RATING_BASE, plus goals, assists and share of full matches
 * per appearance, minus cards per appearance, within SEASON_RATING_MIN–MAX. The game keeps no rating per match: this one
 * reads the season's statistics alone, so it is the same at the end of the season and when rebuilt later.
 */
export function seasonRating(line: SeasonPlayerLine): number {
  if (line.appearances === 0) {
    return SEASON_RATING_BASE;
  }
  const perMatch = (value: number): number => value / line.appearances;
  const raw =
    SEASON_RATING_BASE +
    SEASON_RATING_GOAL * perMatch(line.goals) +
    SEASON_RATING_ASSIST * perMatch(line.assists) +
    SEASON_RATING_MINUTES * Math.min(1, perMatch(line.minutes) / MINUTES_PER_MATCH) -
    SEASON_RATING_YELLOW_CARD * perMatch(line.yellowCards) -
    SEASON_RATING_RED_CARD * perMatch(line.redCards);
  const bounded = Math.min(SEASON_RATING_MAX, Math.max(SEASON_RATING_MIN, raw));
  return Math.round(bounded * 10) / 10;
}

/**
 * The best player of the season: the best season rating among players with BEST_PLAYER_MIN_APPEARANCES matches or
 * more, ties broken by goals + assists, then by playerKey so that the answer never depends on the order of the lines.
 */
export function bestPlayerOf(lines: readonly SeasonPlayerLine[]): BestPlayer | null {
  let best: BestPlayer | null = null;
  for (const line of lines) {
    if (line.appearances < BEST_PLAYER_MIN_APPEARANCES) {
      continue;
    }
    const candidate: BestPlayer = {
      playerKey: line.playerKey,
      name: line.name,
      position: line.position,
      goals: line.goals,
      assists: line.assists,
      rating: seasonRating(line),
    };
    if (best === null || compareCandidates(candidate, best) < 0) {
      best = candidate;
    }
  }
  return best;
}

function compareCandidates(a: BestPlayer, b: BestPlayer): number {
  return (
    b.rating - a.rating ||
    b.goals + b.assists - (a.goals + a.assists) ||
    (a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0)
  );
}

/** The managed club's season: its line of the final table, its best player, its formation; champion when first. */
export function buildSeasonResult(
  standing: StandingRow,
  stats: readonly SeasonPlayerLine[],
  lineup: { formation: string },
): SeasonResultData {
  return {
    rank: standing.rank,
    points: standing.points,
    played: standing.played,
    won: standing.won,
    drawn: standing.drawn,
    lost: standing.lost,
    goalsFor: standing.goalsFor,
    goalsAgainst: standing.goalsAgainst,
    trophies: standing.rank === 1 ? [CHAMPION_TROPHY] : [],
    bestPlayer: bestPlayerOf(stats),
    formation: lineup.formation,
  };
}

/** A move of a player, as Transfer records it: Club ids, null for a free agent or a retirement. */
export type ClubMove = { date: Date; fromClubId: string | null; toClubId: string | null };

/**
 * A player's club at a past date, from his current club and his moves dated after it: the club the first of those
 * moves takes him from, his current club without any. Several moves on that first day (released, then signed in the
 * preseason) form a chain: the first one is the move whose origin no other move of the day leads to.
 */
export function clubAtDate(currentClubId: string | null, movesAfter: readonly ClubMove[]): string | null {
  if (movesAfter.length === 0) {
    return currentClubId;
  }
  const firstDay = Math.min(...movesAfter.map((move) => move.date.getTime()));
  const sameDay = movesAfter.filter((move) => move.date.getTime() === firstDay);
  const first = sameDay.find((move) => !sameDay.some((other) => other !== move && other.toClubId === move.fromClubId));
  return (first ?? sameDay[0]).fromClubId;
}
