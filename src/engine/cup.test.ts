import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { makeRng } from "../lib/rng";
import { CUP_MAIN_DRAW, CUP_ROUND_PRIZES, CUP_ROUNDS, CUP_RUNNER_UP_PRIZE, CUP_WINNER_PRIZE } from "./balance";
import {
  cupDates,
  cupDrawRngSeed,
  cupPrize,
  cupPrizesOf,
  cupRunOf,
  drawTies,
  nextRoundTies,
  preliminaryTies,
  type CupEntrant,
  type PlayedTie,
} from "./cup";
import { countryOf } from "./promotion";
import { matchdayDates } from "./schedule";
import { competitionTier } from "./tiers";

const DAY_MS = 86_400_000;
const iso = (date: Date): string => date.toISOString().slice(0, 10);

// The world's clubs by country, ranked as at a save's creation: their division and their rank in the source season.
const entrantsByCountry = Map.groupBy(
  buildWorldPlan().flatMap(({ competition, clubs }) =>
    clubs.map((club) => ({
      country: countryOf(competition.code),
      entrant: { club: club.slug, tier: competitionTier(competition.tier), rank: club.initialRank } satisfies CupEntrant,
    })),
  ),
  (row) => row.country,
);
const entrantsOf = (country: string): CupEntrant[] => (entrantsByCountry.get(country) ?? []).map((row) => row.entrant);

/** A whole cup played with the home club always winning: every tie of every round. */
function playCup(entrants: readonly CupEntrant[], seed: string): PlayedTie[] {
  const clubs = entrants.map((entrant) => entrant.club);
  const played: PlayedTie[] = preliminaryTies(entrants, makeRng(`${seed}:1`)).map((tie) => ({ ...tie, round: 1, winner: tie.home }));
  for (let round = 1; round < CUP_ROUNDS; round++) {
    const ties = nextRoundTies(clubs, played, round, makeRng(`${seed}:${round + 1}`));
    played.push(...ties.map((tie) => ({ ...tie, round: round + 1, winner: tie.home })));
  }
  return played;
}

describe("cupDates", () => {
  it("places the rounds on Wednesdays from September to April, and the final a week after the last matchday", () => {
    expect(cupDates(2026).map(iso)).toEqual(["2026-09-23", "2026-11-11", "2027-01-06", "2027-02-17", "2027-04-07", "2027-05-22"]);
    const [last] = matchdayDates(38, 2026).slice(-1);
    expect(cupDates(2026)[CUP_ROUNDS - 1].getTime() - last.getTime()).toBe(7 * DAY_MS);
  });

  it("never comes close to a matchday, of any division, Tuesdays included, whatever the year", () => {
    for (let startYear = 2026; startYear <= 2040; startYear++) {
      const matchdays = [46, 42, 38, 34].flatMap((rounds) => matchdayDates(rounds, startYear));
      const dates = cupDates(startYear);
      for (const date of dates.slice(0, CUP_ROUNDS - 1)) {
        expect(date.getUTCDay()).toBe(3); // Wednesday
        // The nearest matchdays are the Saturdays around it: no Tuesday that week, three matches in a week for nobody.
        expect(Math.min(...matchdays.map((matchday) => Math.abs(matchday.getTime() - date.getTime())))).toBeGreaterThanOrEqual(3 * DAY_MS);
      }
      expect(dates[CUP_ROUNDS - 1].getUTCDay()).toBe(6);
      expect(dates.every((date, index) => index === 0 || date > dates[index - 1])).toBe(true);
    }
  });
});

describe("preliminary round", () => {
  it.each([
    ["en", 44, 12],
    ["es", 42, 10],
    ["it", 40, 8],
    ["de", 36, 4],
    ["fr", 36, 4],
  ])("brings %s's %i clubs down to the round of 32 with %i ties between its lowest clubs", (country, clubs, ties) => {
    const entrants = entrantsOf(country);
    expect(entrants).toHaveLength(clubs);

    const drawn = preliminaryTies(entrants, makeRng(cupDrawRngSeed("seed", 2026, `${country}.cup`, 1)));
    expect(drawn).toHaveLength(ties);
    const playing = new Set(drawn.flatMap((tie) => [tie.home, tie.away]));
    expect(playing.size).toBe(2 * ties);
    expect(clubs - playing.size + ties).toBe(CUP_MAIN_DRAW); // the exempt clubs and the winners

    // The lowest clubs: second division ones, from the bottom of its table; every first division club is exempt.
    const lowest = entrants
      .filter((entrant) => entrant.tier === 2)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 2 * ties)
      .map((entrant) => entrant.club);
    expect([...playing].sort()).toEqual(lowest.sort());
  });

  it("is the same for the same seed, whatever the order of the clubs, and another for another seed", () => {
    const entrants = entrantsOf("en");
    const draw = (seed: string, clubs: readonly CupEntrant[]) => preliminaryTies(clubs, makeRng(seed));
    expect(draw("a", entrants)).toEqual(draw("a", [...entrants].reverse()));
    expect(draw("a", entrants)).not.toEqual(draw("b", entrants));
  });
});

describe("cup rounds", () => {
  it("plays N − 1 ties per country, halving the clubs left each round down to a single winner", () => {
    for (const country of ["en", "es", "it", "de", "fr"]) {
      const entrants = entrantsOf(country);
      const played = playCup(entrants, country);
      expect(played).toHaveLength(entrants.length - 1);
      const perRound = Array.from({ length: CUP_ROUNDS - 1 }, (_, index) => played.filter((tie) => tie.round === index + 2).length);
      expect(perRound).toEqual([16, 8, 4, 2, 1]);
    }
  });

  it("draws the winners of the preliminary round with the clubs exempt from it, and only them", () => {
    const entrants = entrantsOf("fr");
    const clubs = entrants.map((entrant) => entrant.club);
    const preliminary = preliminaryTies(entrants, makeRng("fr:1")).map((tie) => ({ ...tie, round: 1, winner: tie.away }));
    const losers = new Set(preliminary.map((tie) => tie.home));

    const roundOf32 = nextRoundTies(clubs, preliminary, 1, makeRng("fr:2")).flatMap((tie) => [tie.home, tie.away]);
    expect(roundOf32).toHaveLength(CUP_MAIN_DRAW);
    expect(roundOf32.sort()).toEqual(clubs.filter((club) => !losers.has(club)).sort());
  });

  it("refuses a draw before the round is over", () => {
    const entrants = entrantsOf("de");
    const clubs = entrants.map((entrant) => entrant.club);
    // One preliminary tie still to play: both its clubs are still in.
    const [, ...others] = preliminaryTies(entrants, makeRng("de:1"));
    const played = others.map((tie) => ({ ...tie, round: 1, winner: tie.home }));
    expect(() => nextRoundTies(clubs, played, 1, makeRng("de:2"))).toThrow(/needs 32 clubs, 33 are left/);
    expect(() => drawTies(["a", "b", "c"], makeRng("odd"))).toThrow(RangeError);
  });
});

describe("cup prizes and runs", () => {
  it("pays each round won, and both finalists", () => {
    expect(CUP_ROUND_PRIZES.map((prize, index) => cupPrize(index + 1, true))).toEqual([...CUP_ROUND_PRIZES]);
    expect([1, 2, 3, 4, 5].map((round) => cupPrize(round, false))).toEqual([0, 0, 0, 0, 0]);
    expect(cupPrize(CUP_ROUNDS, true)).toBe(CUP_WINNER_PRIZE);
    expect(cupPrize(CUP_ROUNDS, false)).toBe(CUP_RUNNER_UP_PRIZE);
    // A second division club from the preliminary round to the semi-finals: some 3.9 M€.
    expect([1, 2, 3, 4].reduce((sum, round) => sum + cupPrize(round, true), 0)).toBe(1_850_000);
    expect([1, 2, 3, 4, 5].reduce((sum, round) => sum + cupPrize(round, true), 0) + CUP_RUNNER_UP_PRIZE).toBe(6_350_000);
  });

  it("adds up what a club earned from its ties, as they are credited", () => {
    const played = playCup(entrantsOf("it"), "it");
    const final = played.find((tie) => tie.round === CUP_ROUNDS);
    if (final === undefined) {
      throw new Error("No final");
    }
    for (const club of [final.home, final.away, played.find((tie) => tie.round === 1)?.away ?? ""]) {
      const own = played.filter((tie) => tie.home === club || tie.away === club);
      expect(cupPrizesOf(played, club)).toBe(own.reduce((sum, tie) => sum + cupPrize(tie.round, tie.winner === club), 0));
    }
    // The winner entered in the round of 32 at the latest: every round from it won, and the final.
    expect(cupPrizesOf(played, final.home)).toBeGreaterThanOrEqual(CUP_ROUND_PRIZES.slice(1).reduce((sum, prize) => sum + prize, 0) + CUP_WINNER_PRIZE);
    expect(cupPrizesOf(played, played.find((tie) => tie.round === 1)?.away ?? "")).toBe(0);
    expect(cupPrizesOf(played, "no-such-club")).toBe(0);
  });

  it("records the last round each club played, and the winner", () => {
    const played = playCup(entrantsOf("it"), "it");
    const final = played.find((tie) => tie.round === CUP_ROUNDS);
    if (final === undefined) {
      throw new Error("No final");
    }
    expect(cupRunOf(played, final.home)).toEqual({ round: CUP_ROUNDS, won: true });
    expect(cupRunOf(played, final.away)).toEqual({ round: CUP_ROUNDS, won: false });
    const outInPreliminary = played.find((tie) => tie.round === 1)?.away ?? "";
    expect(cupRunOf(played, outInPreliminary)).toEqual({ round: 1, won: false });
    expect(cupRunOf(played, "no-such-club")).toBeNull();
  });
});
