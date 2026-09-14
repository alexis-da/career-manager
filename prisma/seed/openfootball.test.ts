import { describe, expect, it } from "vitest";
import {
  extractClubs,
  fixtureFilePath,
  parseFixtureFile,
  readFixtureFile,
  resolveClubName,
  slugify,
} from "./openfootball";

describe("extractClubs", () => {
  it.each<[string, number]>([
    ["en.1", 20],
    ["es.1", 20],
    ["de.1", 18],
    ["it.1", 20],
    ["fr.1", 18],
  ])("%s produces %i clubs", (code, expected) => {
    const clubs = extractClubs(readFixtureFile(fixtureFilePath(code)));

    expect(clubs).toHaveLength(expected);
  });

  it("accepts matches without time or score", () => {
    const file = parseFixtureFile(
      {
        name: "Test league",
        matches: [{ round: "Matchday 1", date: "2024-08-16", team1: "Alpha FC", team2: "Beta FC" }],
      },
      "inline",
    );

    expect(extractClubs(file).map((club) => club.slug)).toEqual(["alpha-fc", "beta-fc"]);
  });
});

describe("club names", () => {
  it("builds a stable ASCII slug", () => {
    expect(slugify("Manchester United FC")).toBe("manchester-united-fc");
    expect(slugify("Borussia Mönchengladbach")).toBe("borussia-monchengladbach");
    expect(slugify("Brighton & Hove Albion FC")).toBe("brighton-hove-albion-fc");
    expect(slugify("1. FC Union Berlin")).toBe("1-fc-union-berlin");
  });

  it("normalizes whitespace and applies aliases", () => {
    expect(resolveClubName("  Real   Madrid CF ")).toBe("Real Madrid CF");
    expect(resolveClubName("Man. United", { "Man. United": "Manchester United FC" })).toBe(
      "Manchester United FC",
    );
  });
});
