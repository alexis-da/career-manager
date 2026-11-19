import { describe, expect, it } from "vitest";
import type { CoachMatchLine, NationalTeamView } from "@/src/db/national-view";
import type { ZoneTableView } from "@/src/db/nations-view";
import { FRIENDLY, HEMISPHERES_CUP, OLD_CONTINENT_CUP, QUALIFIER_EUROPE } from "@/src/engine/tournaments";
import { lineKey, nationResult, nextStopIndex, opponentOf, sessionTournament, venueOf, zoneStanding } from "./nation";

const OCT_9 = new Date(Date.UTC(2027, 9, 9));
const OCT_13 = new Date(Date.UTC(2027, 9, 13));

function match(extra: Partial<CoachMatchLine> = {}): CoachMatchLine {
  return {
    id: "m1",
    date: OCT_9,
    competition: QUALIFIER_EUROPE,
    round: 3,
    pool: null,
    home: "POR",
    away: "NED",
    neutral: false,
    played: false,
    live: false,
    homeGoals: null,
    awayGoals: null,
    decidedBy: null,
    homePenalties: null,
    awayPenalties: null,
    byAssistant: false,
    ...extra,
  };
}

describe("a match of his nation", () => {
  it("has its opponent and its venue, whichever side his nation is on", () => {
    expect(opponentOf(match(), "POR")).toBe("NED");
    expect(opponentOf(match(), "NED")).toBe("POR");
    expect(venueOf(match(), "POR")).toBe("home");
    expect(venueOf(match(), "NED")).toBe("away");
    expect(venueOf(match({ neutral: true, competition: HEMISPHERES_CUP }), "POR")).toBe("neutral");
  });

  it("has its result once played, his nation's", () => {
    expect(nationResult(match(), "POR")).toBeNull();
    const played = match({ played: true, homeGoals: 2, awayGoals: 1 });
    expect(nationResult(played, "POR")).toBe("W");
    expect(nationResult(played, "NED")).toBe("L");
    expect(nationResult(match({ played: true, homeGoals: 1, awayGoals: 1 }), "NED")).toBe("D");
  });

  it("is won or lost on penalties after a draw", () => {
    const shootOut = match({
      competition: HEMISPHERES_CUP,
      round: 4,
      neutral: true,
      played: true,
      homeGoals: 1,
      awayGoals: 1,
      decidedBy: "PENALTIES",
      homePenalties: 3,
      awayPenalties: 5,
    });
    expect(nationResult(shootOut, "POR")).toBe("L");
    expect(nationResult(shootOut, "NED")).toBe("W");
  });

  it("has a key in a list, its row's id or its date and nations", () => {
    expect(lineKey(match())).toBe("m1");
    expect(lineKey(match({ id: null }))).toBe("2027-10-09T00:00:00.000Z-POR-NED");
  });
});

describe("his next match at stake", () => {
  it("is the first not played that his assistant does not play", () => {
    const lines = [
      match({ played: true, homeGoals: 1, awayGoals: 0 }),
      match({ competition: FRIENDLY, byAssistant: true, date: OCT_13 }),
      match({ id: "m3", date: OCT_13 }),
    ];
    expect(nextStopIndex(lines)).toBe(2);
    expect(nextStopIndex(lines.slice(0, 2))).toBe(-1);
  });
});

/** A view's session, a break's or a tournament's. */
function session(kind: "break" | "tournament", matches: CoachMatchLine[]): NonNullable<NationalTeamView["session"]> {
  return { kind, first: OCT_9, last: kind === "break" ? OCT_13 : new Date(Date.UTC(2030, 5, 25)), started: false, matches };
}

describe("the tournament of his session", () => {
  it("is none for a break", () => {
    expect(sessionTournament({ session: null, tournament: HEMISPHERES_CUP })).toBeNull();
    expect(sessionTournament({ session: session("break", [match()]), tournament: HEMISPHERES_CUP })).toBeNull();
  });

  it("is its matches' competition, in the June of its last date", () => {
    const view: Pick<NationalTeamView, "session" | "tournament"> = {
      session: session("tournament", [match({ competition: OLD_CONTINENT_CUP, neutral: true })]),
      tournament: HEMISPHERES_CUP,
    };
    expect(sessionTournament(view)).toEqual({ tournament: OLD_CONTINENT_CUP, year: 2030 });
  });

  it("is its cycle's without a match of it", () => {
    expect(sessionTournament({ session: session("tournament", []), tournament: HEMISPHERES_CUP })).toEqual({ tournament: HEMISPHERES_CUP, year: 2030 });
  });
});

describe("where his nation stands in its zone", () => {
  const zone: ZoneTableView = {
    zone: "EUROPE",
    competition: QUALIFIER_EUROPE,
    places: 5,
    rows: [
      { code: "GER", rank: 1, played: 5, won: 4, drawn: 1, lost: 0, goalsFor: 11, goalsAgainst: 2, points: 13 },
      { code: "POR", rank: 6, played: 5, won: 2, drawn: 1, lost: 2, goalsFor: 6, goalsAgainst: 6, points: 7 },
    ],
  };

  it("says its rank, its points and its matches, and whether it would qualify", () => {
    expect(zoneStanding({ code: "POR", zone })).toEqual({ rank: 6, points: 7, played: 5, qualifying: false });
    expect(zoneStanding({ code: "GER", zone })).toEqual({ rank: 1, points: 13, played: 5, qualifying: true });
  });

  it("says nothing without qualifiers, or before its first match there", () => {
    expect(zoneStanding({ code: "POR", zone: null })).toBeNull();
    expect(zoneStanding({ code: "BRA", zone })).toBeNull();
    const fresh = { ...zone, rows: zone.rows.map((row) => ({ ...row, played: 0, points: 0 })) };
    expect(zoneStanding({ code: "POR", zone: fresh })).toBeNull();
  });
});
