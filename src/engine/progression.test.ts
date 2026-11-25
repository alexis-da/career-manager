import { describe, expect, it } from "vitest";
import { centeredSpread, makeRng, type Rng } from "../lib/rng";
import {
  ATTRIBUTE_PROGRESSION_SPREAD,
  DECLINE_ATTRIBUTE_FACTORS,
  DECLINE_BY_AGE,
  GROWTH_BY_MINUTES,
  GROWTH_END_AGE,
  GROWTH_SHARE_BY_AGE,
  PROGRESSION_SPREAD,
} from "./balance";
import { interpolate } from "./curves";
import {
  ATTRIBUTE_NAMES,
  clampRating,
  generateAttributes,
  overallFor,
  RATING_MAX,
  RATING_MIN,
  type AttributeName,
  type PlayerAttributes,
} from "./generation";
import { POSITIONS, type Position } from "./positions";
import { expectedProgression, progressPlayer, projectedLeagueMinutes, willRetire, type ProgressingPlayer } from "./progression";

const FULL_SEASON_MINUTES = 38 * 90;
const RUNS = 1_000;

function generatedPlayer(position: Position, age: number, clubLevel: number, seed: string): ProgressingPlayer {
  return { position, ...generateAttributes({ position, age }, clubLevel, makeRng(seed)) };
}

function uniformPlayer(position: Position, rating: number): ProgressingPlayer {
  const attributes = Object.fromEntries(ATTRIBUTE_NAMES.map((name) => [name, rating])) as Record<
    (typeof ATTRIBUTE_NAMES)[number],
    number
  >; // every attribute name is a key
  return { position, overall: rating, potential: rating, ...attributes };
}

const meanOverallChange = (player: ProgressingPlayer, age: number, minutes: number): number => {
  let total = 0;
  for (let run = 0; run < RUNS; run++) {
    total += progressPlayer(player, age, minutes, makeRng(`mean:${run}`)).overall - player.overall;
  }
  return total / RUNS;
};

const retirementShare = (age: number): number => {
  let retired = 0;
  for (let run = 0; run < RUNS; run++) {
    if (willRetire(age, makeRng(`retire:${age}:${run}`))) {
      retired++;
    }
  }
  return retired / RUNS;
};

describe("progressPlayer", () => {
  it("returns the same attributes for the same stream", () => {
    const player = generatedPlayer("ST", 23, 72, "same-player");

    expect(progressPlayer(player, 24, 2000, makeRng("same"))).toEqual(progressPlayer(player, 24, 2000, makeRng("same")));
    expect(progressPlayer(player, 24, 2000, makeRng("same"))).not.toEqual(
      progressPlayer(player, 24, 2000, makeRng("other")),
    );
  });

  it("keeps every attribute an integer within 1–99, with potential at or above overall", () => {
    const violations: string[] = [];
    let run = 0;
    for (const position of POSITIONS) {
      for (let age = 17; age <= 40; age++) {
        for (const minutes of [0, 1200, FULL_SEASON_MINUTES]) {
          const players = [
            generatedPlayer(position, Math.min(age, 36), 1, `low:${run}`),
            generatedPlayer(position, Math.min(age, 36), 99, `high:${run}`),
            uniformPlayer(position, RATING_MIN),
            uniformPlayer(position, RATING_MAX),
          ];
          for (const player of players) {
            run++;
            const next = progressPlayer(player, age, minutes, makeRng(`bounds:${run}`));
            for (const [name, value] of Object.entries(next)) {
              if (!Number.isInteger(value) || value < RATING_MIN || value > RATING_MAX) {
                violations.push(`${position} aged ${age}: ${name} = ${value}`);
              }
            }
            if (next.potential < next.overall) {
              violations.push(`${position} aged ${age}: potential ${next.potential} below overall ${next.overall}`);
            }
          }
        }
      }
    }

    expect(violations.slice(0, 10)).toEqual([]);
  });

  it("makes a 20-year-old with high potential progress on average, more with playing time", () => {
    const base = generatedPlayer("CM", 20, 70, "young-talent");
    const talent = { ...base, potential: Math.min(RATING_MAX, base.overall + 20) };

    expect(meanOverallChange(talent, 20, FULL_SEASON_MINUTES)).toBeGreaterThan(3);
    expect(meanOverallChange(talent, 20, FULL_SEASON_MINUTES)).toBeGreaterThan(meanOverallChange(talent, 20, 0));
  });

  it("makes a 33-year-old decline on average, even with playing time", () => {
    const veteran = generatedPlayer("CB", 33, 75, "veteran");

    expect(meanOverallChange(veteran, 33, FULL_SEASON_MINUTES)).toBeLessThan(-1);
  });

  it("stops the potential above the overall from 29", () => {
    const player = { ...generatedPlayer("ST", 28, 72, "late"), potential: 90 };

    expect(progressPlayer(player, 29, FULL_SEASON_MINUTES, makeRng("late")).potential).toBe(
      progressPlayer(player, 29, FULL_SEASON_MINUTES, makeRng("late")).overall,
    );
  });
});

/** A player of `room` points of growth room: what expectedProgression reads of him. */
const withRoom = (room: number): { overall: number; potential: number } => ({ overall: 60, potential: 60 + room });

/** A value rounded to one decimal as docs/design/effectif-adjoint.md § 0.3 writes it: 1.05 gives 1.1. */
const oneDecimal = (value: number): number => Math.round(value * 10 + 1e-9) / 10;

describe("expectedProgression", () => {
  // docs/design/effectif-adjoint.md § 0.3: the age during the season, one more on the next 1 July, which the formula reads.
  it("gives the design's growth at 0, 900 and 2 250 league minutes", () => {
    const cases: { ageNext: number; room: number; changes: [number, number, number] }[] = [
      { ageNext: 19, room: 20, changes: [1.625, 3.9, 6.5] }, // 18 years old, room 20: +1.6, +3.9, +6.5
      { ageNext: 21, room: 14, changes: [1.05, 2.52, 4.2] }, // 20 years old, room 14: +1.1, +2.5, +4.2
      { ageNext: 24, room: 8, changes: [0.4, 0.96, 1.6] }, // 23 years old, room 8: +0.4, +1.0, +1.6
      { ageNext: 27, room: 3, changes: [0.075, 0.18, 0.3] }, // 26 years old, room 3: +0.1, +0.2, +0.3
    ];
    for (const { ageNext, room, changes } of cases) {
      const atMinutes = [0, 900, 2250].map((minutes) => expectedProgression(withRoom(room), ageNext, minutes));
      atMinutes.forEach((change, index) => expect(change, `${ageNext}, ${room}`).toBeCloseTo(changes[index], 9));
    }
    expect([1.625, 3.9, 6.5, 1.05, 2.52, 4.2, 0.4, 0.96, 1.6, 0.075, 0.18, 0.3].map(oneDecimal)).toEqual([
      1.6, 3.9, 6.5, 1.1, 2.5, 4.2, 0.4, 1, 1.6, 0.1, 0.2, 0.3,
    ]);
  });

  it("takes the age's decline off, whatever the minutes, and nothing more past 2 250 minutes", () => {
    // 30, 32 and 34 years old during the season: −1, −2.5, −4.
    for (const [ageNext, decline] of [
      [31, -1],
      [33, -2.5],
      [35, -4],
    ] as const) {
      for (const minutes of [0, 900, 3420]) {
        expect(expectedProgression(withRoom(0), ageNext, minutes)).toBeCloseTo(decline, 9);
      }
    }
    expect(expectedProgression(withRoom(20), 19, 3420)).toBe(expectedProgression(withRoom(20), 19, 2250));
    // No room, no growth; from 29 on the next 1 July, none either.
    expect(expectedProgression({ overall: 70, potential: 65 }, 19, 2250)).toBe(0);
    expect(expectedProgression(withRoom(10), 29, 2250)).toBe(0);
  });

  it("follows the design's 17-year-old, rated 55 for a potential of 77, a starter or on the bench until 20", () => {
    // § 0.3: 70.2 at 20 for a starter, 59.9 on the bench, the expected values carried from one summer to the next.
    const at20 = (minutes: number): number => {
      let overall = 55;
      for (const ageNext of [18, 19, 20]) {
        overall += expectedProgression({ overall, potential: 77 }, ageNext, minutes);
      }
      return oneDecimal(overall);
    };
    expect(at20(2250)).toBe(70.2);
    expect(at20(900)).toBe(65.5);
    expect(at20(0)).toBe(59.9);
  });

  it("is what progressPlayer gives on average", () => {
    const base = generatedPlayer("CM", 20, 70, "expected-talent");
    const talent = { ...base, potential: Math.min(RATING_MAX, base.overall + 20) };

    expect(meanOverallChange(talent, 21, 2250)).toBeCloseTo(expectedProgression(talent, 21, 2250), 0);
    expect(meanOverallChange(talent, 21, 0)).toBeCloseTo(expectedProgression(talent, 21, 0), 0);
  });
});

/**
 * progressPlayer as it was before expectedProgression (acecbfb), word for word: the same seed must give the same season
 * (CLAUDE.md, « Déterminisme »), every save's turns replayed to the bit.
 */
function progressPlayerBefore(player: ProgressingPlayer, age: number, minutesPlayed: number, rng: Rng): PlayerAttributes {
  const growthRoom = Math.max(0, player.potential - player.overall);
  const growth =
    growthRoom * interpolate(GROWTH_SHARE_BY_AGE, age) * interpolate(GROWTH_BY_MINUTES, minutesPlayed);
  const change = growth - interpolate(DECLINE_BY_AGE, age) + centeredSpread(rng) * PROGRESSION_SPREAD;

  const attributes = {} as Record<AttributeName, number>; // every key is filled by the loop below
  for (const name of ATTRIBUTE_NAMES) {
    const factor = change < 0 ? DECLINE_ATTRIBUTE_FACTORS[name] : 1;
    attributes[name] = clampRating(
      player[name] + change * factor + centeredSpread(rng) * ATTRIBUTE_PROGRESSION_SPREAD,
    );
  }

  const overall = overallFor(player.position, attributes);
  const potential = age >= GROWTH_END_AGE ? overall : Math.max(player.potential, overall);
  return { overall, potential, ...attributes };
}

describe("progressPlayer, through expectedProgression", () => {
  it("gives what it gave before, to the bit, then draws the retirement from the same point of the stream", () => {
    let run = 0;
    for (const position of POSITIONS) {
      for (let age = 17; age <= 39; age += 2) {
        for (const minutes of [0, 450, 1234, 2250, 3420]) {
          run++;
          const base = generatedPlayer(position, Math.min(age, 36), 40 + (run % 60), `before:${run}`);
          const player = { ...base, potential: Math.min(RATING_MAX, base.overall + (run % 25)) };
          const [now, before] = [makeRng(`replay:${run}`), makeRng(`replay:${run}`)];
          expect(progressPlayer(player, age, minutes, now)).toEqual(progressPlayerBefore(player, age, minutes, before));
          expect(now()).toBe(before());
        }
      }
    }
  });
});

describe("projectedLeagueMinutes", () => {
  it("prorates the minutes to the club's league season, and gives none before its first match", () => {
    expect(projectedLeagueMinutes(620, 10, 38)).toBeCloseTo(2356, 9);
    expect(projectedLeagueMinutes(1240, 19, 38)).toBe(2480);
    expect(projectedLeagueMinutes(3060, 34, 34)).toBe(3060);
    expect(projectedLeagueMinutes(0, 12, 38)).toBe(0);
    expect(projectedLeagueMinutes(0, 0, 38)).toBe(0);
  });
});

describe("willRetire", () => {
  it("never retires a player before 34, often after, always from 38", () => {
    expect(retirementShare(30)).toBe(0);
    expect(retirementShare(33)).toBe(0);
    expect(retirementShare(34)).toBeGreaterThan(0);
    expect(retirementShare(35)).toBeGreaterThan(0.5);
    expect(retirementShare(38)).toBe(1);
    expect(retirementShare(40)).toBe(1);
  });
});
