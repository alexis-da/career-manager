import { shuffle, type Rng } from "../lib/rng";
import { firstMatchdayDate } from "./world";

export type ScheduledMatch = {
  round: number; // 1-based matchday
  home: string; // club key, e.g. its slug
  away: string;
  scheduledAt: Date;
};

type Pairing = { home: string; away: string };

const DAYS_BETWEEN_MATCHDAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Saturdays with matches in a season of a worldVersion 2 save: from the third Saturday of August (firstMatchdayDate)
 * to mid-May, the 40th (15 May 2027).
 */
export const SEASON_SATURDAYS = 40;

/** A midweek matchday is played on the Tuesday after a Saturday. */
const MIDWEEK_DAYS_AFTER_SATURDAY = 3;

/**
 * Dates of the matchdays of a season in a worldVersion 2 save, in order: every competition starts on the first of the
 * SEASON_SATURDAYS Saturdays and ends on the last, whatever its size. Up to 40 matchdays, Saturdays spread evenly,
 * first and last included, the others rest weeks (34 matchdays: 6 Saturdays off); beyond, every Saturday plus a
 * Tuesday for each matchday more, spread evenly between the first and the last (46 matchdays: 6 Tuesdays). No draw:
 * the same number of matchdays always gets the same dates.
 */
export function matchdayDates(roundCount: number, startYear: number): Date[] {
  if (!Number.isInteger(roundCount) || roundCount < 2 || roundCount > 2 * SEASON_SATURDAYS - 1) {
    throw new RangeError(`A season of 2 to ${2 * SEASON_SATURDAYS - 1} matchdays, got ${roundCount}`);
  }
  const first = firstMatchdayDate(startYear).getTime();
  const saturday = (index: number): number => first + index * DAYS_BETWEEN_MATCHDAYS * DAY_MS;
  const gaps = SEASON_SATURDAYS - 1;

  if (roundCount <= SEASON_SATURDAYS) {
    return Array.from({ length: roundCount }, (_, index) => new Date(saturday(Math.round((index * gaps) / (roundCount - 1)))));
  }
  const midweeks = roundCount - SEASON_SATURDAYS;
  const tuesdays = Array.from(
    { length: midweeks },
    (_, index) => saturday(Math.floor(((index + 0.5) * gaps) / midweeks)) + MIDWEEK_DAYS_AFTER_SATURDAY * DAY_MS,
  );
  const saturdays = Array.from({ length: SEASON_SATURDAYS }, (_, index) => saturday(index));
  return [...saturdays, ...tuesdays].sort((a, b) => a - b).map((time) => new Date(time));
}

/**
 * Double round-robin of a worldVersion 2 save, where no club plays more than two matches in a row at home or away.
 * First half: the canonical circle schedule (de Werra) — club n − 1 fixed, in matchday r club r meets it, at home when
 * r is even, and the pair (r + k, r − k) has its first club at home when k is odd —, which gives each club at most one
 * pair of matches in a row at the same venue. Second half: the same matchdays with home and away swapped, starting
 * with the second one and ending with the first, so that no club makes three in a row where the halves meet and no
 * pair meets twice in a row. The seed shuffles the clubs' places only: the order of the matchdays is the construction's,
 * and the same seed always gives the same season. Pass the clubs in a stable order (e.g. sorted by slug).
 */
export function generateBalancedSchedule(clubs: readonly string[], firstMatchday: Date, rng: Rng): ScheduledMatch[] {
  const clubCount = clubs.length;
  if (clubCount < 4 || clubCount % 2 !== 0) {
    throw new RangeError(`A balanced round-robin needs an even number of clubs, at least 4, got ${clubCount}`);
  }
  if (new Set(clubs).size !== clubCount) {
    throw new RangeError("Clubs must be distinct");
  }

  const placed = shuffle(rng, clubs);
  const rotating = clubCount - 1;
  const firstHalf: Pairing[][] = Array.from({ length: rotating }, (_, round) => {
    const pairings: Pairing[] = [
      round % 2 === 0
        ? { home: placed[round], away: placed[clubCount - 1] }
        : { home: placed[clubCount - 1], away: placed[round] },
    ];
    for (let k = 1; k < clubCount / 2; k++) {
      const a = placed[(round + k) % rotating];
      const b = placed[(round - k + rotating) % rotating];
      pairings.push(k % 2 === 1 ? { home: a, away: b } : { home: b, away: a });
    }
    return pairings;
  });
  const secondHalf = [...firstHalf.slice(1), firstHalf[0]].map((pairings) =>
    pairings.map(({ home, away }) => ({ home: away, away: home })),
  );

  return [...firstHalf, ...secondHalf].flatMap((pairings, index) =>
    pairings.map((pairing) => ({
      round: index + 1,
      ...pairing,
      scheduledAt: new Date(firstMatchday.getTime() + index * DAYS_BETWEEN_MATCHDAYS * DAY_MS),
    })),
  );
}

/** Seed of the stream ordering one competition's season in a save. */
export function scheduleRngSeed(saveSeed: string, competitionCode: string, startYear: number): string {
  return `${saveSeed}:schedule:${competitionCode}:${startYear}`;
}

/**
 * Double round-robin built with the circle method: every club meets every other club twice, once at
 * home, over 2(n − 1) matchdays, one a week from firstMatchday. The seed shuffles the clubs' starting
 * positions and the order of the first-half matchdays; the second half replays them in the same order
 * with home and away swapped. Pass the clubs in a stable order (e.g. sorted by slug).
 */
export function generateSchedule(clubs: readonly string[], firstMatchday: Date, rng: Rng): ScheduledMatch[] {
  const clubCount = clubs.length;
  if (clubCount < 2 || clubCount % 2 !== 0) {
    throw new RangeError(`A round-robin needs an even number of clubs, at least 2, got ${clubCount}`);
  }
  if (new Set(clubs).size !== clubCount) {
    throw new RangeError("Clubs must be distinct");
  }

  const [fixed, ...rotating] = shuffle(rng, clubs);
  const firstHalf: Pairing[][] = [];
  for (let round = 0; round < clubCount - 1; round++) {
    const lineup = [fixed, ...rotating.slice(round), ...rotating.slice(0, round)];
    const pairings: Pairing[] = [];
    for (let index = 0; index < clubCount / 2; index++) {
      const a = lineup[index];
      const b = lineup[clubCount - 1 - index];
      // Alternating on round + position keeps home and away balanced over the season.
      pairings.push((round + index) % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    firstHalf.push(pairings);
  }

  const orderedFirstHalf = shuffle(rng, firstHalf);
  const secondHalf = orderedFirstHalf.map((pairings) => pairings.map(({ home, away }) => ({ home: away, away: home })));

  return [...orderedFirstHalf, ...secondHalf].flatMap((pairings, index) =>
    pairings.map((pairing) => ({
      round: index + 1,
      ...pairing,
      scheduledAt: new Date(firstMatchday.getTime() + index * DAYS_BETWEEN_MATCHDAYS * DAY_MS),
    })),
  );
}
