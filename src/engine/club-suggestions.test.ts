import { describe, expect, it } from "vitest";
import { suggestClubs, type SuggestableClub } from "./club-suggestions";
import { clubFinances } from "./economy";

const division = (prefix: string, size: number): SuggestableClub[] =>
  Array.from({ length: size }, (_, index) => ({ id: `${prefix}-${index + 1}`, name: `Club ${prefix} ${index + 1}`, rank: index + 1 }));

describe("suggestClubs", () => {
  it("gives a country's champion, then a club of the middle of each division", () => {
    const suggestions = suggestClubs([
      { tier: 1, clubs: division("d1", 18) },
      { tier: 2, clubs: division("d2", 18) },
    ]);

    expect(suggestions.map(({ kind, clubId }) => [kind, clubId])).toEqual([
      ["favourite", "d1-1"],
      ["mid-table", "d1-10"],
      ["comeback", "d2-9"],
    ]);
  });

  it("finds the middle of a division of any size", () => {
    const suggestions = suggestClubs([
      { tier: 1, clubs: division("d1", 20) },
      { tier: 2, clubs: division("d2", 24) },
    ]);

    expect(suggestions.map(({ clubId }) => clubId)).toEqual(["d1-1", "d1-11", "d2-12"]);
  });

  it("reads the clubs by their ranks, whatever their order", () => {
    const suggestions = suggestClubs([
      { tier: 1, clubs: division("d1", 18).toReversed() },
      { tier: 2, clubs: division("d2", 18).toReversed() },
    ]);

    expect(suggestions.map(({ clubId }) => clubId)).toEqual(["d1-1", "d1-10", "d2-9"]);
  });

  it("gives each club the budget a save starts it with", () => {
    const [favourite, midTable, comeback] = suggestClubs([
      { tier: 1, clubs: division("d1", 18) },
      { tier: 2, clubs: division("d2", 18) },
    ]);

    expect(favourite.budget).toBe(clubFinances(1, 18, 1).budget);
    expect(midTable.budget).toBe(clubFinances(10, 18, 1).budget);
    expect(comeback.budget).toBe(clubFinances(9, 18, 2).budget);
    expect(favourite.budget).toBeGreaterThan(midTable.budget);
    expect(midTable.budget).toBeGreaterThan(comeback.budget);
  });

  it("gives each club the reputation a save starts it with, its level before the players are drawn", () => {
    const [favourite, midTable, comeback] = suggestClubs([
      { tier: 1, clubs: division("d1", 18) },
      { tier: 2, clubs: division("d2", 18) },
    ]);

    expect(favourite.reputation).toBe(clubFinances(1, 18, 1).reputation);
    expect(midTable.reputation).toBe(clubFinances(10, 18, 1).reputation);
    expect(comeback.reputation).toBe(clubFinances(9, 18, 2).reputation);
    expect(favourite.reputation).toBeGreaterThan(midTable.reputation);
    expect(midTable.reputation).toBeGreaterThan(comeback.reputation);
  });

  it("leaves out what a country does not have", () => {
    expect(suggestClubs([{ tier: 1, clubs: division("d1", 18) }]).map(({ kind }) => kind)).toEqual(["favourite", "mid-table"]);
    expect(suggestClubs([])).toEqual([]);
  });
});
