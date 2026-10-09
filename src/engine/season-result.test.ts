import { describe, expect, it } from "vitest";
import { BEST_PLAYER_MIN_APPEARANCES, SEASON_RATING_BASE, SEASON_RATING_MAX, SEASON_RATING_MIN } from "./balance";
import { buildSeasonResult, CHAMPION_TROPHY, clubAtDate, seasonRating, type SeasonPlayerLine } from "./season-result";
import type { StandingRow } from "./standings";

function line(playerKey: string, overrides: Partial<SeasonPlayerLine> = {}): SeasonPlayerLine {
  return {
    playerKey,
    name: `Joueur ${playerKey}`,
    position: "CM",
    appearances: 30,
    minutes: 30 * 90,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ...overrides,
  };
}

function standing(rank: number): StandingRow {
  return {
    rank,
    club: "club",
    played: 38,
    won: 24,
    drawn: 8,
    lost: 6,
    goalsFor: 70,
    goalsAgainst: 35,
    goalDifference: 35,
    points: 80,
  };
}

describe("seasonRating", () => {
  it("rewards goals, assists and full matches, and takes cards off", () => {
    const regular = seasonRating(line("a"));
    expect(seasonRating(line("a", { goals: 15 }))).toBeGreaterThan(regular);
    expect(seasonRating(line("a", { assists: 10 }))).toBeGreaterThan(regular);
    expect(seasonRating(line("a", { minutes: 30 * 20 }))).toBeLessThan(regular);
    expect(seasonRating(line("a", { yellowCards: 20 }))).toBeLessThan(regular);
    expect(seasonRating(line("a", { redCards: 2 }))).toBeLessThan(regular);
  });

  it("stays within its bounds, with one decimal", () => {
    const high = seasonRating(line("a", { appearances: 10, minutes: 900, goals: 60, assists: 40 }));
    const low = seasonRating(line("a", { appearances: 10, minutes: 10, redCards: 10, yellowCards: 10 }));
    expect(high).toBe(SEASON_RATING_MAX);
    expect(low).toBeGreaterThanOrEqual(SEASON_RATING_MIN);
    expect(low).toBeLessThan(SEASON_RATING_BASE);
    const rating = seasonRating(line("a", { goals: 7, assists: 3 }));
    expect(Math.round(rating * 10) / 10).toBe(rating);
    expect(seasonRating(line("a", { appearances: 0, minutes: 0 }))).toBe(SEASON_RATING_BASE);
  });
});

describe("buildSeasonResult", () => {
  it("names the best rated player as best player", () => {
    const result = buildSeasonResult(
      standing(3),
      [line("defender"), line("striker", { position: "ST", goals: 18, assists: 4 }), line("winger", { goals: 6, assists: 9 })],
      { formation: "4-3-3" },
    );
    expect(result.bestPlayer).toEqual({
      playerKey: "striker",
      name: "Joueur striker",
      position: "ST",
      goals: 18,
      assists: 4,
      rating: seasonRating(line("striker", { goals: 18, assists: 4 })),
    });
    expect(result).toMatchObject({ rank: 3, points: 80, played: 38, won: 24, drawn: 8, lost: 6, goalsFor: 70, goalsAgainst: 35 });
    expect(result.formation).toBe("4-3-3");
  });

  it(`ignores players with fewer than ${BEST_PLAYER_MIN_APPEARANCES} matches`, () => {
    const short = line("short", { appearances: BEST_PLAYER_MIN_APPEARANCES - 1, minutes: 800, goals: 12 });
    const enough = line("enough", { appearances: BEST_PLAYER_MIN_APPEARANCES, minutes: 900, goals: 2 });
    expect(seasonRating(short)).toBeGreaterThan(seasonRating(enough));
    expect(buildSeasonResult(standing(5), [short, enough], { formation: "4-4-2" }).bestPlayer?.playerKey).toBe("enough");
    expect(buildSeasonResult(standing(5), [short], { formation: "4-4-2" }).bestPlayer).toBeNull();
  });

  it("breaks a tie on the rating with goals + assists, then playerKey", () => {
    // One more assist (+0.027) and five more yellow cards (-0.025) over 30 matches: the same rating once rounded.
    const fewer = line("a-fewer", { goals: 5 });
    const more = line("b-more", { goals: 5, assists: 1, yellowCards: 5 });
    expect(seasonRating(fewer)).toBe(seasonRating(more));
    expect(buildSeasonResult(standing(2), [fewer, more], { formation: "4-3-3" }).bestPlayer?.playerKey).toBe("b-more");

    const twinA = line("twin-a", { goals: 4 });
    const twinB = line("twin-b", { goals: 4 });
    expect(buildSeasonResult(standing(2), [twinB, twinA], { formation: "4-3-3" }).bestPlayer?.playerKey).toBe("twin-a");
  });

  it("gives the champion trophy to the first only", () => {
    expect(buildSeasonResult(standing(1), [], { formation: "4-3-3" }).trophies).toEqual([CHAMPION_TROPHY]);
    expect(buildSeasonResult(standing(2), [], { formation: "4-3-3" }).trophies).toEqual([]);
  });
});

describe("clubAtDate", () => {
  const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

  it("is the current club without a later move", () => {
    expect(clubAtDate("lyon", [])).toBe("lyon");
    expect(clubAtDate(null, [])).toBeNull();
  });

  it("is the origin of the first later move", () => {
    const moves = [
      { date: day("2027-08-20"), fromClubId: "lens", toClubId: "nice" },
      { date: day("2027-07-10"), fromClubId: "lyon", toClubId: "lens" },
    ];
    expect(clubAtDate("nice", moves)).toBe("lyon");
  });

  it("follows the chain of moves of the same day", () => {
    // Released by Lyon, then signed by Nice in the preseason, both on 1 July, in either order.
    const released = { date: day("2027-07-01"), fromClubId: "lyon", toClubId: null };
    const signed = { date: day("2027-07-01"), fromClubId: null, toClubId: "nice" };
    expect(clubAtDate("nice", [signed, released])).toBe("lyon");
    expect(clubAtDate("nice", [released, signed])).toBe("lyon");
  });
});
