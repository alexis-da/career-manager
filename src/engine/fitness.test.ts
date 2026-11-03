import { describe, expect, it } from "vitest";
import { FULL_FITNESS, REGULATION_MINUTES } from "./balance";
import { fitnessAfter, fitnessAfterMatch, fitnessFactor, injuryRiskFactor, recoveredFitness } from "./fitness";

/** A starter's fitness at the kick-off of each match of a calendar (days from the first), playing every minute of each. */
function kickOffFitness(days: readonly number[]): number[] {
  let fitness = FULL_FITNESS;
  let today = days[0];
  return days.map((day) => {
    fitness = recoveredFitness(fitness, day - today);
    today = day;
    const atKickOff = fitness;
    fitness = Math.round(fitnessAfterMatch(fitness, [{ slot: "CM", minutes: REGULATION_MINUTES }]));
    return atKickOff;
  });
}

describe("fitness", () => {
  it("weighs on a player's share of his team's strength: 0.91 at 70, nothing when rested", () => {
    expect(fitnessFactor(FULL_FITNESS)).toBe(1);
    expect(fitnessFactor(70)).toBeCloseTo(0.91);
    expect(fitnessFactor(85)).toBeGreaterThan(fitnessFactor(75));
  });

  it("drops by 5 a quarter of an hour on the pitch, 1.5 for a goalkeeper, never below 0", () => {
    expect(fitnessAfter(100, "ST", 15)).toBe(95);
    expect(fitnessAfter(100, "CB", REGULATION_MINUTES)).toBe(70);
    expect(fitnessAfter(100, "GK", REGULATION_MINUTES)).toBe(91);
    expect(fitnessAfter(10, "CM", 120)).toBe(0);
    expect(fitnessAfter(80, "CM", -5)).toBe(80);
    expect(fitnessAfterMatch(100, [{ slot: "CM", minutes: 45 }, { slot: "GK", minutes: 45 }])).toBe(80.5);
    expect(fitnessAfterMatch(64, [])).toBe(64);
  });

  it("comes back day by day, up to full fitness", () => {
    expect(recoveredFitness(70, 3)).toBe(85);
    expect(recoveredFitness(70, 6)).toBe(FULL_FITNESS);
    expect(recoveredFitness(70, 0)).toBe(70);
  });

  it("starts the second match of a two-match week around 85, the third of three in 8 days around 75, and is whole after 6 days", () => {
    // Saturday, then Tuesday: three days to recover from a whole match.
    expect(kickOffFitness([0, 3])).toEqual([100, 85]);
    // Saturday, Tuesday, Saturday.
    expect(kickOffFitness([0, 3, 7])).toEqual([100, 85, 75]);
    // A whole match costs 30, back in six days; three matches in 8 days leave a week later a player still short of it.
    expect(kickOffFitness([0, 6])).toEqual([100, 100]);
    expect(kickOffFitness([0, 5])).toEqual([100, 95]);
    expect(kickOffFitness([0, 3, 7, 14])).toEqual([100, 85, 75, 80]);
  });

  it("makes a tired player likelier to get injured, twice as likely at 40", () => {
    expect(injuryRiskFactor(FULL_FITNESS)).toBe(1);
    expect(injuryRiskFactor(70)).toBe(1);
    expect(injuryRiskFactor(55)).toBeCloseTo(1.5);
    expect(injuryRiskFactor(40)).toBeCloseTo(2);
  });
});
