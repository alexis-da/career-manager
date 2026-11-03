import { describe, expect, it } from "vitest";
import { YELLOWS_PER_SUSPENSION } from "./balance";
import { CLEAN_DISCIPLINE, disciplineAfterMatch, disciplineForNewSeason, isSuspended, type Discipline } from "./discipline";

const booked = { yellowCards: 1, redCards: 0 };
const sentOff = { yellowCards: 0, redCards: 1 };
const clean = { yellowCards: 0, redCards: 0 };

/** A player's discipline after a run of matches of one competition. */
const after = (start: Discipline, competition: "LEAGUE" | "CUP", matches: readonly (typeof booked | undefined)[]): Discipline =>
  matches.reduce((discipline, cards) => disciplineAfterMatch(discipline, competition, cards), start);

describe("discipline", () => {
  it("suspends a sent-off player for his club's next official match, league or cup, then lets him play", () => {
    const red = disciplineAfterMatch(CLEAN_DISCIPLINE, "LEAGUE", sentOff);

    expect(red).toMatchObject({ suspendedMatches: 1 });
    expect(isSuspended(red, "LEAGUE")).toBe(true);
    expect(isSuspended(red, "CUP")).toBe(true);
    // Served in the cup, the next match whatever it is: free for the league.
    const served = disciplineAfterMatch(red, "CUP", undefined);
    expect(served).toEqual(CLEAN_DISCIPLINE);
    expect(isSuspended(served, "LEAGUE")).toBe(false);
  });

  it("suspends for the next league match at the fifth league yellow, and counts again from 0", () => {
    const four = after(CLEAN_DISCIPLINE, "LEAGUE", [booked, booked, clean, booked, booked]);
    expect(four).toMatchObject({ leagueYellows: YELLOWS_PER_SUSPENSION - 1, suspendedLeagueMatches: 0 });

    const fifth = disciplineAfterMatch(four, "LEAGUE", booked);
    expect(fifth).toMatchObject({ leagueYellows: 0, suspendedLeagueMatches: 1 });
    expect(isSuspended(fifth, "LEAGUE")).toBe(true);
    // A cup match in between does not serve a league suspension.
    expect(isSuspended(fifth, "CUP")).toBe(false);
    const cup = disciplineAfterMatch(fifth, "CUP", clean);
    expect(cup).toMatchObject({ suspendedLeagueMatches: 1 });
    expect(disciplineAfterMatch(cup, "LEAGUE", undefined)).toEqual(CLEAN_DISCIPLINE);
  });

  it("counts the cup's yellows apart from the league's", () => {
    const league = after(CLEAN_DISCIPLINE, "LEAGUE", [booked, booked, booked, booked]);
    const cup = after(league, "CUP", [booked, booked, booked, booked]);

    expect(cup).toMatchObject({ leagueYellows: 4, cupYellows: 4, suspendedLeagueMatches: 0, suspendedCupMatches: 0 });
    expect(disciplineAfterMatch(cup, "CUP", booked)).toMatchObject({ leagueYellows: 4, cupYellows: 0, suspendedCupMatches: 1 });
  });

  it("does not count the yellows of a match its player is sent off in", () => {
    const four = after(CLEAN_DISCIPLINE, "LEAGUE", [booked, booked, booked, booked]);

    // Two yellows, then the red: the red's suspension, the count unchanged.
    expect(disciplineAfterMatch(four, "LEAGUE", { yellowCards: 2, redCards: 1 })).toMatchObject({
      leagueYellows: 4,
      suspendedLeagueMatches: 0,
      suspendedMatches: 1,
    });
  });

  it("lets a suspended player of the club serve without playing, and starts each season with no yellow", () => {
    const suspended: Discipline = { ...CLEAN_DISCIPLINE, leagueYellows: 3, suspendedMatches: 1 };

    expect(disciplineAfterMatch(suspended, "LEAGUE", undefined)).toEqual({ ...CLEAN_DISCIPLINE, leagueYellows: 3 });
    expect(disciplineForNewSeason({ ...suspended, cupYellows: 2 })).toEqual({ ...CLEAN_DISCIPLINE, suspendedMatches: 1 });
  });
});
