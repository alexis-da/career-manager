import { describe, expect, it } from "vitest";
import { fixtureWindow, nextFixture } from "./fixture-window";

const SEASON_LENGTH = 34;

/** A season's fixtures in date order, each known by its number, the first ones played. */
const season = (played: number, length = SEASON_LENGTH) =>
  Array.from({ length }, (_, index) => ({ number: index + 1, played: index < played }));

const shown = (played: number, length?: number) => fixtureWindow(season(played, length)).map(({ number }) => number);

describe("fixture window", () => {
  it("shows the last three played, the next match and the two after it", () => {
    expect(shown(11)).toEqual([9, 10, 11, 12, 13, 14]);
    expect(shown(3)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shown(31)).toEqual([29, 30, 31, 32, 33, 34]);
  });

  it("fills the card with the matches to come at the start of a season", () => {
    expect(shown(0)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shown(1)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shown(2)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("fills the card with the matches played at the end of a season", () => {
    expect(shown(32)).toEqual([29, 30, 31, 32, 33, 34]);
    expect(shown(33)).toEqual([29, 30, 31, 32, 33, 34]);
    expect(shown(SEASON_LENGTH)).toEqual([29, 30, 31, 32, 33, 34]);
  });

  it("shows every match of a season too short to fill the card", () => {
    expect(shown(2, 4)).toEqual([1, 2, 3, 4]);
    expect(shown(0, 0)).toEqual([]);
  });

  it("keeps the fixtures it is given, cup ties and their fields included", () => {
    const fixtures = season(11);
    expect(fixtureWindow(fixtures)[0]).toBe(fixtures[8]);
  });
});

describe("next fixture", () => {
  it("is the first match not played", () => {
    expect(nextFixture(season(0))?.number).toBe(1);
    expect(nextFixture(season(11))?.number).toBe(12);
  });

  it("does not exist once every match is played", () => {
    expect(nextFixture(season(SEASON_LENGTH))).toBeUndefined();
    expect(nextFixture([])).toBeUndefined();
  });
});
