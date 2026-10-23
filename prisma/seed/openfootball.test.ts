import { describe, expect, it } from "vitest";
import {
  extractClubs,
  extractScores,
  fixtureFilePath,
  parseFixtureFile,
  readFixtureFile,
  regularSeasonMatches,
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
    ["en.2", 24],
    ["es.2", 22],
    ["de.2", 18],
    ["it.2", 20],
    ["fr.2", 18],
  ])("%s produces %i clubs", (code, expected) => {
    const clubs = extractClubs(readFixtureFile(fixtureFilePath(code)));

    expect(clubs).toHaveLength(expected);
  });

  it.each<[string, number]>([
    ["en.2", 552], // 46 matchdays of 12 matches, the 5 promotion play-off matches left out
    ["es.2", 453], // 42 matchdays of 11 matches, 9 of the last without a score
    ["it.2", 380], // 38 matchdays of 10 matches, the 8 play-off and 2 play-out matches left out
  ])("%s gives %i regular season scores to the source season's table", (code, expected) => {
    expect(extractScores(readFixtureFile(fixtureFilePath(code)))).toHaveLength(expected);
  });

  it("reads « Regular, Matchday N », leaves play-offs and play-outs out, and refuses an unknown round", () => {
    const match = (round: string) => ({ round, date: "2025-05-01", team1: "Alpha FC", team2: "Beta FC", score: { ft: [1, 0] } });
    const file = (rounds: string[]) => parseFixtureFile({ name: "Test league", matches: rounds.map(match) }, "inline");

    expect(
      regularSeasonMatches(file(["Matchday 1", "Regular, Matchday 2", "Playoff, Final", "Playout, Final", "Finals, Final"])).map(
        (kept) => kept.round,
      ),
    ).toEqual(["Matchday 1", "Regular, Matchday 2"]);
    expect(() => regularSeasonMatches(file(["Matchday 1", "Quarter-finals"]))).toThrow(/Quarter-finals/);
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
