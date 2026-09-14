import { shuffle, type Rng } from "../lib/rng";

export type ScheduledMatch = {
  round: number; // 1-based matchday
  home: string; // club key, e.g. its slug
  away: string;
  scheduledAt: Date;
};

type Pairing = { home: string; away: string };

const DAYS_BETWEEN_MATCHDAYS = 7;
const DAY_MS = 86_400_000;

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
