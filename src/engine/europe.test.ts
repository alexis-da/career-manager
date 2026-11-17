import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { cupDates } from "./cup";
import {
  drawLeaguePhase,
  europeDates,
  europeDrawRngSeed,
  europeMatchPrize,
  europeObjective,
  europeReputationBonus,
  europeRunOf,
  EUROPE_COUNTRIES,
  EUROPE_STAGES,
  isKnockoutRound,
  isNeutralRound,
  knockoutTies,
  leaguePhaseTable,
  qualifyForEurope,
  type CountryQualifiers,
  type EuropeEntrant,
  type PlayedEuropeTie,
} from "./europe";
import { matchdayDates } from "./schedule";

const DAY_MS = 86_400_000;

/** A country's first division of `size` clubs, « en-1 » the champion, and its cup winner. */
function country(code: string, size: number, cupWinner: CountryQualifiers["cupWinner"] = null): CountryQualifiers {
  return { country: code, table: Array.from({ length: size }, (_, index) => `${code}-${index + 1}`), cupWinner };
}

const ALL: CountryQualifiers[] = EUROPE_COUNTRIES.map((code) => country(code, ["de", "fr"].includes(code) ? 18 : 20));
const reputation = (club: string): number => 100 - Number(club.split("-")[1]);

describe("europeDates", () => {
  const dates = europeDates(2026);

  it("plays rounds 1 to 9 on Wednesdays from 16 September to 28 April, the finals on Saturday 29 May", () => {
    expect(dates.map((date) => date.toISOString().slice(0, 10))).toEqual([
      "2026-09-16",
      "2026-09-30",
      "2026-10-14",
      "2026-10-28",
      "2026-11-25",
      "2026-12-16",
      "2027-02-03",
      "2027-03-03",
      "2027-04-28",
      "2027-05-29",
    ]);
    expect(dates.slice(0, 9).every((date) => date.getUTCDay() === 3)).toBe(true);
    expect(dates[9].getUTCDay()).toBe(6);
  });

  it("never falls in a week with a cup round or a midweek matchday, and ends after the cup's final", () => {
    const weekOf = (date: Date): number => Math.floor((date.getTime() - matchdayDates(46, 2026)[0].getTime()) / (7 * DAY_MS));
    const cupWeeks = new Set(cupDates(2026).slice(0, 5).map(weekOf));
    const tuesdays = matchdayDates(46, 2026).filter((date) => date.getUTCDay() === 2).map(weekOf);
    for (const date of dates.slice(0, 9)) {
      expect(cupWeeks.has(weekOf(date))).toBe(false);
      expect(tuesdays).not.toContain(weekOf(date));
    }
    expect(dates[9].getTime()).toBe(cupDates(2026)[5].getTime() + 7 * DAY_MS);
    expect(dates[9].getTime()).toBeGreaterThan(matchdayDates(38, 2026).at(-1)?.getTime() ?? 0);
  });
});

describe("qualifyForEurope", () => {
  it("puts each country's first four in eu.1, one a pot, and its 5th, 6th and 7th in eu.2 without a cup winner", () => {
    const entrants = qualifyForEurope(ALL, reputation);

    expect(entrants["eu.1"]).toHaveLength(20);
    expect(entrants["eu.2"]).toHaveLength(15);
    for (const pot of [1, 2, 3, 4]) {
      const inPot = entrants["eu.1"].filter((entrant) => entrant.pot === pot);
      expect(inPot.map((entrant) => entrant.country).sort()).toEqual([...EUROPE_COUNTRIES]);
      expect(inPot.every((entrant) => entrant.rank === pot && entrant.path === "RANK")).toBe(true);
    }
    expect(entrants["eu.2"].filter((entrant) => entrant.country === "en").map((entrant) => [entrant.club, entrant.pot])).toEqual([
      ["en-5", 1],
      ["en-6", 2],
      ["en-7", 3],
    ]);
    expect(entrants["eu.1"].find((entrant) => entrant.club === "fr-1")?.reputation).toBe(99);
  });

  it("gives the cup's place to its winner, a second division one in the last pot, and to the 7th when it is already in", () => {
    const entrants = qualifyForEurope(
      [
        country("de", 18, { club: "de2-3", tier: 2, rank: 3 }),
        country("en", 20, { club: "en-2", tier: 1, rank: 2 }),
        country("es", 20, { club: "es-11", tier: 1, rank: 11 }),
        country("fr", 18, { club: "fr-6", tier: 1, rank: 6 }),
        country("it", 20, { club: "it-7", tier: 1, rank: 7 }),
      ],
      () => 70,
    );
    const ofCountry = (code: string) => entrants["eu.2"].filter((entrant) => entrant.country === code).map((entrant) => `${entrant.club}:${entrant.path}`);

    expect(ofCountry("de")).toEqual(["de-5:RANK", "de-6:RANK", "de2-3:CUP"]);
    expect(ofCountry("en")).toEqual(["en-5:RANK", "en-6:RANK", "en-7:RANK"]);
    expect(ofCountry("es")).toEqual(["es-5:RANK", "es-6:RANK", "es-11:CUP"]);
    expect(ofCountry("fr")).toEqual(["fr-5:RANK", "fr-6:RANK", "fr-7:RANK"]);
    expect(ofCountry("it")).toEqual(["it-5:RANK", "it-6:RANK", "it-7:CUP"]);
    // Never in both.
    const clubs = [...entrants["eu.1"], ...entrants["eu.2"]].map((entrant) => entrant.club);
    expect(new Set(clubs).size).toBe(clubs.length);
  });
});

describe("drawLeaguePhase", () => {
  const entrants = qualifyForEurope(ALL, reputation);

  for (const [code, matchesPerClub, total] of [
    ["eu.1", 6, 60],
    ["eu.2", 4, 30],
  ] as const) {
    it(`gives each club of ${code} ${matchesPerClub} different opponents of the other pots, never of its country, half at home`, () => {
      for (const seed of ["a", "b", "c", "d", "e"]) {
        const clubs = entrants[code];
        const matches = drawLeaguePhase(clubs, makeRng(europeDrawRngSeed(seed, 2026, code)));
        const byClub = new Map(clubs.map((entrant) => [entrant.club, entrant]));
        expect(matches).toHaveLength(total);
        for (const entrant of clubs) {
          const own = matches.filter((match) => match.home === entrant.club || match.away === entrant.club);
          const opponents = own.map((match) => (match.home === entrant.club ? match.away : match.home));
          expect(own).toHaveLength(matchesPerClub);
          expect(new Set(opponents).size).toBe(matchesPerClub);
          expect(own.filter((match) => match.home === entrant.club)).toHaveLength(matchesPerClub / 2);
          for (const opponent of opponents) {
            expect(byClub.get(opponent)?.country).not.toBe(entrant.country);
            expect(byClub.get(opponent)?.pot).not.toBe(entrant.pot);
          }
          // Two opponents in each other pot.
          const pots = Map.groupBy(opponents, (opponent) => byClub.get(opponent)?.pot);
          expect([...pots.values()].every((ofPot) => ofPot.length === 2)).toBe(true);
          // At most one match a round.
          expect(new Set(own.map((match) => match.round)).size).toBe(matchesPerClub);
        }
        expect(new Set(matches.map((match) => match.round))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
      }
    });
  }

  it("draws the same league phase from the same seed, another from another", () => {
    const draw = (seed: string) => drawLeaguePhase(entrants["eu.1"], makeRng(europeDrawRngSeed(seed, 2026, "eu.1")));
    expect(draw("same")).toEqual(draw("same"));
    expect(draw("same")).not.toEqual(draw("other"));
  });
});

describe("leaguePhaseTable", () => {
  it("ranks by points, goal difference, goals scored, then the reputation at the opening and the slug", () => {
    const clubs: Pick<EuropeEntrant, "club" | "reputation">[] = [
      { club: "a", reputation: 70 },
      { club: "b", reputation: 80 },
      { club: "c", reputation: 80 },
      { club: "d", reputation: 60 },
    ];
    const table = leaguePhaseTable(clubs, [
      { home: "a", away: "d", homeGoals: 2, awayGoals: 0 },
      { home: "b", away: "c", homeGoals: 1, awayGoals: 1 },
    ]);
    expect(table.map((row) => [row.club, row.points, row.rank])).toEqual([
      ["a", 3, 1],
      ["b", 1, 2],
      ["c", 1, 3],
      ["d", 0, 4],
    ]);
  });
});

describe("knockoutTies", () => {
  const ranking = Array.from({ length: 20 }, (_, index) => `r${index + 1}`);
  const win = (round: number, ties: { home: string; away: string }[], winner: (tie: { home: string; away: string }) => string) =>
    ties.map((tie): PlayedEuropeTie => ({ ...tie, round, winner: winner(tie) }));

  it("pairs the play-offs 5-12, 6-11, 7-10, 8-9, then the fixed bracket, the better ranked at home", () => {
    const playoffs = knockoutTies(7, ranking, []);
    expect(playoffs).toEqual([
      { home: "r5", away: "r12" },
      { home: "r6", away: "r11" },
      { home: "r7", away: "r10" },
      { home: "r8", away: "r9" },
    ]);
    // The lower ranked win the play-offs.
    const played = win(7, playoffs, (tie) => tie.away);
    const quarterFinals = knockoutTies(8, ranking, played);
    expect(quarterFinals).toEqual([
      { home: "r1", away: "r9" },
      { home: "r2", away: "r10" },
      { home: "r3", away: "r11" },
      { home: "r4", away: "r12" },
    ]);
    const afterQuarters = [...played, ...win(8, quarterFinals, (tie) => (tie.home === "r4" ? tie.away : tie.home))];
    // The 1st's side against the 4th's, the 2nd's against the 3rd's: r12 beat r4, so r1 hosts it.
    expect(knockoutTies(9, ranking, afterQuarters)).toEqual([
      { home: "r1", away: "r12" },
      { home: "r2", away: "r3" },
    ]);
    const afterSemis = [...afterQuarters, ...win(9, knockoutTies(9, ranking, afterQuarters), (tie) => tie.away)];
    expect(knockoutTies(10, ranking, afterSemis)).toEqual([{ home: "r3", away: "r12" }]);
  });
});

describe("prizes, runs, bonuses and objectives", () => {
  it("pays 23.6 M€ for a perfect run in eu.1 and 10 M€ in eu.2, prizes of the league phase's first four included", () => {
    for (const [code, total] of [
      ["eu.1", 23_600_000],
      ["eu.2", 10_000_000],
    ] as const) {
      const leagueWins = (code === "eu.1" ? 6 : 4) * europeMatchPrize(code, 1, true);
      const participation = code === "eu.1" ? 3_000_000 : 1_500_000;
      const quarterPlace = europeMatchPrize(code, 7, true);
      const knockout = europeMatchPrize(code, 8, true) + europeMatchPrize(code, 9, true) + europeMatchPrize(code, 10, true);
      expect(participation + leagueWins + quarterPlace + knockout).toBe(total);
    }
    expect(europeMatchPrize("eu.1", 3, false)).toBe(0);
    expect(europeMatchPrize("eu.1", 10, false)).toBe(4_000_000);
  });

  it("reads a club's stage from the league phase's ranking and its knockout ties", () => {
    const ranking = Array.from({ length: 20 }, (_, index) => `r${index + 1}`);
    expect(europeRunOf("r3", null, [])).toEqual({ stage: EUROPE_STAGES.LEAGUE, out: false });
    expect(europeRunOf("r3", ranking, [])).toEqual({ stage: EUROPE_STAGES.QUARTER_FINAL, out: false });
    expect(europeRunOf("r9", ranking, [])).toEqual({ stage: EUROPE_STAGES.PLAYOFF, out: false });
    expect(europeRunOf("r15", ranking, [])).toEqual({ stage: EUROPE_STAGES.LEAGUE, out: true });
    expect(europeRunOf("r9", ranking, [{ round: 7, home: "r8", away: "r9", winner: "r8" }])).toEqual({ stage: EUROPE_STAGES.PLAYOFF, out: true });
    expect(europeRunOf("r1", ranking, [{ round: 10, home: "r1", away: "r2", winner: "r1" }])).toEqual({ stage: EUROPE_STAGES.WON, out: false });
    expect(europeRunOf("r2", ranking, [{ round: 10, home: "r1", away: "r2", winner: "r1" }])).toEqual({ stage: EUROPE_STAGES.FINAL, out: true });
  });

  it("raises the target of eu.1's quarter-finalists by 1 to its winner's by 3, eu.2's finalists by 1 and winner by 2", () => {
    expect([1, 2, 3, 4, 5, 6].map((stage) => europeReputationBonus("eu.1", stage))).toEqual([0, 0, 1, 1, 2, 3]);
    expect([1, 2, 3, 4, 5, 6].map((stage) => europeReputationBonus("eu.2", stage))).toEqual([0, 0, 0, 0, 1, 2]);
  });

  it("asks the semi-finals, the quarter-finals or the play-offs by reputation third, exceeded two stages further", () => {
    expect([1, 2, 3].map((third) => europeObjective(third as 1 | 2 | 3))).toEqual([
      { target: 4, exceed: 6 },
      { target: 3, exceed: 5 },
      { target: 2, exceed: 4 },
    ]);
  });

  it("plays knockout and neutral matches past the league phase only, the neutral one the final", () => {
    expect([1, 6, 7, 10].map((round) => isKnockoutRound("EUROPE", round))).toEqual([false, false, true, true]);
    expect(isKnockoutRound("CUP", 1)).toBe(true);
    expect(isKnockoutRound("LEAGUE", 7)).toBe(false);
    expect([9, 10].map((round) => isNeutralRound("EUROPE", round))).toEqual([false, true]);
    expect(isNeutralRound("CUP", 6)).toBe(false);
  });
});
