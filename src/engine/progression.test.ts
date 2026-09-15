import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { ATTRIBUTE_NAMES, generateAttributes, RATING_MAX, RATING_MIN, type Position } from "./generation";
import { progressPlayer, willRetire, type ProgressingPlayer } from "./progression";

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
    const player = generatedPlayer("FW", 23, 72, "same-player");

    expect(progressPlayer(player, 24, 2000, makeRng("same"))).toEqual(progressPlayer(player, 24, 2000, makeRng("same")));
    expect(progressPlayer(player, 24, 2000, makeRng("same"))).not.toEqual(
      progressPlayer(player, 24, 2000, makeRng("other")),
    );
  });

  it("keeps every attribute an integer within 1–99, with potential at or above overall", () => {
    const violations: string[] = [];
    let run = 0;
    for (const position of ["GK", "DF", "MF", "FW"] as const) {
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
    const base = generatedPlayer("MF", 20, 70, "young-talent");
    const talent = { ...base, potential: Math.min(RATING_MAX, base.overall + 20) };

    expect(meanOverallChange(talent, 20, FULL_SEASON_MINUTES)).toBeGreaterThan(3);
    expect(meanOverallChange(talent, 20, FULL_SEASON_MINUTES)).toBeGreaterThan(meanOverallChange(talent, 20, 0));
  });

  it("makes a 33-year-old decline on average, even with playing time", () => {
    const veteran = generatedPlayer("DF", 33, 75, "veteran");

    expect(meanOverallChange(veteran, 33, FULL_SEASON_MINUTES)).toBeLessThan(-1);
  });

  it("stops the potential above the overall from 29", () => {
    const player = { ...generatedPlayer("FW", 28, 72, "late"), potential: 90 };

    expect(progressPlayer(player, 29, FULL_SEASON_MINUTES, makeRng("late")).potential).toBe(
      progressPlayer(player, 29, FULL_SEASON_MINUTES, makeRng("late")).overall,
    );
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
