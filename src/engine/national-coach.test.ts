import { describe, expect, it } from "vitest";
import { internationalMatchRngSeed, internationalSession, lightMatchOf, runBreak, type LightMatch } from "./international";
import type { SquadPlayer } from "./lineup";
import { simulateMatch } from "./match";
import {
  aimsAt,
  COACH_STAGES,
  exceededStage,
  federationObjective,
  managerPrestige,
  MAX_OFFERS,
  nationalOffers,
  objectiveVerdict,
  offerThreshold,
  qualifiesFrom,
  stageReached,
  strengthRanks,
} from "./national-coach";
import { NATION_CODES, type NationCode } from "./nations";
import { squadTemplate } from "./positions";
import { chooseFormation } from "./formation-choice";
import {
  FINAL_ROUND,
  HEMISPHERES_CUP,
  nextTournamentMatch,
  OLD_CONTINENT_CUP,
  playTournament,
  runTournament,
  SEMI_FINAL_ROUND,
  tournamentDates,
  type InternationalTableRow,
} from "./tournaments";

/** Strengths in the order of NATION_CODES, the first the strongest. */
const ORDERED = new Map<NationCode, number>(NATION_CODES.map((code, index) => [code, 2000 - index * 100]));

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

describe("managerPrestige", () => {
  it("adds to his club's reputation 5 a trophy of his last two seasons, 3 a second division's title or promotion, 10 at most, and 5 a tournament exceeded", () => {
    const none = { tier: 1, champion: false, cup: false, europe: false, promoted: false };
    expect(managerPrestige({ reputation: 72, seasons: [], exceededTournaments: 0 })).toBe(72);
    expect(managerPrestige({ reputation: 72, seasons: [{ ...none, cup: true }], exceededTournaments: 0 })).toBe(77);
    // A double then a title: 15, capped at 10.
    expect(managerPrestige({ reputation: 80, seasons: [{ ...none, champion: true, cup: true }, { ...none, champion: true }], exceededTournaments: 0 })).toBe(90);
    // A second division's title is a promotion: 3, once.
    expect(managerPrestige({ reputation: 55, seasons: [{ ...none, tier: 2, champion: true, promoted: true }], exceededTournaments: 0 })).toBe(58);
    // Only the last two seasons count.
    expect(managerPrestige({ reputation: 60, seasons: [none, none, { ...none, cup: true }], exceededTournaments: 0 })).toBe(60);
    expect(managerPrestige({ reputation: 70, seasons: [], exceededTournaments: 2 })).toBe(80);
  });
});

describe("offers", () => {
  it("asks 85 of prestige for the five strongest nations, 75 for the next five, 65 for the last four", () => {
    expect([1, 5, 6, 10, 11, 14].map(offerThreshold)).toEqual([85, 85, 75, 75, 65, 65]);
  });

  it("ranks the nations by strength, then by code", () => {
    const ranks = strengthRanks(new Map([["FRA", 10], ["GER", 10], ["BRA", 30]]));
    expect(ranks.get("BRA")).toBe(1);
    expect(ranks.get("FRA")).toBe(2);
    expect(ranks.get("GER")).toBe(3);
  });

  it("draws at most two federations among those his prestige reaches, the one he has just left aside, the same for the same save", () => {
    const input = { prestige: 76, strengths: ORDERED, excluded: new Set<NationCode>(["NED"]), saveSeed: "seed-a", startYear: 2027 };
    const offers = nationalOffers(input);
    expect(offers.length).toBe(MAX_OFFERS);
    const ranks = strengthRanks(ORDERED);
    for (const code of offers) {
      expect(ranks.get(code)).toBeGreaterThan(5);
      expect(code).not.toBe("NED");
    }
    expect(nationalOffers(input)).toEqual(offers);
    // A second division's club: none.
    expect(nationalOffers({ ...input, prestige: 58 })).toEqual([]);
    // Before the first cycle, every strength unknown: none.
    expect(nationalOffers({ ...input, prestige: 99, strengths: new Map() })).toEqual([]);
  });
});

describe("federationObjective", () => {
  it("sets the final to the first third of the nations aiming at the tournament, the semi-finals to the second, the qualification to the last", () => {
    // Europe's nine in an Old Continent cycle, by their order in NATION_CODES.
    expect(federationObjective("GER", OLD_CONTINENT_CUP, ORDERED)).toBe(COACH_STAGES.FINAL);
    expect(federationObjective("FRA", OLD_CONTINENT_CUP, ORDERED)).toBe(COACH_STAGES.SEMI_FINAL);
    expect(federationObjective("CRO", OLD_CONTINENT_CUP, ORDERED)).toBe(COACH_STAGES.QUALIFIED);
    // A World nation has none in an Old Continent cycle, and all 14 aim at the Hemispheres Cup.
    expect(aimsAt("BRA", OLD_CONTINENT_CUP)).toBe(false);
    expect(federationObjective("BRA", OLD_CONTINENT_CUP, ORDERED)).toBeNull();
    expect(federationObjective("GER", HEMISPHERES_CUP, ORDERED)).toBe(COACH_STAGES.FINAL);
    expect(federationObjective("NED", HEMISPHERES_CUP, ORDERED)).toBe(COACH_STAGES.SEMI_FINAL);
    expect(federationObjective("CIV", HEMISPHERES_CUP, ORDERED)).toBe(COACH_STAGES.QUALIFIED);
  });

  it("judges a tournament against it: past it, reached, or below it", () => {
    expect(exceededStage(COACH_STAGES.SEMI_FINAL)).toBe(COACH_STAGES.FINAL);
    expect(objectiveVerdict(COACH_STAGES.SEMI_FINAL, COACH_STAGES.FINAL)).toBe("EXCEEDED");
    expect(objectiveVerdict(COACH_STAGES.SEMI_FINAL, COACH_STAGES.SEMI_FINAL)).toBe("ACHIEVED");
    expect(objectiveVerdict(COACH_STAGES.SEMI_FINAL, COACH_STAGES.QUALIFIED)).toBe("MISSED");
    expect(objectiveVerdict(COACH_STAGES.FINAL, COACH_STAGES.WINNER)).toBe("EXCEEDED");
    expect(objectiveVerdict(COACH_STAGES.QUALIFIED, COACH_STAGES.NOT_QUALIFIED)).toBe("MISSED");
  });

  it("reads the stage reached from a tournament's matches, and the qualification from a zone's table", () => {
    const matches = [
      { round: 1, home: "GER" as const, away: "ESP" as const, winner: null },
      { round: SEMI_FINAL_ROUND, home: "GER" as const, away: "FRA" as const, winner: "GER" as const },
      { round: SEMI_FINAL_ROUND, home: "ITA" as const, away: "ESP" as const, winner: "ESP" as const },
      { round: FINAL_ROUND, home: "GER" as const, away: "ESP" as const, winner: "ESP" as const },
    ];
    expect(stageReached("ESP", matches, SEMI_FINAL_ROUND, FINAL_ROUND)).toBe(COACH_STAGES.WINNER);
    expect(stageReached("GER", matches, SEMI_FINAL_ROUND, FINAL_ROUND)).toBe(COACH_STAGES.FINAL);
    expect(stageReached("FRA", matches, SEMI_FINAL_ROUND, FINAL_ROUND)).toBe(COACH_STAGES.SEMI_FINAL);
    expect(stageReached("POR", matches, SEMI_FINAL_ROUND, FINAL_ROUND)).toBe(COACH_STAGES.NOT_QUALIFIED);
    const row = (code: NationCode, rank: number): InternationalTableRow => ({ code, rank, played: 8, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 });
    const table = ["GER", "ESP", "FRA", "ITA", "POR", "NED", "BEL", "CRO", "ENG"].map((code, index) => row(code as NationCode, index + 1));
    expect(qualifiesFrom("NED", OLD_CONTINENT_CUP, table)).toBe(true);
    expect(qualifiesFrom("NED", HEMISPHERES_CUP, table)).toBe(false);
  });
});

describe("a session played in steps (N4)", () => {
  const codes = ["GER", "ESP", "FRA", "ITA"] as const;
  const called = () => new Map(codes.map((code, index) => [code, squad(code, 80 - index)] as const));
  const first = new Date("2026-09-04T00:00:00.000Z");
  const second = new Date("2026-09-08T00:00:00.000Z");
  const fixtures = [
    { date: first, home: "GER", away: "ESP", neutral: false },
    { date: first, home: "FRA", away: "ITA", neutral: false },
    { date: second, home: "ESP", away: "FRA", neutral: false },
    { date: second, home: "ITA", away: "GER", neutral: false },
  ];
  const seedOf = (fixture: { date: Date; home: string; away: string }) => internationalMatchRngSeed("seed-a", fixture.date, fixture.home, fixture.away);
  /** France's matches by the full engine, its assistant deciding, as the national coach's step plays them. */
  const fullEngine = (session: ReturnType<typeof internationalSession<SquadPlayer>>, fixture: (typeof fixtures)[number]): LightMatch => {
    const teams = [fixture.home, fixture.away].map((code) => chooseFormation(session.teamOn(code, fixture.date).players, 1));
    const kickOff = new Map([fixture.home, fixture.away].flatMap((code) => session.teamOn(code, fixture.date).players.map((player) => [player.id, player.fitness] as const)));
    const result = simulateMatch(teams[0].lineup, teams[1].lineup, seedOf(fixture), { home: teams[0].formation, away: teams[1].formation });
    return lightMatchOf(result, kickOff);
  };

  it("stops before the date of a match at stake, then plays it again the same way once recorded, the other nations' matches unchanged", () => {
    const own = (fixture: (typeof fixtures)[number]) => fixture.home === "FRA" || fixture.away === "FRA";
    // First step: stops before the Friday (France plays then).
    const before = runBreak({ session: internationalSession(called(), first), fixtures, seedOf, openDate: (date) => !date.some(own), playOf: () => ({ kind: "light" }) });
    expect(before.played).toHaveLength(0);
    expect(before.stoppedBefore).toEqual(first);
    // Second step: the Friday played, France's by the full engine, then a stop before the Tuesday.
    const session = internationalSession(called(), first);
    const recorded = new Map<string, LightMatch>();
    const friday = runBreak({
      session,
      fixtures,
      seedOf,
      openDate: (date) => date[0].date.getTime() === first.getTime(),
      playOf: (fixture) => {
        if (!own(fixture)) {
          return { kind: "light" };
        }
        const match = fullEngine(session, fixture);
        recorded.set(seedOf(fixture), match);
        return { kind: "recorded", match };
      },
    });
    expect(friday.played.map(({ fixture }) => `${fixture.home}-${fixture.away}`)).toEqual(["GER-ESP", "FRA-ITA"]);
    expect(friday.stoppedBefore).toEqual(second);
    // Replayed from the start with France's match recorded: the same Friday, then the Tuesday.
    const again = internationalSession(called(), first);
    const whole = runBreak({
      session: again,
      fixtures,
      seedOf,
      openDate: () => true,
      playOf: (fixture) => {
        const match = recorded.get(seedOf(fixture));
        return match !== undefined ? { kind: "recorded", match } : own(fixture) ? { kind: "recorded", match: fullEngine(again, fixture) } : { kind: "light" };
      },
    });
    expect(whole.played.slice(0, 2).map(({ match }) => match)).toEqual(friday.played.map(({ match }) => match));
    expect(whole.played).toHaveLength(4);
    // Germany and Spain, who never meet France on the Friday, play it as a save without a coach plays it.
    const plain = runBreak({ session: internationalSession(called(), first), fixtures, seedOf, openDate: () => true, playOf: () => ({ kind: "light" }) });
    expect(whole.played[0].match).toEqual(plain.played[0].match);
  });

  it("leaves a match started live pending, the other matches of its date played, none after it", () => {
    const run = runBreak({
      session: internationalSession(called(), first),
      fixtures,
      seedOf,
      openDate: () => true,
      playOf: (fixture) => (fixture.home === "FRA" ? { kind: "pending" } : { kind: "light" }),
    });
    expect(run.pending?.home).toBe("FRA");
    expect(run.played.map(({ fixture }) => `${fixture.home}-${fixture.away}`)).toEqual(["GER-ESP"]);
  });

  it("runs a tournament the same way: every match light gives playTournament's, a stop at its coach's next match, which nextTournamentMatch names", () => {
    const groups = [
      ["GER", "ESP", "ENG"],
      ["FRA", "ITA", "POR"],
    ] as const;
    const dates = tournamentDates(2028);
    const squads = () => new Map(groups.flat().map((code, index) => [code, squad(code, 82 - index)] as const));
    const seed = (date: Date, home: string, away: string) => internationalMatchRngSeed("seed-a", date, home, away);
    const light = playTournament({ session: internationalSession(squads(), dates[0]), groups, dates, strengths: new Map(), seedOf: seed });
    const run = runTournament({
      session: internationalSession(squads(), dates[0]),
      groups,
      dates,
      strengths: new Map(),
      seedOf: seed,
      openDate: () => true,
      playOf: () => ({ kind: "light" }),
    });
    expect(run.played.map(({ match }) => match)).toEqual(light.matches.map(({ match }) => match));
    expect(run.result?.winner).toBe(light.winner);
    // Portugal's coach: the run stops before its first match, which is the next one named.
    const stopped = runTournament({
      session: internationalSession(squads(), dates[0]),
      groups,
      dates,
      strengths: new Map(),
      seedOf: seed,
      openDate: (fixtures) => !fixtures.some((fixture) => fixture.home === "POR" || fixture.away === "POR"),
      playOf: () => ({ kind: "light" }),
    });
    const next = nextTournamentMatch({
      code: "POR",
      groups,
      dates,
      played: stopped.played.map(({ fixture, match }) => ({
        round: fixture.round,
        home: fixture.home,
        away: fixture.away,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        winner: match.winner === null ? null : match.winner === "home" ? fixture.home : fixture.away,
      })),
      strengths: new Map(),
    });
    expect(stopped.stoppedBefore).toEqual(next?.date);
    expect(next?.home === "POR" || next?.away === "POR").toBe(true);
  });
});
