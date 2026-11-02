import { describe, expect, it } from "vitest";
import { isLivePath, sectionAt, SECTIONS, tabAt, tabsOf, tabTestId } from "./sections";

describe("a save's sections", () => {
  it("puts every screen of a save under one of the five entries", () => {
    const entryOf = (path: string) => sectionAt(path).key;
    expect(entryOf("")).toBe("dashboard");
    expect(entryOf("/squad")).toBe("team");
    expect(entryOf("/lineup")).toBe("team");
    expect(entryOf("/fixtures")).toBe("match");
    expect(entryOf("/standings")).toBe("match");
    expect(entryOf("/cup")).toBe("match");
    expect(entryOf("/live")).toBe("match");
    expect(entryOf("/transfers")).toBe("transfers");
    expect(entryOf("/club")).toBe("club");
    expect(entryOf("/challenge")).toBe("club");
    expect(entryOf("/seasons")).toBe("club");
    expect(entryOf("/seasons/season-1")).toBe("club");
  });

  it("gives the live match no tab: it is reached by playing, not from a menu", () => {
    expect(tabAt("/live")).toBeUndefined();
    expect(tabAt("/lineup")).toBe("lineup");
    expect(tabAt("")).toBeUndefined();
  });

  it("does not take a path that merely starts like a screen's for that screen", () => {
    expect(tabAt("/squadron")).toBeUndefined();
    expect(sectionAt("/liveness").key).toBe("dashboard");
    expect(isLivePath("/liveness")).toBe(false);
  });

  it("knows the live match, whose own buttons are the way on", () => {
    expect(isLivePath("/live")).toBe(true);
    expect(isLivePath("/standings")).toBe(false);
    expect(isLivePath("")).toBe(false);
  });

  it("offers « Coupe » only with a cup", () => {
    const match = sectionAt("/fixtures");
    expect(tabsOf(match, true)).toEqual(["fixtures", "standings", "cup"]);
    expect(tabsOf(match, false)).toEqual(["fixtures", "standings"]);
  });

  it("has five entries, each leading to one of its own screens", () => {
    expect(SECTIONS.map(({ key }) => key)).toEqual(["dashboard", "team", "match", "transfers", "club"]);
    for (const section of SECTIONS) {
      expect(sectionAt(section.home).key).toBe(section.key);
      expect(sectionAt(section.computerHome ?? section.home).key).toBe(section.key);
    }
  });

  it("leads Club to its overview at every width, with the challenge and the honours beside it", () => {
    const club = sectionAt("/club");
    expect(club.home).toBe("/club");
    expect(club.computerHome).toBeUndefined();
    expect(tabsOf(club, false)).toEqual(["club", "challenge", "seasons"]);
    expect(tabAt("/seasons/season-1")).toBe("seasons");
  });

  it("never gives a tab the test id of an entry", () => {
    const entries = SECTIONS.map(({ key }) => `nav-${key}`);
    expect(SECTIONS.flatMap(({ tabs }) => tabs).map(tabTestId).filter((id) => entries.includes(id))).toEqual([]);
    expect(tabTestId("lineup")).toBe("nav-lineup");
  });

  it("leads Match to the calendar on a phone, to the table with the calendar beside it on a computer", () => {
    const match = sectionAt("/fixtures");
    expect(match.home).toBe("/fixtures");
    expect(match.computerHome).toBe("/standings");
  });

  it("leads Équipe to the squad on a phone, to the line-up with the squad and the sheet beside it on a computer", () => {
    const team = sectionAt("/squad");
    expect(team.home).toBe("/squad");
    expect(team.computerHome).toBe("/lineup");
  });
});
