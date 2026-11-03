import { describe, expect, it } from "vitest";
import { FULL_FITNESS, REGULATION_MINUTES } from "./balance";
import { fitnessAfter, fitnessAfterMatch, fitnessFactor, injuryRiskFactor, playingFactor, recoveredFitness, wearFactor } from "./fitness";

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
  it("weighs on a player's share of his team's strength at kick-off: 0.9775 at 85, nothing when rested", () => {
    expect(fitnessFactor(FULL_FITNESS)).toBe(1);
    expect(fitnessFactor(85)).toBeCloseTo(0.9775);
    expect(fitnessFactor(85)).toBeGreaterThan(fitnessFactor(75));
  });

  it("wears him down on the pitch more than a short rest does: 0.8 after an hour, and both factors together", () => {
    expect(wearFactor(0)).toBe(1);
    expect(wearFactor(20)).toBeCloseTo(0.8);
    expect(wearFactor(-5)).toBe(1);
    // Fresh at kick-off, worn down to 80: the wear alone. At 85 at kick-off, worn down to 65: both.
    expect(playingFactor(FULL_FITNESS, 80)).toBeCloseTo(wearFactor(20));
    expect(playingFactor(85, 65)).toBeCloseTo(fitnessFactor(85) * wearFactor(20));
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
