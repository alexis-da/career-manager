import { describe, expect, it } from "vitest";
import { FORMATION_PROFILES, POSITION_PROFILES } from "./balance";
import {
  averageLevel,
  averageOpponent,
  chooseFormation,
  expectedPoints,
  formationMonthOf,
  monthlyFormation,
  rankFormations,
} from "./formation-choice";
import { FORMATION_NAMES, formationPositions } from "./formations";
import { ATTRIBUTE_NAMES, clampRating, overallFor, type AttributeName } from "./generation";
import { selectRestedLineup, type SquadPlayer } from "./lineup";
import { POSITIONS, type Position } from "./positions";
import { formationStrength } from "./strength";

function player(id: string, position: Position, level: number): SquadPlayer {
  const attributes = Object.fromEntries(
    ATTRIBUTE_NAMES.map((name) => [name, clampRating(level + POSITION_PROFILES[position][name])]),
  ) as Record<AttributeName, number>;
  return { id, position, overall: overallFor(position, attributes), injured: false, form: 50, morale: 50, fitness: 100, ...attributes };
}

/** Two players at every position, all of a level: each formation finds its eleven at their positions. */
const squad = (level: number): SquadPlayer[] =>
  POSITIONS.flatMap((position) => [player(`${position}#1`, position, level), player(`${position}#2`, position, level - 1)]);

describe("the average opponent of a division", () => {
  it("is an eleven of the division's middle level, a first division's above a second's, weighed once", () => {
    expect(averageLevel(1)).toBe(69);
    expect(averageLevel(2)).toBe(58);
    expect(averageOpponent(1).attack).toBeGreaterThan(averageOpponent(2).attack);
    expect(averageOpponent(1).defense).toBeGreaterThan(averageOpponent(2).defense);
    expect(averageOpponent(1)).toBe(averageOpponent(1));
  });
});

describe("the points a team expects", () => {
  it("are about 1.4 against an equal opponent, more against a weaker one, never past 3", () => {
    const equal = formationStrength(selectRestedLineup(squad(70), formationPositions("4-4-2")), "4-4-2");
    const weaker = formationStrength(selectRestedLineup(squad(62), formationPositions("4-4-2")), "4-4-2");
    // Against itself, a win as likely as a loss: 1 point plus half the chance of a winner.
    expect(expectedPoints(equal, equal)).toBeGreaterThan(1.3);
    expect(expectedPoints(equal, equal)).toBeLessThan(1.45);
    expect(expectedPoints(equal, weaker)).toBeGreaterThan(expectedPoints(equal, equal));
    expect(expectedPoints(weaker, equal)).toBeLessThan(expectedPoints(equal, equal));
    expect(expectedPoints(equal, weaker) + expectedPoints(weaker, equal)).toBeLessThan(3);
  });
});

describe("the formations an AI club weighs", () => {
  it("are all seventeen, best first, each with its automatic eleven and that eleven's strength in it", () => {
    const players = squad(70);
    const ranked = rankFormations(players, 1);
    expect(ranked.map((entry) => entry.formation).sort()).toEqual([...FORMATION_NAMES].sort());
    ranked.slice(1).forEach((entry, index) => expect(entry.points).toBeLessThanOrEqual(ranked[index].points));
    for (const entry of ranked) {
      const lineup = selectRestedLineup(players, formationPositions(entry.formation));
      expect(entry.lineup).toEqual(lineup);
      expect(entry.strength).toEqual(formationStrength(lineup, entry.formation));
      expect(entry.points).toBeCloseTo(expectedPoints(entry.strength, averageOpponent(1)), 12);
    }
  });

  it("opens the game for a squad above its division's average and closes it below, the same squad by its division", () => {
    const profileOf = (level: number, tier: 1 | 2) => FORMATION_PROFILES[chooseFormation(squad(level), tier).formation];
    // G1's principle (docs/design/gameplay-v1.md): the favourite opens the match, the underdog closes it.
    expect(profileOf(78, 1).attack).toBeGreaterThan(1);
    expect(profileOf(60, 1).defense).toBeGreaterThan(1);
    // A level-65 squad: below a first division's average, above a second's.
    expect(profileOf(65, 1).defense).toBeGreaterThan(1);
    expect(profileOf(65, 2).attack).toBeGreaterThan(1);
  });

  it("leaves the injured and the suspended out of every eleven it weighs, and always gives the same formation", () => {
    const players = squad(70).map((candidate) =>
      candidate.id === "ST#1" ? { ...candidate, injured: true } : candidate.id === "CB#1" ? { ...candidate, suspended: true } : candidate,
    );
    for (const { lineup } of rankFormations(players, 1)) {
      const keys = [...lineup.starters.map(({ player: starter }) => starter.id), ...lineup.bench.map((substitute) => substitute.id)];
      expect(keys).not.toContain("ST#1");
      expect(keys).not.toContain("CB#1");
    }
    expect(chooseFormation(players, 1)).toEqual(chooseFormation(players, 1));
    expect(chooseFormation(players, 1)).toEqual({ formation: rankFormations(players, 1)[0].formation, lineup: rankFormations(players, 1)[0].lineup });
  });
});

describe("the formation an AI club chooses once a month", () => {
  const november = new Date(Date.UTC(2026, 10, 14));

  it("is the month of the game's calendar, in UTC", () => {
    expect(formationMonthOf(november)).toBe(202611);
    expect(formationMonthOf(new Date(Date.UTC(2026, 10, 30, 23, 59)))).toBe(202611);
    expect(formationMonthOf(new Date(Date.UTC(2026, 11, 1)))).toBe(202612);
    expect(formationMonthOf(new Date(Date.UTC(2027, 0, 2)))).toBe(202701);
  });

  it("is chooseFormation's at the first match of a month, or without one kept, to keep until the month after", () => {
    const players = squad(70);
    const chosen = chooseFormation(players, 1);
    const expected = { ...chosen, toKeep: { formation: chosen.formation, month: 202611 } };

    expect(monthlyFormation(players, 1, null, november)).toEqual(expected);
    expect(monthlyFormation(players, 1, { formation: "5-4-1", month: 202610 }, november)).toEqual(expected);
  });

  it("is the one kept within its month, the eleven picked for this match in it, the injured left out", () => {
    const players = squad(70).map((candidate) => (candidate.id === "ST#1" ? { ...candidate, injured: true } : candidate));
    const kept = { formation: "5-4-1", month: 202611 } as const;
    const result = monthlyFormation(players, 1, kept, new Date(Date.UTC(2026, 10, 28)));

    expect(result).toEqual({ formation: "5-4-1", lineup: selectRestedLineup(players, formationPositions("5-4-1")), toKeep: null });
    expect(result.lineup.starters.map(({ player: starter }) => starter.id)).not.toContain("ST#1");
  });
});
