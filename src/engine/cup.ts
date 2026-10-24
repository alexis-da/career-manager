import { shuffle, type Rng } from "../lib/rng";
import { CUP_MAIN_DRAW, CUP_ROUND_PRIZES, CUP_ROUNDS, CUP_RUNNER_UP_PRIZE, CUP_WINNER_PRIZE } from "./balance";
import { SEASON_SATURDAYS } from "./schedule";
import type { CompetitionTier } from "./tiers";
import { firstMatchdayDate } from "./world";

/**
 * Whether the game gives its worldVersion 2 saves the national cups: true since the cup's screens. Every new
 * worldVersion 2 save gets them at its creation, and a worldVersion 2 save from before at its next season. Set to false,
 * no save the game creates or advances would get a new cup (createSave's `cups` still asks for them); a save that has
 * cups keeps them from season to season.
 */
export const CUPS_ENABLED = true;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** A cup round is played on the Wednesday after a Saturday. */
const CUP_DAYS_AFTER_SATURDAY = 4;

/**
 * Weeks of rounds 1 to 5, as the index of their Saturday among the season's (0: the first matchday): free of the
 * Tuesday matchdays of the largest divisions (weeks 3, 9, 16, 22, 29 and 35, matchdayDates), so that no club plays
 * three times in a week. The final is on the Saturday after the last matchday.
 */
const CUP_ROUND_WEEKS: readonly number[] = [5, 12, 20, 26, 33];

/** Code of a country's cup: "fr.cup". */
export function cupCode(country: string): string {
  return `${country}.cup`;
}

/**
 * Dates of a season's cup rounds, 1 (preliminary) to 6 (final): Wednesdays in weeks without a midweek matchday
 * (23 September, 11 November, 6 January, 17 February and 7 April for 2026-27), then the Saturday after the last
 * matchday (22 May 2027). The same for every country; no draw.
 */
export function cupDates(startYear: number): Date[] {
  const first = firstMatchdayDate(startYear).getTime();
  const rounds = CUP_ROUND_WEEKS.map((week) => new Date(first + week * WEEK_MS + CUP_DAYS_AFTER_SATURDAY * DAY_MS));
  return [...rounds, new Date(first + SEASON_SATURDAYS * WEEK_MS)];
}

/** A club entering a cup, ranked by its last season: its division and its final rank (initialRank the first season). */
export type CupEntrant = {
  club: string; // its key, e.g. the slug
  tier: CompetitionTier;
  rank: number;
};

export type CupTie = { home: string; away: string };

/** A tie played, as the next round's draw reads it. */
export type PlayedTie = CupTie & { round: number; winner: string };

/** Seed of a cup round's draw: save, season, cup and round. */
export function cupDrawRngSeed(saveSeed: string, startYear: number, code: string, round: number): string {
  return `${saveSeed}:cup-draw:${startYear}:${code}:${round}`;
}

/**
 * Ties of a draw: the clubs sorted by key, so that their order in the input never matters, shuffled, then paired in
 * order; the first of each pair is at home.
 */
export function drawTies(clubs: readonly string[], rng: Rng): CupTie[] {
  if (clubs.length % 2 !== 0 || new Set(clubs).size !== clubs.length) {
    throw new RangeError(`A draw needs an even number of distinct clubs, got ${clubs.length}`);
  }
  const drawn = shuffle(rng, [...clubs].sort());
  return Array.from({ length: drawn.length / 2 }, (_, index) => ({ home: drawn[2 * index], away: drawn[2 * index + 1] }));
}

/**
 * The preliminary round: the 2 × (N − CUP_MAIN_DRAW) lowest clubs of the country, first division before second, each
 * by rank, drawn against each other; the others go straight to the round of 32.
 */
export function preliminaryTies(entrants: readonly CupEntrant[], rng: Rng): CupTie[] {
  const playing = 2 * (entrants.length - CUP_MAIN_DRAW);
  if (playing <= 0) {
    throw new RangeError(`A cup needs more than ${CUP_MAIN_DRAW} clubs, got ${entrants.length}`);
  }
  const ranked = [...entrants].sort((a, b) => a.tier - b.tier || a.rank - b.rank || (a.club < b.club ? -1 : 1));
  return drawTies(
    ranked.slice(ranked.length - playing).map((entrant) => entrant.club),
    rng,
  );
}

/**
 * The next round's ties once round `round` is over: the country's clubs that have lost no tie of the cup (the
 * preliminary round's winners and the clubs exempt from it, then each round's winners), drawn. Throws when the number
 * of clubs left is not the round's.
 */
export function nextRoundTies(clubs: readonly string[], played: readonly PlayedTie[], round: number, rng: Rng): CupTie[] {
  if (!Number.isInteger(round) || round < 1 || round >= CUP_ROUNDS) {
    throw new RangeError(`No round after round ${round}`);
  }
  const losers = new Set(played.map((tie) => (tie.winner === tie.home ? tie.away : tie.home)));
  const left = clubs.filter((club) => !losers.has(club));
  const expected = CUP_MAIN_DRAW / 2 ** (round - 1);
  if (left.length !== expected) {
    throw new Error(`Round ${round + 1} needs ${expected} clubs, ${left.length} are left`);
  }
  return drawTies(left, rng);
}

/** What a tie earns each club, in euros: the round's prize to its winner; in the final, the runner-up's too. */
export function cupPrize(round: number, won: boolean): number {
  if (round === CUP_ROUNDS) {
    return won ? CUP_WINNER_PRIZE : CUP_RUNNER_UP_PRIZE;
  }
  const prize = CUP_ROUND_PRIZES[round - 1];
  if (prize === undefined) {
    throw new RangeError(`No cup round ${round}`);
  }
  return won ? prize : 0;
}

/** A club's cup: the last round it played, and whether it won the cup. */
export type CupRun = { round: number; won: boolean };

/** The cup run of a club from the ties it played (any order); null when it played none. */
export function cupRunOf(ties: readonly PlayedTie[], club: string): CupRun | null {
  const own = ties.filter((tie) => tie.home === club || tie.away === club);
  if (own.length === 0) {
    return null;
  }
  const last = own.reduce((latest, tie) => (tie.round > latest.round ? tie : latest));
  return { round: last.round, won: last.round === CUP_ROUNDS && last.winner === club };
}
