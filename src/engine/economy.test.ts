import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { CONTRACT_YEARS_WEIGHTS, WAGE_BUDGET_MARGIN } from "./balance";
import { clubFinances, contractYears, generateContract, managedWageMargin, seasonFinances, wageBudgetFor } from "./economy";
import { WORLD_START_DATE } from "./world";

const MAX_DATABASE_INT = 2_147_483_647;

const isStoredAmount = (value: number): boolean => Number.isInteger(value) && value > 0 && value <= MAX_DATABASE_INT;

describe("clubFinances", () => {
  it.each([1, 2] as const)("gives tier %i's champion more money and reputation than its last club", (tier) => {
    const champion = clubFinances(1, 20, tier);
    const last = clubFinances(20, 20, tier);

    expect(champion.budget).toBeGreaterThan(last.budget);
    expect(champion.wageBudget).toBeGreaterThan(last.wageBudget);
    expect(champion.reputation).toBeGreaterThan(last.reputation);
  });

  it("keeps the first division's figures, and puts a second division's champion below a mid-table first division club", () => {
    expect(clubFinances(1, 20, 1)).toEqual({ budget: 150_000_000, wageBudget: 200_000_000, reputation: 90 });
    expect(clubFinances(20, 20, 1)).toEqual({ budget: 5_000_000, wageBudget: 20_000_000, reputation: 55 });
    const secondChampion = clubFinances(1, 24, 2);
    const firstMidTable = clubFinances(10, 20, 1);
    expect(secondChampion.budget).toBeLessThan(firstMidTable.budget);
    expect(secondChampion.reputation).toBeLessThan(firstMidTable.reputation);
  });

  it("keeps amounts positive database integers and reputation within 1–99", () => {
    for (const tier of [1, 2] as const) {
      for (let rank = 1; rank <= 24; rank++) {
        const finances = clubFinances(rank, 24, tier);
        expect(isStoredAmount(finances.budget) && isStoredAmount(finances.wageBudget)).toBe(true);
        expect(finances.reputation).toBeGreaterThanOrEqual(1);
        expect(finances.reputation).toBeLessThanOrEqual(99);
      }
    }
  });
});

describe("seasonFinances", () => {
  const input = {
    reputationRank: 4,
    clubCount: 20,
    tier: 1,
    coefficient: 110,
    unspent: 7_300_000,
    payroll: 50_000_000,
    wageMargin: 1.2,
  } as const;

  it("gives the creation's budget at the reputation rank, times the coefficient, plus half of the unspent budget", () => {
    const creation = clubFinances(4, 20, 1);

    expect(seasonFinances(input)).toEqual({
      dotation: creation.budget,
      coefficient: 110,
      carryOver: 3_650_000,
      budget: Math.round((creation.budget * 1.1) / 100_000) * 100_000 + 3_650_000,
      wageBudget: 60_000_000,
    });
  });

  it("keeps the wage budget out of the coefficient, and carries nothing over from an overspent budget", () => {
    const low = seasonFinances({ ...input, reputationRank: 12, clubCount: 18, tier: 2, coefficient: 70, unspent: -2_000_000 });
    const high = seasonFinances({ ...input, reputationRank: 12, clubCount: 18, tier: 2, coefficient: 140, unspent: 0 });

    expect(low.wageBudget).toBe(high.wageBudget);
    expect(low.carryOver).toBe(0);
    expect(low.budget).toBeLessThan(high.budget);
    expect(high.budget).toBe(Math.round((high.dotation * 1.4) / 100_000) * 100_000);
  });

  it("gives the same dotation to clubs sharing a reputation rank, and more to a better rank", () => {
    expect(seasonFinances({ ...input, reputationRank: 3 })).toEqual(seasonFinances({ ...input, reputationRank: 3 }));
    expect(seasonFinances({ ...input, reputationRank: 2 }).dotation).toBeGreaterThan(
      seasonFinances({ ...input, reputationRank: 3 }).dotation,
    );
  });

  it("measures the wage budget against the payroll, never above the table's at the reputation rank", () => {
    const table = clubFinances(4, 20, 1).wageBudget;

    expect(seasonFinances({ ...input, payroll: 40_000_000, wageMargin: 1.3 }).wageBudget).toBe(52_000_000);
    expect(seasonFinances({ ...input, payroll: table, wageMargin: 1.1 }).wageBudget).toBe(table);
  });
});

describe("wageBudgetFor", () => {
  it("adds the margin to the payroll, rounded to the budget step", () => {
    expect(wageBudgetFor(31_234_000, 1.2, 200_000_000)).toBe(37_500_000);
    expect(wageBudgetFor(5_000_000, 1.1, 200_000_000)).toBe(5_500_000);
  });

  it("never goes above the table's wage budget: an overpaid squad stays above its budget", () => {
    expect(wageBudgetFor(30_000_000, 1.2, 25_000_000)).toBe(25_000_000);
  });
});

describe("managedWageMargin", () => {
  it("goes from 1.10 at the lowest coefficient to 1.30 at the highest, 1.20 at 100", () => {
    expect(managedWageMargin(70)).toBeCloseTo(1.1, 10);
    expect(managedWageMargin(100)).toBe(WAGE_BUDGET_MARGIN);
    expect(managedWageMargin(140)).toBeCloseTo(1.3, 10);
    expect(managedWageMargin(85)).toBeCloseTo(1.15, 10);
    expect(managedWageMargin(120)).toBeCloseTo(1.25, 10);
  });

  it("stays within its range outside the coefficients' bounds, and rises with the coefficient", () => {
    expect(managedWageMargin(50)).toBeCloseTo(1.1, 10);
    expect(managedWageMargin(200)).toBeCloseTo(1.3, 10);
    for (let coefficient = 70; coefficient < 140; coefficient += 5) {
      expect(managedWageMargin(coefficient + 5)).toBeGreaterThan(managedWageMargin(coefficient));
    }
  });
});

describe("contractYears", () => {
  it("draws 1 to 5 seasons with weights 10 / 25 / 30 / 25 / 10 %", () => {
    const draws = 20_000;
    const rng = makeRng("contract-weights");
    const counts = [0, 0, 0, 0, 0];
    for (let draw = 0; draw < draws; draw++) {
      counts[contractYears(25, rng) - 1]++;
    }
    const total = CONTRACT_YEARS_WEIGHTS.reduce((sum, weight) => sum + weight, 0);

    counts.forEach((count, index) => {
      expect(Math.abs(count / draws - CONTRACT_YEARS_WEIGHTS[index] / total)).toBeLessThan(0.015);
    });
  });

  it("never offers more than 2 seasons after 33, but still does at 33", () => {
    const rng = makeRng("late-career");
    const lengths = (age: number) => new Set(Array.from({ length: 2_000 }, () => contractYears(age, rng)));

    expect([...lengths(33)].sort()).toEqual([1, 2, 3, 4, 5]);
    expect([...lengths(34)].sort()).toEqual([1, 2]);
    expect([...lengths(38)].sort()).toEqual([1, 2]);
  });
});

describe("generateContract", () => {
  it("keeps market value and wage positive database integers for any rating and age", () => {
    const rng = makeRng("contract-bounds");
    const invalid: string[] = [];
    for (let overall = 1; overall <= 99; overall++) {
      for (let age = 17; age <= 36; age++) {
        const contract = generateContract({ age, overall, potential: 99 }, WORLD_START_DATE, rng);
        if (!isStoredAmount(contract.marketValue) || !isStoredAmount(contract.wage)) {
          invalid.push(`overall ${overall}, age ${age}`);
        }
      }
    }

    expect(invalid).toEqual([]);
  });

  it("values a young player with growth room above a veteran of the same rating", () => {
    const young = generateContract({ age: 20, overall: 70, potential: 85 }, WORLD_START_DATE, makeRng("a"));
    const veteran = generateContract({ age: 33, overall: 70, potential: 70 }, WORLD_START_DATE, makeRng("a"));

    expect(young.marketValue).toBeGreaterThan(veteran.marketValue);
  });

  it("ends contracts on 30 June, 1 to 5 seasons after the signing date", () => {
    const rng = makeRng("contract-length");
    const endDates = new Set(
      Array.from({ length: 500 }, () =>
        generateContract({ age: 24, overall: 70, potential: 70 }, WORLD_START_DATE, rng).contractUntil.toISOString(),
      ),
    );

    expect([...endDates].sort()).toEqual([
      "2027-06-30T00:00:00.000Z",
      "2028-06-30T00:00:00.000Z",
      "2029-06-30T00:00:00.000Z",
      "2030-06-30T00:00:00.000Z",
      "2031-06-30T00:00:00.000Z",
    ]);
  });

  it("returns the same contract for the same stream", () => {
    const contract = () => generateContract({ age: 25, overall: 72, potential: 78 }, WORLD_START_DATE, makeRng("same"));

    expect(contract()).toEqual(contract());
  });
});
