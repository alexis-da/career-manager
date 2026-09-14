import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { ageInYears } from "../lib/dates";
import { makeRng, randomInt } from "../lib/rng";
import { MAX_STOPPAGE_MINUTES, REGULATION_MINUTES, SUBSTITUTIONS_PER_TEAM } from "./balance";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "./generation";
import { selectLineup, type Lineup, type SquadPlayer } from "./lineup";
import { nextForm, playerMatchStats, simulateMatch, type MatchResult } from "./match";
import { WORLD_START_DATE } from "./world";

const SAVE_SEED = "match-test";
const MATCH_COUNT = 10_000;

// The real 2024-25 world, with attributes generated for one save and every player at neutral form.
const competitions = buildWorldPlan().map(({ competition, clubs }) => ({
  code: competition.code,
  clubs: clubs.map((club) => ({
    slug: club.slug,
    lineup: selectLineup(
      club.players.map(
        (player): SquadPlayer => ({
          ...generateAttributes(
            { position: player.position, age: ageInYears(player.birthDate, WORLD_START_DATE) },
            clubLevelFromRank(club.initialRank, clubs.length),
            makeRng(attributeRngSeed(SAVE_SEED, club.slug, player.squadSlot)),
          ),
          id: `${club.slug}#${player.squadSlot}`,
          position: player.position,
          form: 50,
          morale: 50,
          injured: false,
        }),
      ),
    ),
  })),
}));

function lineupOf(slug: string): Lineup {
  const club = competitions.flatMap((competition) => competition.clubs).find((candidate) => candidate.slug === slug);
  if (club === undefined) {
    throw new Error(`Unknown club ${slug}`);
  }
  return club.lineup;
}

/** League matches between random pairs of clubs of the same competition, one fixed seed per match. */
const leagueResults: MatchResult[] = (() => {
  const rng = makeRng("league-pairs");
  return Array.from({ length: MATCH_COUNT }, (_, index) => {
    const { clubs } = competitions[index % competitions.length];
    const homeIndex = randomInt(rng, 0, clubs.length - 1);
    const awayIndex = (homeIndex + randomInt(rng, 1, clubs.length - 1)) % clubs.length;
    return simulateMatch(clubs[homeIndex].lineup, clubs[awayIndex].lineup, makeRng(`league:${index}`));
  });
})();

/** Bayern against Monza, alternating home and away. */
const bayernMonza = Array.from({ length: MATCH_COUNT }, (_, index) => {
  const bayernAtHome = index % 2 === 0;
  const [home, away] = bayernAtHome
    ? [lineupOf("fc-bayern-munchen"), lineupOf("ac-monza")]
    : [lineupOf("ac-monza"), lineupOf("fc-bayern-munchen")];
  return { bayernAtHome, result: simulateMatch(home, away, makeRng(`bayern-monza:${index}`)) };
});

describe("simulateMatch", () => {
  it("gives the same match sheet for the same seed", () => {
    const play = (seed: string) => simulateMatch(lineupOf("liverpool-fc"), lineupOf("arsenal-fc"), makeRng(seed));

    expect(play("same")).toEqual(play("same"));
    expect(play("same")).not.toEqual(play("other"));
  });

  it("averages 2.4 to 3.2 goals per match over 10 000 league matches", () => {
    const goals = leagueResults.reduce((sum, result) => sum + result.homeGoals + result.awayGoals, 0);

    expect(goals / MATCH_COUNT).toBeGreaterThanOrEqual(2.4);
    expect(goals / MATCH_COUNT).toBeLessThanOrEqual(3.2);
  });

  it("gives the home team 40 to 50 % of wins", () => {
    const homeWins = leagueResults.filter((result) => result.homeGoals > result.awayGoals).length;

    expect(homeWins / MATCH_COUNT).toBeGreaterThanOrEqual(0.4);
    expect(homeWins / MATCH_COUNT).toBeLessThanOrEqual(0.5);
  });

  it("lets Bayern beat Monza in more than 70 % of 10 000 matches", () => {
    const bayernWins = bayernMonza.filter(({ bayernAtHome, result }) =>
      bayernAtHome ? result.homeGoals > result.awayGoals : result.awayGoals > result.homeGoals,
    ).length;

    expect(bayernWins / MATCH_COUNT).toBeGreaterThan(0.7);
  });

  it("keeps scores, minutes, scorers and appearances consistent", () => {
    const violations: string[] = [];
    [...leagueResults, ...bayernMonza.map(({ result }) => result)].forEach((result, index) => {
      const report = (message: string) => violations.push(`match ${index}: ${message}`);
      const onPitch = (playerId: string, side: string, minute: number) =>
        result.appearances.some(
          (appearance) =>
            appearance.playerId === playerId &&
            appearance.side === side &&
            appearance.from < minute &&
            minute <= appearance.to,
        );

      if (result.fullTime < REGULATION_MINUTES || result.fullTime > REGULATION_MINUTES + MAX_STOPPAGE_MINUTES) {
        report(`final whistle at ${result.fullTime}`);
      }
      for (const [side, goals] of [["home", result.homeGoals], ["away", result.awayGoals]] as const) {
        const goalEvents = result.events.filter((event) => event.type === "GOAL" && event.side === side).length;
        if (!Number.isInteger(goals) || goals < 0 || goalEvents !== goals) {
          report(`${side} scored ${goals} with ${goalEvents} goal events`);
        }
        const players = result.appearances.filter((appearance) => appearance.side === side);
        if (players.filter((appearance) => appearance.from === 0).length !== 11) {
          report(`${side} did not start with 11 players`);
        }
        if (players.length > 11 + SUBSTITUTIONS_PER_TEAM) {
          report(`${side} used ${players.length} players`);
        }
      }
      for (const event of result.events) {
        if (!Number.isInteger(event.minute) || event.minute < 1 || event.minute > result.fullTime) {
          report(`${event.type} at minute ${event.minute}`);
        }
        if ((event.type === "GOAL" || event.type === "ASSIST") && !onPitch(event.playerId, event.side, event.minute)) {
          report(`${event.type} by ${event.playerId} off the pitch at ${event.minute}`);
        }
      }
      for (const appearance of result.appearances) {
        if (appearance.minutes < 1 || appearance.minutes > REGULATION_MINUTES || appearance.to < appearance.from) {
          report(`${appearance.playerId} played ${appearance.minutes} minutes`);
        }
      }
    });

    expect(violations.slice(0, 10)).toEqual([]);
  });

  it("produces cards, injuries and substitutions, but rarely red cards and injuries", () => {
    const count = (type: string) =>
      leagueResults.reduce((sum, result) => sum + result.events.filter((event) => event.type === type).length, 0) /
      MATCH_COUNT;

    expect(count("YELLOW_CARD")).toBeGreaterThan(2);
    expect(count("RED_CARD")).toBeLessThan(0.3);
    expect(count("INJURY")).toBeLessThan(0.5);
    expect(count("SUBSTITUTION")).toBeGreaterThan(4);
  });
});

describe("nextForm", () => {
  it("rises for a winning scorer, falls after a defeat, drifts to neutral without playing", () => {
    const stats = { playerId: "p", side: "home" as const, minutes: 90, goals: 1, assists: 0, yellowCards: 0, redCards: 0 };

    expect(nextForm(60, stats, "win")).toBeGreaterThan(60);
    expect(nextForm(60, { ...stats, goals: 0 }, "loss")).toBeLessThan(60);
    expect(nextForm(60, undefined, "win")).toBe(59);
    expect(nextForm(99, { ...stats, goals: 3 }, "win")).toBe(99);
  });

  it("is fed by the stats of the match", () => {
    const [result] = leagueResults;
    const stats = playerMatchStats(result);

    expect(stats).toHaveLength(result.appearances.length);
    expect(stats.reduce((sum, player) => sum + player.goals, 0)).toBe(result.homeGoals + result.awayGoals);
  });
});
