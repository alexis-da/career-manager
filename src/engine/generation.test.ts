import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import {
  ATTRIBUTE_NAMES,
  clubLevelFromRank,
  generateAttributes,
  overallFor,
  type AttributeName,
  type PlayerAttributes,
} from "./generation";
import { POSITIONS, positionGroup, type Position } from "./positions";
const RATINGS = [...ATTRIBUTE_NAMES, "overall", "potential"] as const;
const OUTFIELD_ATTRIBUTES = ATTRIBUTE_NAMES.filter((name) => name !== "goalkeeping");

function sample(position: Position, age: number, clubLevel: number, count: number, seed: string): PlayerAttributes[] {
  const rng = makeRng(seed);
  return Array.from({ length: count }, () => generateAttributes({ position, age }, clubLevel, rng));
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

describe("generateAttributes", () => {
  it("returns the same attributes for the same seed", () => {
    expect(sample("CM", 24, 70, 50, "save-a")).toEqual(sample("CM", 24, 70, 50, "save-a"));
    expect(sample("CM", 24, 70, 50, "save-a")).not.toEqual(sample("CM", 24, 70, 50, "save-b"));
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
    expect(() => generateAttributes({ position: "ST", age: 25 }, 0, makeRng("x"))).toThrow(RangeError);
    expect(() => generateAttributes({ position: "ST", age: 25 }, 100, makeRng("x"))).toThrow(RangeError);
  });

  it("shapes attributes by position", () => {
    const [goalkeepers, defenders, forwards] = (["GK", "CB", "ST"] as const).map((position) =>
      sample(position, 27, 70, 300, `position:${position}`),
    );
    const average = (players: PlayerAttributes[], name: (typeof RATINGS)[number]) =>
      mean(players.map((player) => player[name]));

    expect(average(goalkeepers, "goalkeeping")).toBeGreaterThan(average(forwards, "goalkeeping") + 40);
    expect(average(defenders, "defending")).toBeGreaterThan(average(forwards, "defending") + 20);
    expect(average(forwards, "shooting")).toBeGreaterThan(average(defenders, "shooting") + 15);
  });

  it("gives each outfield position its strengths: the two attributes it is known for come first", () => {
    const strengths: Partial<Record<Position, [AttributeName, AttributeName]>> = {
      CB: ["defending", "physical"],
      RB: ["pace", "defending"],
      LB: ["pace", "defending"],
      CDM: ["passing", "defending"],
      CAM: ["passing", "dribbling"],
      RM: ["pace", "passing"],
      LM: ["pace", "passing"],
      RW: ["pace", "dribbling"],
      LW: ["pace", "dribbling"],
      ST: ["shooting", "pace"],
    };
    for (const [position, expected] of Object.entries(strengths) as [Position, [AttributeName, AttributeName]][]) {
      const players = sample(position, 27, 70, 300, `strengths:${position}`);
      const top = OUTFIELD_ATTRIBUTES.map((name) => ({ name, value: mean(players.map((player) => player[name])) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 2)
        .map(({ name }) => name);
      expect([position, [...top].sort()]).toEqual([position, [...expected].sort()]);
    }
  });

  it("keeps the central midfielder the most balanced outfield profile", () => {
    const spread = (position: Position): number => {
      const players = sample(position, 27, 70, 300, `balance:${position}`);
      const means = OUTFIELD_ATTRIBUTES.map((name) => mean(players.map((player) => player[name])));
      return Math.max(...means) - Math.min(...means);
    };
    for (const position of POSITIONS.filter((candidate) => candidate !== "GK" && candidate !== "CM")) {
      expect(spread("CM")).toBeLessThan(spread(position));
    }
  });

  it("rates a player with their position's weights, which suit them better than another line's", () => {
    for (const position of POSITIONS) {
      const players = sample(position, 27, 70, 300, `fit:${position}`);
      expect(players.every((player) => player.overall === overallFor(position, player))).toBe(true);
      const own = mean(players.map((player) => player.overall));
      for (const other of POSITIONS.filter((candidate) => positionGroup(candidate) !== positionGroup(position))) {
        expect([position, other, mean(players.map((player) => overallFor(other, player))) < own]).toEqual([position, other, true]);
      }
    }
  });

  it("gives every position an overall close to the club level at peak age", () => {
    for (const position of POSITIONS) {
      const overall = mean(sample(position, 27, 70, 300, `level:${position}`).map((player) => player.overall));
      expect(overall).toBeGreaterThan(66);
      expect(overall).toBeLessThan(74);
    }
  });

  it("follows age: lower overall and more growth room when young, no growth room when old", () => {
    const [young, prime, veteran] = [18, 27, 34].map((age) => sample("CM", age, 70, 300, `age:${age}`));
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
