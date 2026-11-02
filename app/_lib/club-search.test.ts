import { describe, expect, it } from "vitest";
import { searchClubs, type ClubChoice } from "./club-search";

const clubs = (...names: string[]): ClubChoice[] =>
  names.map((name) => ({ value: name, label: name, competition: "France — Division 1" }));

const CLUBS = clubs("1. FC Köln", "AS Saint-Étienne", "Paris FC", "Paris Saint-Germain FC", "SC Preußen Münster", "Toulouse FC");

const found = (query: string, among = CLUBS) => searchClubs(among, query)?.map(({ label }) => label);

describe("searchClubs", () => {
  it("finds a query anywhere in a club's name, whatever its case", () => {
    expect(found("paris")).toEqual(["Paris FC", "Paris Saint-Germain FC"]);
    expect(found("GERMAIN")).toEqual(["Paris Saint-Germain FC"]);
  });

  it("does not mind the accents, in the name or in the query", () => {
    expect(found("etienne")).toEqual(["AS Saint-Étienne"]);
    expect(found("toulousé")).toEqual(["Toulouse FC"]);
    expect(found("koln")).toEqual(["1. FC Köln"]);
  });

  it("finds a « ß » spelt out", () => {
    expect(found("preussen")).toEqual(["SC Preußen Münster"]);
    expect(found("Preußen")).toEqual(["SC Preußen Münster"]);
  });

  it("is no search under two characters, the spaces around them aside", () => {
    expect(searchClubs(CLUBS, "")).toBeNull();
    expect(searchClubs(CLUBS, "p")).toBeNull();
    expect(searchClubs(CLUBS, " p ")).toBeNull();
    expect(found(" pa ")).toEqual(["Paris FC", "Paris Saint-Germain FC"]);
  });

  it("gives an empty list when no club has the query", () => {
    expect(searchClubs(CLUBS, "zzz")).toEqual([]);
  });

  it("gives the first six clubs, in the list's order", () => {
    const many = clubs("Club H", "Club B", "Club G", "Club F", "Club E", "Club D", "Club C", "Club A");

    expect(found("club", many)).toEqual(["Club H", "Club B", "Club G", "Club F", "Club E", "Club D"]);
  });
});
