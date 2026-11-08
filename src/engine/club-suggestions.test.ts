import { describe, expect, it } from "vitest";
import { suggestClubs, suggestionPreview, type SuggestableClub } from "./club-suggestions";
import { clubFinances } from "./economy";
import { leagueRankingObjective } from "./objectives";
import { creationReputationRanks } from "./reputation";
import type { CompetitionTier } from "./tiers";
import type { WorldVersion } from "./world-version";

/**
 * A French division of `size` clubs in their source order, each with the ranking objective a save's first season gives
 * it, as src/db/clubs.ts computes it: leagueRankingObjective at its creation reputation rank.
 */
const division = (prefix: string, size: number, tier: CompetitionTier, worldVersion: WorldVersion = 2): SuggestableClub[] => {
  const clubs = Array.from({ length: size }, (_, index) => ({ id: `${prefix}-${index + 1}`, name: `Club ${prefix} ${index + 1}`, rank: index + 1 }));
  const ranks = creationReputationRanks(
    clubs.map((club) => ({ key: club.id, initialRank: club.rank, slug: club.id })),
    tier,
  );
  return clubs.map((club) => ({
    ...club,
    objective: leagueRankingObjective({ code: `fr.${tier}`, tier, clubCount: size }, ranks.get(club.id) ?? size, worldVersion),
  }));
};

describe("suggestClubs", () => {
  it("gives a country's champion, the first of its first division's lower half, and the weakest club its second division's board asks to go up", () => {
    const suggestions = suggestClubs([
      { tier: 1, clubs: division("d1", 18, 1) },
      { tier: 2, clubs: division("d2", 18, 2) },
    ]);

    expect(suggestions.map(({ kind, clubId }) => [kind, clubId])).toEqual([
      ["favourite", "d1-1"],
      ["mid-table", "d1-10"],
      ["comeback", "d2-4"],
    ]);
  });

  it("finds them in divisions of any size", () => {
    const suggestions = suggestClubs([
      { tier: 1, clubs: division("d1", 20, 1) },
      { tier: 2, clubs: division("d2", 24, 2) },
    ]);

    expect(suggestions.map(({ clubId }) => clubId)).toEqual(["d1-1", "d1-11", "d2-4"]);
  });

  it("reads the clubs by their ranks, whatever their order", () => {
    const suggestions = suggestClubs([
      { tier: 1, clubs: division("d1", 18, 1).toReversed() },
      { tier: 2, clubs: division("d2", 18, 2).toReversed() },
    ]);

    expect(suggestions.map(({ clubId }) => clubId)).toEqual(["d1-1", "d1-10", "d2-4"]);
  });

  it("announces on each card the objective its board will set, coherent with the card's difficulty", () => {
    const [favourite, midTable, comeback] = suggestClubs([
      { tier: 1, clubs: division("d1", 20, 1) },
      { tier: 2, clubs: division("d2", 24, 2) },
    ]);

    // Easy: the top three, the title exceeding it. Balanced: its expected place. Hard: going up.
    expect(favourite).toMatchObject({ tier: 1, objective: { variant: "TOP", target: 3, exceed: 1 } });
    expect(midTable).toMatchObject({ tier: 1, objective: { variant: "FINISH", target: 11 } });
    expect(comeback).toMatchObject({ tier: 2, objective: { variant: "PROMOTION", target: 2, exceed: 1 } });
    // The clubs' own objectives, never one of the card's making.
    expect(favourite.objective).toEqual(division("d1", 20, 1)[0].objective);
    expect(comeback.objective).toEqual(division("d2", 24, 2)[3].objective);
  });

  it("gives each club the budget a save starts it with", () => {
    const [favourite, midTable, comeback] = suggestClubs([
      { tier: 1, clubs: division("d1", 18, 1) },
      { tier: 2, clubs: division("d2", 18, 2) },
    ]);

    expect(favourite.budget).toBe(clubFinances(1, 18, 1).budget);
    expect(midTable.budget).toBe(clubFinances(10, 18, 1).budget);
    expect(comeback.budget).toBe(clubFinances(4, 18, 2).budget);
    expect(favourite.budget).toBeGreaterThan(midTable.budget);
    expect(midTable.budget).toBeGreaterThan(comeback.budget);
  });

  it("gives each club the reputation a save starts it with, its level before the players are drawn", () => {
    const [favourite, midTable, comeback] = suggestClubs([
      { tier: 1, clubs: division("d1", 18, 1) },
      { tier: 2, clubs: division("d2", 18, 2) },
    ]);

    expect(favourite.reputation).toBe(clubFinances(1, 18, 1).reputation);
    expect(midTable.reputation).toBe(clubFinances(10, 18, 1).reputation);
    expect(comeback.reputation).toBe(clubFinances(4, 18, 2).reputation);
    expect(favourite.reputation).toBeGreaterThan(midTable.reputation);
    expect(midTable.reputation).toBeGreaterThan(comeback.reputation);
  });

  it("leaves out what a country does not have, a comeback without a board asking to go up included", () => {
    expect(suggestClubs([{ tier: 1, clubs: division("d1", 18, 1) }]).map(({ kind }) => kind)).toEqual(["favourite", "mid-table"]);
    // A worldVersion 1 world has no promotion: no club of a second division would be asked to go up.
    expect(
      suggestClubs([
        { tier: 1, clubs: division("d1", 18, 1, 1) },
        { tier: 2, clubs: division("d2", 18, 2, 1) },
      ]).map(({ kind }) => kind),
    ).toEqual(["favourite", "mid-table"]);
    expect(suggestClubs([])).toEqual([]);
  });
});

describe("suggestionPreview", () => {
  it("keeps a card's kind, division and objective, never its club", () => {
    const [comeback] = suggestClubs([{ tier: 2, clubs: division("d2", 18, 2) }]);

    expect(suggestionPreview(comeback)).toEqual({ kind: "comeback", tier: 2, objective: comeback.objective });
  });
});
