import { describe, expect, it } from "vitest";
import { HOME_ADVANTAGE, POSITION_PROFILES } from "./balance";
import { FORMATION_NAMES, formationPositions } from "./formations";
import { ATTRIBUTE_NAMES, clampRating, overallFor, type AttributeName } from "./generation";
import { selectRestedLineup, type SquadPlayer } from "./lineup";
import { POSITIONS, type Position } from "./positions";
import { compareFormations, expectedGoalDifference, expectedGoals, formationStrength, type TeamStrength } from "./strength";

function player(id: string, position: Position, level: number, fitness = 100): SquadPlayer {
  const attributes = Object.fromEntries(
    ATTRIBUTE_NAMES.map((name) => [name, clampRating(level + POSITION_PROFILES[position][name])]),
  ) as Record<AttributeName, number>;
  return { id, position, overall: overallFor(position, attributes), injured: false, form: 50, morale: 50, fitness, ...attributes };
}

/** Two players at every position, all of a level: each formation finds its eleven at their positions. */
const squad = (level: number): SquadPlayer[] =>
  POSITIONS.flatMap((position) => [player(`${position}#1`, position, level), player(`${position}#2`, position, level - 1)]);

const strengthOf = (level: number): TeamStrength => formationStrength(selectRestedLineup(squad(level), formationPositions("4-3-3")), "4-3-3");

describe("the goal difference a team expects against an opponent", () => {
  it("is the engine's expected goals of each side, home advantage included", () => {
    const team = strengthOf(70);
    const opponent = strengthOf(66);
    const atHome = expectedGoalDifference(team, { strength: opponent, atHome: true });
    expect(atHome).toBeCloseTo(
      expectedGoals(team, opponent, HOME_ADVANTAGE) - expectedGoals(opponent, team, 1 / HOME_ADVANTAGE),
      10,
    );
    expect(expectedGoalDifference(team, { strength: opponent, atHome: false })).toBeLessThan(atHome);
    // Level teams: only the venue tells them apart.
    expect(expectedGoalDifference(team, { strength: team, atHome: true })).toBeGreaterThan(0);
    expect(expectedGoalDifference(team, { strength: team, atHome: false })).toBeLessThan(0);
  });
});

describe("the comparison of the formations", () => {
  it("plays the automatic eleven of each formation, tired players rested, and flags none without an opponent", () => {
    const players = squad(70).map((candidate, index) => (index === 0 ? { ...candidate, fitness: 60 } : candidate));
    const { options, best } = compareFormations(players, null);
    expect(options.map((option) => option.formation)).toEqual([...FORMATION_NAMES]);
    for (const option of options) {
      const lineup = selectRestedLineup(players, formationPositions(option.formation));
      expect(option.strength).toEqual(formationStrength(lineup, option.formation));
      expect(option.goalDifference).toBeNull();
    }
    expect(best).toBeNull();
  });

  it("flags the formation of the largest goal difference: an attacking one for a favourite, a defensive one for an underdog", () => {
    const favourite = compareFormations(squad(76), { strength: strengthOf(64), atHome: true });
    const underdog = compareFormations(squad(64), { strength: strengthOf(76), atHome: false });
    for (const { options, best } of [favourite, underdog]) {
      const largest = Math.max(...options.map((option) => option.goalDifference ?? -Infinity));
      expect(options.find((option) => option.formation === best)?.goalDifference).toBe(largest);
    }
    expect(["3-4-3", "4-3-3"]).toContain(favourite.best);
    expect(["5-3-2", "4-1-4-1"]).toContain(underdog.best);
  });
});
