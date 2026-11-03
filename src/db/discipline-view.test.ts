import { describe, expect, it } from "vitest";
import { YELLOWS_PER_SUSPENSION } from "../engine/balance";
import { CLEAN_DISCIPLINE, type CompetitionKind, type Discipline } from "../engine/discipline";
import { disciplineStatus, matchesAhead, type MatchesAhead } from "./discipline-view";

const day = (date: number): Date => new Date(Date.UTC(2026, 9, date));

/** One booking from a suspension. */
const ON_THE_LIMIT = YELLOWS_PER_SUSPENSION - 1;

const player = (discipline: Partial<Discipline>): Discipline => ({ ...CLEAN_DISCIPLINE, ...discipline });

/** The club's next match in a competition, and the competitions it still plays in. */
const ahead = (next: CompetitionKind | null, competitions: CompetitionKind[] = next === null ? [] : [next]): MatchesAhead => ({
  next: next === null ? null : { date: day(24), competition: next },
  competitions,
});

const BOTH: CompetitionKind[] = ["LEAGUE", "CUP"];

describe("matchesAhead", () => {
  it("takes the soonest fixture for the next match, and lists the competitions still played, the league first", () => {
    expect(
      matchesAhead([
        { date: day(21), competition: "CUP" },
        { date: day(24), competition: "LEAGUE" },
        { date: day(28), competition: "CUP" },
      ]),
    ).toEqual({ next: { date: day(21), competition: "CUP" }, competitions: ["LEAGUE", "CUP"] });
  });

  it("has no next match, and no competition, once nothing is left to play", () => {
    expect(matchesAhead([])).toEqual({ next: null, competitions: [] });
  });

  it("drops the cup once the club is out of it", () => {
    expect(matchesAhead([{ date: day(24), competition: "LEAGUE" }]).competitions).toEqual(["LEAGUE"]);
  });
});

const NOTHING = { suspended: false, suspendedLater: null, bookingRisks: [], bookingRiskNextMatch: false };

describe("disciplineStatus", () => {
  it("has nothing to say of a clean player", () => {
    expect(disciplineStatus(CLEAN_DISCIPLINE, ahead("LEAGUE", BOTH))).toEqual(NOTHING);
  });

  it("suspends a sent-off player for the club's next match, whatever its competition", () => {
    const sentOff = player({ suspendedMatches: 1 });

    expect(disciplineStatus(sentOff, ahead("LEAGUE", BOTH)).suspended).toBe(true);
    expect(disciplineStatus(sentOff, ahead("CUP", BOTH)).suspended).toBe(true);
    expect(disciplineStatus(sentOff, ahead("CUP", BOTH)).suspendedLater).toBeNull();
  });

  it("suspends after the yellow cards of a competition for its next match only, and says it of the other one", () => {
    const league = player({ suspendedLeagueMatches: 1 });
    const cup = player({ suspendedCupMatches: 1 });

    expect(disciplineStatus(league, ahead("LEAGUE", BOTH))).toMatchObject({ suspended: true, suspendedLater: null });
    expect(disciplineStatus(league, ahead("CUP", BOTH))).toMatchObject({ suspended: false, suspendedLater: "LEAGUE" });
    expect(disciplineStatus(cup, ahead("CUP", BOTH))).toMatchObject({ suspended: true, suspendedLater: null });
    expect(disciplineStatus(cup, ahead("LEAGUE", BOTH))).toMatchObject({ suspended: false, suspendedLater: "CUP" });
  });

  it("keeps quiet of a suspension in a competition the club no longer plays this season", () => {
    // Out of the cup: his ban waits for next season's first tie.
    expect(disciplineStatus(player({ suspendedCupMatches: 1 }), ahead("LEAGUE"))).toEqual(NOTHING);
    // The league over, the cup final to play: the league ban waits for next season.
    expect(disciplineStatus(player({ suspendedLeagueMatches: 1 }), ahead("CUP")).suspendedLater).toBeNull();
  });

  it("is never suspended without a next match: the season is over", () => {
    const banned = player({ suspendedMatches: 1, suspendedLeagueMatches: 1, suspendedCupMatches: 1, leagueYellows: ON_THE_LIMIT });

    expect(disciplineStatus(banned, ahead(null))).toEqual(NOTHING);
  });

  it("warns one booking from a suspension, in each competition the club still plays, the league first", () => {
    expect(disciplineStatus(player({ leagueYellows: ON_THE_LIMIT }), ahead("LEAGUE", BOTH))).toEqual({
      ...NOTHING,
      bookingRisks: [{ competition: "LEAGUE", yellows: ON_THE_LIMIT }],
      bookingRiskNextMatch: true,
    });
    expect(disciplineStatus(player({ leagueYellows: ON_THE_LIMIT - 1 }), ahead("LEAGUE", BOTH))).toEqual(NOTHING);
    expect(disciplineStatus(player({ leagueYellows: ON_THE_LIMIT, cupYellows: ON_THE_LIMIT }), ahead("CUP", BOTH))).toEqual({
      ...NOTHING,
      bookingRisks: [
        { competition: "LEAGUE", yellows: ON_THE_LIMIT },
        { competition: "CUP", yellows: ON_THE_LIMIT },
      ],
      bookingRiskNextMatch: true,
    });
    // Out of the cup, his cup yellows are no risk: they start from 0 again next season.
    expect(disciplineStatus(player({ cupYellows: ON_THE_LIMIT }), ahead("LEAGUE"))).toEqual(NOTHING);
  });

  it("tells a risk in the next match from one in the other competition", () => {
    // His cup yellows say nothing of a league match: a booking there would not suspend him.
    expect(disciplineStatus(player({ cupYellows: ON_THE_LIMIT }), ahead("LEAGUE", BOTH))).toEqual({
      ...NOTHING,
      bookingRisks: [{ competition: "CUP", yellows: ON_THE_LIMIT }],
      bookingRiskNextMatch: false,
    });
    expect(disciplineStatus(player({ leagueYellows: ON_THE_LIMIT }), ahead("CUP", BOTH)).bookingRiskNextMatch).toBe(false);
  });

  it("keeps the yellow cards of a suspended player: sent off, his yellows of the match did not count", () => {
    expect(disciplineStatus(player({ suspendedMatches: 1, leagueYellows: ON_THE_LIMIT }), ahead("LEAGUE"))).toEqual({
      suspended: true,
      suspendedLater: null,
      bookingRisks: [{ competition: "LEAGUE", yellows: ON_THE_LIMIT }],
      bookingRiskNextMatch: true,
    });
  });
});
