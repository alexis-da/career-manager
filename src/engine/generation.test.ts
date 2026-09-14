import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import {
  ATTRIBUTE_NAMES,
  clubLevelFromRank,
  generateAttributes,
  type PlayerAttributes,
  type Position,
} from "./generation";

const POSITIONS: Position[] = ["GK", "DF", "MF", "FW"];
const RATINGS = [...ATTRIBUTE_NAMES, "overall", "potential"] as const;

function sample(position: Position, age: number, clubLevel: number, count: number, seed: string): PlayerAttributes[] {
  const rng = makeRng(seed);
  return Array.from({ length: count }, () => generateAttributes({ position, age }, clubLevel, rng));
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

describe("generateAttributes", () => {
  it("returns the same attributes for the same seed", () => {
    expect(sample("MF", 24, 70, 50, "save-a")).toEqual(sample("MF", 24, 70, 50, "save-a"));
    expect(sample("MF", 24, 70, 50, "save-a")).not.toEqual(sample("MF", 24, 70, 50, "save-b"));
  });

  it("keeps every rating an integer within 1–99, potential never below overall", () => {
    const violations: string[] = [];
    for (const position of POSITIONS) {
      for (const age of [17, 25, 36]) {
        for (const clubLevel of [1, 50, 99]) {
          const seed = `bounds:${position}:${age}:${clubLevel}`;
          sample(position, age, clubLevel, 200, seed).forEach((attributes, index) => {
            for (const rating of RATINGS) {
              const value = attributes[rating];
              if (!Number.isInteger(value) || value < 1 || value > 99) {
                violations.push(`${seed}#${index} ${rating}=${value}`);
              }
            }
            if (attributes.potential < attributes.overall) {
              violations.push(`${seed}#${index} potential below overall`);
            }
          });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("rejects a club level outside 1–99", () => {
    expect(() => generateAttributes({ position: "FW", age: 25 }, 0, makeRng("x"))).toThrow(RangeError);
    expect(() => generateAttributes({ position: "FW", age: 25 }, 100, makeRng("x"))).toThrow(RangeError);
  });

  it("shapes attributes by position", () => {
    const [goalkeepers, defenders, forwards] = (["GK", "DF", "FW"] as const).map((position) =>
      sample(position, 27, 70, 300, `position:${position}`),
    );
    const average = (players: PlayerAttributes[], name: (typeof RATINGS)[number]) =>
      mean(players.map((player) => player[name]));

    expect(average(goalkeepers, "goalkeeping")).toBeGreaterThan(average(forwards, "goalkeeping") + 40);
    expect(average(defenders, "defending")).toBeGreaterThan(average(forwards, "defending") + 20);
    expect(average(forwards, "shooting")).toBeGreaterThan(average(defenders, "shooting") + 15);
  });

  it("gives every position an overall close to the club level at peak age", () => {
    for (const position of POSITIONS) {
      const overall = mean(sample(position, 27, 70, 300, `level:${position}`).map((player) => player.overall));
      expect(overall).toBeGreaterThan(66);
      expect(overall).toBeLessThan(74);
    }
  });

  it("follows age: lower overall and more growth room when young, no growth room when old", () => {
    const [young, prime, veteran] = [18, 27, 34].map((age) => sample("MF", age, 70, 300, `age:${age}`));
    const averageOverall = (players: PlayerAttributes[]) => mean(players.map((player) => player.overall));

    expect(averageOverall(young)).toBeLessThan(averageOverall(prime));
    expect(averageOverall(veteran)).toBeLessThan(averageOverall(prime));
    expect(mean(young.map((player) => player.potential - player.overall))).toBeGreaterThan(10);
    expect(veteran.every((player) => player.potential === player.overall)).toBe(true);
  });
});

describe("clubLevelFromRank", () => {
  it("decreases from the champion to the last club", () => {
    const levels = Array.from({ length: 20 }, (_, index) => clubLevelFromRank(index + 1, 20));

    expect(levels[0]).toBeGreaterThan(levels[19]);
    expect(levels.every((level, index) => index === 0 || level <= levels[index - 1])).toBe(true);
  });
});
