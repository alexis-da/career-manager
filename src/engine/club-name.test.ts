import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { clubNameIn, clubShortNameIn, displayClubName, FICTIONAL_CLUB_NAMES, parseClubNameMode } from "./club-name";

const LYON = { slug: "olympique-lyonnais", name: "Olympique Lyonnais" };

const seedClubs = buildWorldPlan().flatMap(({ clubs }) => clubs.map(({ slug, name }) => ({ slug, name })));

/** Words of a real name that are not generic (club forms, articles, years): the ones a fictional name must avoid. */
const GENERIC = new Set(["fc", "cf", "ac", "as", "sc", "sv", "club", "de", "del", "di", "calcio", "city", "town", "united", "football"]);
const distinctiveWords = (name: string): string[] =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((word) => word.length > 2 && !GENERIC.has(word));

describe("club names", () => {
  it("reads CLUB_NAMES: real by default, fictional on demand, anything else refused", () => {
    expect(parseClubNameMode(undefined)).toBe("real");
    expect(parseClubNameMode("")).toBe("real");
    expect(parseClubNameMode("real")).toBe("real");
    expect(parseClubNameMode(" fictional ")).toBe("fictional");
    expect(() => parseClubNameMode("fictif")).toThrow(/CLUB_NAMES/);
  });

  it("shows the world's name in real mode, the fallback name in fictional mode", () => {
    expect(clubNameIn("real", LYON)).toBe("Olympique Lyonnais");
    expect(clubNameIn("fictional", LYON)).toBe("Rhône FC");
    expect(clubShortNameIn("real", { ...LYON, shortName: "Lyon" })).toBe("Lyon");
    expect(clubShortNameIn("real", { ...LYON, shortName: null })).toBe("Olympique Lyonnais");
    expect(clubShortNameIn("fictional", { ...LYON, shortName: "Lyon" })).toBe("Rhône FC");
    // Tests run without CLUB_NAMES: the real names.
    expect(displayClubName(LYON)).toBe("Olympique Lyonnais");
  });

  it("never falls back on the real name for a club without a fictional one", () => {
    expect(() => clubNameIn("fictional", { slug: "unknown-club", name: "Unknown Club" })).toThrow(/unknown-club/);
  });

  it("has a fictional name for each of the 96 clubs of the seed, and none for another club", () => {
    expect(seedClubs).toHaveLength(96);
    expect(seedClubs.filter((club) => !FICTIONAL_CLUB_NAMES.has(club.slug)).map((club) => club.slug)).toEqual([]);
    expect([...FICTIONAL_CLUB_NAMES.keys()].sort()).toEqual(seedClubs.map((club) => club.slug).sort());
  });

  it("gives every club a distinct fictional name, different from its real one", () => {
    const names = seedClubs.map((club) => clubNameIn("fictional", club));

    expect(new Set(names).size).toBe(names.length);
    expect(seedClubs.filter((club) => clubNameIn("fictional", club) === club.name)).toEqual([]);
  });

  it("keeps the real clubs' distinctive words out of the fictional names", () => {
    // A city in both is fine (Liverpool FC → Liverpool Sporting); the words that make the club are not.
    const PLACE_NAMES = new Set([
      "bournemouth", "leicester", "liverpool", "manchester", "nottingham", "leganes", "vigo", "leverkusen", "dortmund",
      "frankfurt", "augsburg", "leipzig", "bremen", "bochum", "wolfsburg", "lille", "madrid",
    ]);
    const leaks = seedClubs.flatMap((club) => {
      const fictional = distinctiveWords(clubNameIn("fictional", club));
      return distinctiveWords(club.name)
        .filter((word) => !PLACE_NAMES.has(word) && fictional.includes(word))
        .map((word) => `${club.slug}: ${word}`);
    });

    expect(leaks).toEqual([]);
  });
});
