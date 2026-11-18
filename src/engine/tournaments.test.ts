import { describe, expect, it } from "vitest";
import { internationalMatchRngSeed, internationalSession } from "./international";
import type { SquadPlayer } from "./lineup";
import { NATION_CODES, type NationCode } from "./nations";
import { squadTemplate } from "./positions";
import { breakWindows } from "./schedule";
import {
  cycleDate,
  cycleOf,
  cycleQualifiers,
  drawTournament,
  FINAL_ROUND,
  FRIENDLY,
  friendlyHistory,
  groupFixtures,
  HEMISPHERES_CUP,
  internationalTable,
  OLD_CONTINENT_CUP,
  pairFriendlies,
  parseTitleKey,
  playTournament,
  QUALIFIER_EUROPE,
  QUALIFIER_WORLD,
  recordMeeting,
  seasonInternationalMatches,
  SEMI_FINAL_ROUND,
  titleKey,
  tournamentDates,
  tournamentEnding,
  zoneNations,
  type InternationalTableRow,
} from "./tournaments";

const iso = (date: Date): string => date.toISOString().slice(0, 10);
const pairOf = (a: string, b: string): string => [a, b].sort().join("-");
const NO_STRENGTH = new Map<NationCode, number>();

describe("cycleOf", () => {
  it("runs two seasons of qualifiers, then a tournament in June: the Old Continent Cup first, the Hemispheres Cup next", () => {
    expect(cycleOf(null, 2026)).toBeNull();
    expect(cycleOf(2027, 2026)).toBeNull();
    expect(cycleOf(2026, 2026)).toEqual({ index: 0, startYear: 2026, season: 0, tournament: OLD_CONTINENT_CUP, tournamentYear: 2028 });
    expect(cycleOf(2026, 2027)).toEqual({ index: 0, startYear: 2026, season: 1, tournament: OLD_CONTINENT_CUP, tournamentYear: 2028 });
    expect(cycleOf(2026, 2028)).toEqual({ index: 1, startYear: 2028, season: 0, tournament: HEMISPHERES_CUP, tournamentYear: 2030 });
    expect(cycleOf(2026, 2031)).toMatchObject({ tournament: OLD_CONTINENT_CUP, tournamentYear: 2032, season: 1 });
    // A save whose qualifiers start in 2027-28: June 2029, then 2031.
    expect(cycleOf(2027, 2028)).toMatchObject({ tournament: OLD_CONTINENT_CUP, tournamentYear: 2029 });
    expect(cycleOf(2027, 2029)).toMatchObject({ tournament: HEMISPHERES_CUP, tournamentYear: 2031 });
  });

  it("names the tournament a season ends with: only the second of its cycle", () => {
    expect(tournamentEnding(2026, 2026)).toBeNull();
    expect(tournamentEnding(2026, 2027)).toMatchObject({ tournament: OLD_CONTINENT_CUP, tournamentYear: 2028 });
    expect(tournamentEnding(2026, 2029)).toMatchObject({ tournament: HEMISPHERES_CUP, tournamentYear: 2030 });
    expect(tournamentEnding(null, 2027)).toBeNull();
  });
});

describe("cycleQualifiers", () => {
  const europe = zoneNations("EUROPE");
  const world = zoneNations("WORLD");

  it("plays Europe's nine in one group of single matches: each pair once, four at home each, one nation resting a matchday", () => {
    const matches = cycleQualifiers("seed-a", { startYear: 2026, tournament: OLD_CONTINENT_CUP });
    expect(matches.every((match) => match.competition === QUALIFIER_EUROPE)).toBe(true);
    expect(matches).toHaveLength(36);
    expect(new Set(matches.map((match) => pairOf(match.home, match.away))).size).toBe(36);
    for (const code of europe) {
      expect(matches.filter((match) => match.home === code)).toHaveLength(4);
      expect(matches.filter((match) => match.away === code)).toHaveLength(4);
    }
    for (let round = 1; round <= 9; round++) {
      const ofRound = matches.filter((match) => match.round === round);
      expect(ofRound).toHaveLength(4);
      expect(new Set(ofRound.flatMap((match) => [match.home, match.away])).size).toBe(8);
    }
    // One matchday a break, on the Friday; the 9th on the Tuesday of the cycle's last break.
    expect([...new Set(matches.map((match) => `${match.round}:${match.cycleDate}`))].sort()).toEqual(
      ["1:0", "2:2", "3:4", "4:6", "5:8", "6:10", "7:12", "8:14", "9:15"].sort(),
    );
  });

  it("adds, in a Hemispheres cycle, the World zone's five in home and away matches over ten matchdays", () => {
    const matches = cycleQualifiers("seed-a", { startYear: 2028, tournament: HEMISPHERES_CUP });
    const ofWorld = matches.filter((match) => match.competition === QUALIFIER_WORLD);
    expect(matches.filter((match) => match.competition === QUALIFIER_EUROPE)).toHaveLength(36);
    expect(ofWorld).toHaveLength(20);
    for (const code of world) {
      expect(ofWorld.filter((match) => match.home === code)).toHaveLength(4);
      expect(ofWorld.filter((match) => match.away === code)).toHaveLength(4);
    }
    const legs = new Map<string, string[]>();
    for (const match of ofWorld) {
      legs.set(pairOf(match.home, match.away), [...(legs.get(pairOf(match.home, match.away)) ?? []), match.home]);
    }
    expect([...legs.values()].every((hosts) => hosts.length === 2 && hosts[0] !== hosts[1])).toBe(true);
    expect([...new Set(ofWorld.map((match) => match.cycleDate))]).toEqual([0, 2, 4, 6, 8, 10, 12, 13, 14, 15]);
  });

  it("draws each zone's order once a cycle, the same for the same save", () => {
    const cycle = { startYear: 2026, tournament: OLD_CONTINENT_CUP } as const;
    expect(cycleQualifiers("seed-a", cycle)).toEqual(cycleQualifiers("seed-a", cycle));
    expect(cycleQualifiers("seed-b", cycle)).not.toEqual(cycleQualifiers("seed-a", cycle));
  });

  it("dates a cycle's sixteen international dates at its two seasons' breaks", () => {
    expect(iso(cycleDate(2026, 0))).toBe("2026-09-04");
    expect(iso(cycleDate(2026, 1))).toBe("2026-09-08");
    expect(cycleDate(2026, 15).getTime()).toBe(breakWindows(2027)[3].dates[1].getTime());
  });
});

describe("pairFriendlies", () => {
  it("pairs the nations that have not met for the longest first, then the closest strengths, every nation once", () => {
    const history = friendlyHistory([]);
    recordMeeting(history, { home: "FRA", away: "GER" }, new Date(Date.UTC(2026, 8, 4)), false);
    const strengths = new Map<NationCode, number>([
      ["FRA", 2000],
      ["GER", 2010],
      ["ITA", 1990],
      ["SEN", 1500],
    ]);
    const pairs = pairFriendlies(["FRA", "GER", "ITA", "SEN"], history, strengths);
    // France and Germany met: France and Italy are the closest of the pairs that never did, Germany and Senegal what is left.
    expect(pairs.map((pair) => pairOf(pair.home, pair.away)).sort()).toEqual(["FRA-ITA", "GER-SEN"]);
    expect(() => pairFriendlies(["FRA", "GER", "ITA"], history, strengths)).toThrow();
  });

  it("puts at home the one that has been at home the least, then the one that was away when they last met", () => {
    const history = friendlyHistory([{ home: "BRA", away: "ARG", date: new Date(Date.UTC(2026, 8, 4)), neutral: false }]);
    expect(pairFriendlies(["ARG", "BRA"], history, NO_STRENGTH)).toEqual([{ home: "ARG", away: "BRA" }]);
    recordMeeting(history, { home: "ARG", away: "MAR" }, new Date(Date.UTC(2026, 8, 8)), false);
    recordMeeting(history, { home: "BRA", away: "MAR" }, new Date(Date.UTC(2026, 9, 9)), false);
    // Both twice at home now: the one that was away at their last meeting, Argentina.
    expect(pairFriendlies(["ARG", "BRA"], history, NO_STRENGTH)).toEqual([{ home: "ARG", away: "BRA" }]);
  });
});

describe("seasonInternationalMatches", () => {
  const plan = (startYear: number, cyclesFrom: number) =>
    seasonInternationalMatches({ saveSeed: "seed-a", startYear, cycle: cycleOf(cyclesFrom, startYear), history: friendlyHistory([]), strengths: NO_STRENGTH });

  it.each([
    [2026, 2026],
    [2027, 2026],
    [2028, 2026],
    [2029, 2026],
  ])("gives each of the season %i's eight dates seven matches, every nation once (cycles from %i)", (startYear, cyclesFrom) => {
    const matches = plan(startYear, cyclesFrom);
    expect(matches).toHaveLength(56);
    const dates = breakWindows(startYear).flatMap((window) => window.dates);
    for (const date of dates) {
      const ofDate = matches.filter((match) => match.date.getTime() === date.getTime());
      expect(ofDate).toHaveLength(7);
      expect(new Set(ofDate.flatMap((match) => [match.home, match.away]))).toEqual(new Set(NATION_CODES));
    }
  });

  it("plays the first season of an Old Continent cycle four of Europe's matchdays, the second five, friendlies around them", () => {
    const first = plan(2026, 2026);
    const second = plan(2027, 2026);
    const rounds = (matches: typeof first, competition: string) => [...new Set(matches.filter((match) => match.competition === competition).map((match) => match.round))];
    expect(rounds(first, QUALIFIER_EUROPE)).toEqual([1, 2, 3, 4]);
    expect(rounds(second, QUALIFIER_EUROPE)).toEqual([5, 6, 7, 8, 9]);
    expect(rounds(first, QUALIFIER_WORLD)).toEqual([]);
    expect(first.filter((match) => match.competition === FRIENDLY)).toHaveLength(56 - 16);
    // The World zone's five never meet in qualifiers then: friendlies only, and every Friday one of them meets Europe's rest.
    expect(second.filter((match) => match.competition === QUALIFIER_EUROPE)).toHaveLength(20);
  });

  it("plays both zones' qualifiers in a Hemispheres cycle, the World zone's last two matchdays at the second season's last breaks", () => {
    const second = plan(2029, 2026);
    const world = second.filter((match) => match.competition === QUALIFIER_WORLD);
    expect([...new Set(world.map((match) => match.round))]).toEqual([5, 6, 7, 8, 9, 10]);
    expect(world).toHaveLength(12);
    const windows = breakWindows(2029);
    expect(world.filter((match) => match.round === 8).every((match) => match.date.getTime() === windows[2].dates[1].getTime())).toBe(true);
    expect(world.filter((match) => match.round === 10).every((match) => match.date.getTime() === windows[3].dates[1].getTime())).toBe(true);
  });

  it("is the same season for the same save and history", () => {
    expect(plan(2027, 2026)).toEqual(plan(2027, 2026));
  });
});

describe("internationalTable", () => {
  it("ranks by points, goal difference, goals scored, strength at the cycle's opening, then code", () => {
    const table = internationalTable(
      ["FRA", "GER", "ITA", "ESP"],
      [
        { home: "FRA", away: "GER", homeGoals: 2, awayGoals: 0 },
        { home: "ITA", away: "ESP", homeGoals: 2, awayGoals: 0 },
        { home: "GER", away: "ESP", homeGoals: 1, awayGoals: 1 },
      ],
      new Map<NationCode, number>([
        ["FRA", 1000],
        ["ITA", 2000],
      ]),
    );
    expect(table.map((row) => row.code)).toEqual(["ITA", "FRA", "ESP", "GER"]);
    expect(table[0]).toMatchObject({ rank: 1, played: 1, won: 1, points: 3, goalsFor: 2, goalsAgainst: 0 });
    expect(table[2]).toMatchObject({ code: "ESP", played: 2, drawn: 1, lost: 1, points: 1 });
  });
});

const row = (code: NationCode, points: number, played = 8): InternationalTableRow => ({
  code,
  rank: 0,
  played,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 10,
  goalsAgainst: 5,
  points,
});

describe("drawTournament", () => {
  const europe = (["GER", "FRA", "ESP", "ITA", "ENG", "POR", "NED", "BEL", "CRO"] as const).map((code, index) => row(code, 20 - index));
  const world = (["BRA", "ARG", "MAR", "SEN", "CIV"] as const).map((code, index) => row(code, 18 - 2 * index));

  it("draws the Old Continent Cup's six by pots of two from Europe's table: 1st and 2nd, 3rd and 4th, 5th and 6th apart", () => {
    const groups = drawTournament({ tournament: OLD_CONTINENT_CUP, europe, world: [], strengths: NO_STRENGTH, saveSeed: "seed-a", year: 2028 });
    expect(groups.map((group) => group.length)).toEqual([3, 3]);
    for (const pot of [
      ["GER", "FRA"],
      ["ESP", "ITA"],
      ["ENG", "POR"],
    ]) {
      expect(groups.map((group) => group.filter((code) => pot.includes(code)).length)).toEqual([1, 1]);
    }
    expect(groups.flat()).not.toContain("NED");
    expect(drawTournament({ tournament: OLD_CONTINENT_CUP, europe, world: [], strengths: NO_STRENGTH, saveSeed: "seed-a", year: 2028 })).toEqual(groups);
  });

  it("draws the Hemispheres Cup's eight: Europe's five and the World zone's three, the two zones' winners apart", () => {
    const groups = drawTournament({ tournament: HEMISPHERES_CUP, europe, world, strengths: NO_STRENGTH, saveSeed: "seed-a", year: 2030 });
    expect(groups.map((group) => group.length)).toEqual([4, 4]);
    expect(groups.flat().sort()).toEqual(["ARG", "BRA", "ENG", "ESP", "FRA", "GER", "ITA", "MAR"].sort());
    expect(groups.map((group) => group[0]).sort()).toEqual(["BRA", "GER"]);
  });
});

describe("groupFixtures", () => {
  it("meets each pair of a group once, over three matchdays", () => {
    const fixtures = groupFixtures([
      ["GER", "FRA", "ESP"],
      ["ITA", "ENG", "POR", "NED"],
    ]);
    const three = fixtures.filter((fixture) => fixture.pool === 0);
    const four = fixtures.filter((fixture) => fixture.pool === 1);
    expect(three).toHaveLength(3);
    expect(four).toHaveLength(6);
    expect(new Set(three.map((fixture) => pairOf(fixture.home, fixture.away))).size).toBe(3);
    expect(new Set(four.map((fixture) => pairOf(fixture.home, fixture.away))).size).toBe(6);
    expect(three.map((fixture) => fixture.round)).toEqual([1, 2, 3]);
    for (const round of [1, 2, 3]) {
      expect(four.filter((fixture) => fixture.round === round)).toHaveLength(2);
    }
  });
});

describe("tournamentDates", () => {
  it("plays five dates four days apart from the Friday after the week of the European finals, all in June", () => {
    expect(tournamentDates(2028).map(iso)).toEqual(["2028-06-09", "2028-06-13", "2028-06-17", "2028-06-21", "2028-06-25"]);
    for (const year of [2029, 2030, 2031, 2032, 2034]) {
      const dates = tournamentDates(year);
      expect(dates.map((date) => date.getUTCDay())).toEqual([5, 2, 6, 3, 0]);
      expect(dates.every((date) => date.getUTCMonth() === 5)).toBe(true);
    }
  });
});

describe("playTournament", () => {
  /** A nation's 23 of the template, every player rated `level`, rested. */
  const squad = (code: string, level: number): SquadPlayer[] =>
    squadTemplate(23).map((position, index) => ({
      id: `${code}#${index + 1}`,
      position,
      overall: level,
      injured: false,
      pace: level,
      shooting: level,
      passing: level,
      dribbling: level,
      defending: level,
      physical: level,
      goalkeeping: position === "GK" ? level : 20,
      form: 50,
      morale: 50,
      fitness: 100,
    }));

  it.each([
    [
      OLD_CONTINENT_CUP,
      [
        ["GER", "ESP", "ENG"],
        ["FRA", "ITA", "POR"],
      ],
      9,
    ],
    [
      HEMISPHERES_CUP,
      [
        ["GER", "ARG", "ITA", "MAR"],
        ["BRA", "FRA", "ESP", "ENG"],
      ],
      15,
    ],
  ] as const)("plays the %s: its groups, the semi-finals 1st against 2nd, then the final, a winner every time", (_, groups, count) => {
    const dates = tournamentDates(2028);
    const called = new Map(groups.flat().map((code, index) => [code, squad(code, 82 - index)] as const));
    const played = playTournament({
      session: internationalSession(called, dates[0]),
      groups,
      dates,
      strengths: NO_STRENGTH,
      seedOf: (date, home, away) => internationalMatchRngSeed("seed-a", date, home, away),
    });
    expect(played.matches).toHaveLength(count);
    const semis = played.matches.filter((match) => match.round === SEMI_FINAL_ROUND);
    const [final] = played.matches.filter((match) => match.round === FINAL_ROUND);
    expect(semis.map((match) => [match.home, match.away])).toEqual([
      [played.tables[0][0].code, played.tables[1][1].code],
      [played.tables[1][0].code, played.tables[0][1].code],
    ]);
    expect([final.home, final.away]).toEqual(semis.map((match) => (match.match.winner === "home" ? match.home : match.away)));
    expect(played.winner).toBe(final.match.winner === "home" ? final.home : final.away);
    expect(played.matches.filter((match) => match.round <= 3).every((match) => match.match.winner === null && match.pool !== null)).toBe(true);
    expect(played.matches.every((match) => match.date.getTime() === dates[match.round - 1].getTime())).toBe(true);
  });
});

describe("titleKey", () => {
  it("keeps a title as its tournament and year, and reads it back", () => {
    expect(titleKey(OLD_CONTINENT_CUP, 2028)).toBe("int.eu:2028");
    expect(parseTitleKey("int.world:2030")).toEqual({ tournament: HEMISPHERES_CUP, year: 2030 });
    expect(parseTitleKey("int.friendly:2030")).toBeNull();
  });
});
