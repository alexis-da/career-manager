import { describe, expect, it } from "vitest";
import { REPUTATION_TARGET_SHARE } from "./balance";
import { clubFinances } from "./economy";
import { creationReputationRanks, rankInNextDivision, reputationAfterSeason, reputationRanks, reputationTarget } from "./reputation";

describe("reputationRanks", () => {
  it("ranks a division by reputation, one club a rank: equal reputations by wage budget, then by slug", () => {
    const ranks = reputationRanks([
      { key: "a", reputation: 70, wageBudget: 40_000_000, slug: "zeta" },
      { key: "b", reputation: 82, wageBudget: 90_000_000, slug: "beta" },
      { key: "c", reputation: 70, wageBudget: 55_000_000, slug: "gamma" },
      { key: "d", reputation: 70, wageBudget: 40_000_000, slug: "alpha" },
      { key: "e", reputation: 55, wageBudget: 20_000_000, slug: "delta" },
    ]);

    expect(Object.fromEntries(ranks)).toEqual({ b: 1, c: 2, d: 3, a: 4, e: 5 });
  });

  it("gives the same ranks whatever the order of the clubs", () => {
    const clubs = [
      { key: 1, reputation: 60, wageBudget: 10, slug: "b" },
      { key: 2, reputation: 60, wageBudget: 10, slug: "a" },
      { key: 3, reputation: 61, wageBudget: 5, slug: "c" },
    ];

    expect(reputationRanks(clubs)).toEqual(reputationRanks([...clubs].reverse()));
    expect(Object.fromEntries(reputationRanks(clubs))).toEqual({ 3: 1, 2: 2, 1: 3 });
  });
});

describe("creationReputationRanks", () => {
  it("ranks a division at a save's creation by its source ranks, equal reputations included, whatever their slugs", () => {
    // A second division of 24: ranks 4 and 5, 12 and 13, 20 and 21 have the same creation reputation.
    const clubs = Array.from({ length: 24 }, (_, index) => ({ key: index + 1, initialRank: index + 1, slug: String.fromCharCode(122 - index) }));
    const reputations = clubs.map(({ initialRank }) => clubFinances(initialRank, 24, 2).reputation);
    expect(reputations[3]).toBe(reputations[4]);

    const ranks = creationReputationRanks(clubs, 2);

    expect(clubs.map(({ key }) => ranks.get(key))).toEqual(clubs.map(({ initialRank }) => initialRank));
    expect(creationReputationRanks(clubs.toReversed(), 2)).toEqual(ranks);
  });

  it("is reputationRanks on the reputations and wage budgets the creation gives the source ranks", () => {
    const clubs = Array.from({ length: 20 }, (_, index) => ({ key: `club-${index}`, initialRank: index + 1, slug: `club-${index}` }));

    expect(creationReputationRanks(clubs, 1)).toEqual(
      reputationRanks(clubs.map(({ key, initialRank, slug }) => ({ key, slug, ...clubFinances(initialRank, 20, 1) }))),
    );
  });
});

describe("rankInNextDivision", () => {
  // England: 20 clubs in the first division, 24 in the second, three going each way.
  const stay = { clubCount: 20, move: null, moving: 0, nextClubCount: 20 } as const;
  const promoted = { clubCount: 24, move: "PROMOTED", moving: 3, nextClubCount: 20 } as const;
  const relegated = { clubCount: 20, move: "RELEGATED", moving: 3, nextClubCount: 24 } as const;

  it("keeps the final rank of a club staying in its division", () => {
    expect(rankInNextDivision({ ...stay, finalRank: 1 })).toBe(1);
    expect(rankInNextDivision({ ...stay, finalRank: 17 })).toBe(17);
  });

  it("puts the promoted clubs at the bottom of the division above, and the relegated ones at the top of the one below", () => {
    expect([1, 2, 3].map((finalRank) => rankInNextDivision({ ...promoted, finalRank }))).toEqual([18, 19, 20]);
    expect([18, 19, 20].map((finalRank) => rankInNextDivision({ ...relegated, finalRank }))).toEqual([1, 2, 3]);
  });
});

describe("reputationTarget", () => {
  it("is the creation's reputation of the club ranked there in the division", () => {
    expect(reputationTarget(1, 20, 1)).toBe(90);
    expect(reputationTarget(20, 20, 1)).toBe(55);
    for (let rank = 1; rank <= 24; rank++) {
      expect(reputationTarget(rank, 24, 2)).toBe(clubFinances(rank, 24, 2).reputation);
    }
  });

  it("gives a division its creation's reputations again, whoever stays, goes up or comes down", () => {
    // The first division after a season: 17 clubs staying at ranks 1 to 17, the second division's top three promoted.
    const staying = Array.from({ length: 17 }, (_, index) => reputationTarget(index + 1, 20, 1));
    const arriving = [1, 2, 3].map((finalRank) =>
      reputationTarget(rankInNextDivision({ finalRank, clubCount: 24, move: "PROMOTED", moving: 3, nextClubCount: 20 }), 20, 1),
    );
    const creation = Array.from({ length: 20 }, (_, index) => clubFinances(index + 1, 20, 1).reputation);

    expect([...staying, ...arriving].sort((a, b) => a - b)).toEqual(creation.sort((a, b) => a - b));
  });
});

describe("reputationAfterSeason", () => {
  it(`goes ${100 * REPUTATION_TARGET_SHARE} % of the way to its target in its division, rounded alike up and down`, () => {
    const after = (reputation: number, target: number): number =>
      reputation + Math.sign(target - reputation) * Math.round(Math.abs(REPUTATION_TARGET_SHARE * (target - reputation)));

    for (const [reputation, target] of [
      [70, 90],
      [70, 50],
      [70, 72],
      [70, 68],
      [55, 56],
      [40, 60],
      [89, 55],
    ]) {
      expect(reputationAfterSeason(reputation, target, null)).toBe(after(reputation, target));
    }
    expect(reputationAfterSeason(70, 70, null)).toBe(70);
  });

  it("takes its target outright when promoted or relegated", () => {
    expect(reputationAfterSeason(78, 60, "RELEGATED")).toBe(60);
    expect(reputationAfterSeason(56, 57, "PROMOTED")).toBe(57);
    expect(reputationAfterSeason(60, 59, "PROMOTED")).toBe(59);
  });

  it("moves up and down by the same amount for the same gap", () => {
    for (let gap = 1; gap <= 40; gap++) {
      expect(reputationAfterSeason(60, 60 + gap, null) - 60).toBe(60 - reputationAfterSeason(60, 60 - gap, null));
    }
  });

  it("never passes its target, and stays within 1–99", () => {
    for (const [reputation, target] of [
      [98, 99],
      [2, 1],
      [50, 51],
      [50, 49],
    ]) {
      const after = reputationAfterSeason(reputation, target, null);
      expect(Math.abs(target - after)).toBeLessThanOrEqual(Math.abs(target - reputation));
      expect(after).toBeGreaterThanOrEqual(1);
      expect(after).toBeLessThanOrEqual(99);
    }
  });
});
