import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { ageInYears } from "../lib/dates";
import { makeRng, randomInt } from "../lib/rng";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "./generation";
import { averageStarterRating, selectLineup, type Lineup } from "./lineup";
import { simulateMatch, type MatchResult } from "./match";
import { competitionTier } from "./tiers";
import { WORLD_START_DATE } from "./world";

const SAVE_SEED = "match-test";
const MATCH_COUNT = 10_000;

// The second divisions' calibration, as match.test.ts pins the first divisions': the real 2024-25 world with
// attributes generated for one save, every player at neutral form, league matches between random pairs of clubs of the
// same competition, one fixed seed per match. Measured when the second divisions were balanced: 2.77 goals per match,
// 45.7 % home wins, 24.2 % draws; at kickoff, each second division's champion as strong as its first division's 15th.
// With the engine in segments, calibrated again (gameplay v1, G1): 2.59 goals, 43.0 % home wins, 26.2 % draws, a
// champion beating its last club in 68.7 % of matches.
const plan = buildWorldPlan();
const tables = plan.map(({ competition, clubs }) => ({
  code: competition.code,
  tier: competitionTier(competition.tier),
  clubs: clubs.map((club) => ({
    rank: club.initialRank,
    lineup: selectLineup(
      club.players.map((player) => ({
        ...generateAttributes(
          { position: player.position, age: ageInYears(player.birthDate, WORLD_START_DATE) },
          clubLevelFromRank(club.initialRank, clubs.length, competitionTier(competition.tier)),
          makeRng(attributeRngSeed(SAVE_SEED, club.slug, player.squadSlot)),
        ),
        id: `${club.slug}#${player.squadSlot}`,
        position: player.position,
        form: 50,
        morale: 50,
        injured: false,
      })),
    ),
  })),
}));
const secondDivisions = tables.filter((table) => table.tier === 2);

const leagueResults: MatchResult[] = (() => {
  const rng = makeRng("league-pairs");
  return Array.from({ length: MATCH_COUNT }, (_, index) => {
    const { clubs } = secondDivisions[index % secondDivisions.length];
    const homeIndex = randomInt(rng, 0, clubs.length - 1);
    const awayIndex = (homeIndex + randomInt(rng, 1, clubs.length - 1)) % clubs.length;
    return simulateMatch(clubs[homeIndex].lineup, clubs[awayIndex].lineup, `league-d2:${index}`);
  });
})();

const lineupAt = (code: string, rank: number): Lineup => {
  const club = tables.find((table) => table.code === code)?.clubs.find((candidate) => candidate.rank === rank);
  if (club === undefined) {
    throw new Error(`No club ranked ${rank} in ${code}`);
  }
  return club.lineup;
};

describe("second division calibration", () => {
  it("averages 2.4 to 3.2 goals per match over 10 000 second division matches", () => {
    const goals = leagueResults.reduce((sum, result) => sum + result.homeGoals + result.awayGoals, 0);

    expect(goals / MATCH_COUNT).toBeGreaterThanOrEqual(2.4);
    expect(goals / MATCH_COUNT).toBeLessThanOrEqual(3.2);
  });

  it("gives the home team 40 to 50 % of wins, and 20 to 28 % of draws", () => {
    const homeWins = leagueResults.filter((result) => result.homeGoals > result.awayGoals).length;
    const draws = leagueResults.filter((result) => result.homeGoals === result.awayGoals).length;

    expect(homeWins / MATCH_COUNT).toBeGreaterThanOrEqual(0.4);
    expect(homeWins / MATCH_COUNT).toBeLessThanOrEqual(0.5);
    expect(draws / MATCH_COUNT).toBeGreaterThanOrEqual(0.2);
    expect(draws / MATCH_COUNT).toBeLessThanOrEqual(0.28);
  });

  it("makes each second division's champion about as strong as its first division's 15th at kickoff", () => {
    const gaps = ["de", "en", "es", "fr", "it"].map(
      (country) => averageStarterRating(lineupAt(`${country}.2`, 1)) - averageStarterRating(lineupAt(`${country}.1`, 15)),
    );
    const meanGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

    expect(Math.abs(meanGap)).toBeLessThanOrEqual(1);
    expect(gaps.every((gap) => Math.abs(gap) <= 2.5)).toBe(true);
  });

  it("lets a second division's champion beat its last club in more than 55 % of 10 000 matches", () => {
    let wins = 0;
    for (const [index, table] of secondDivisions.entries()) {
      const champion = lineupAt(table.code, 1);
      const last = lineupAt(table.code, table.clubs.length);
      for (let match = 0; match < MATCH_COUNT / secondDivisions.length; match++) {
        const atHome = match % 2 === 0;
        const result = atHome
          ? simulateMatch(champion, last, `d2-top-bottom:${index}:${match}`)
          : simulateMatch(last, champion, `d2-top-bottom:${index}:${match}`);
        wins += (atHome ? result.homeGoals > result.awayGoals : result.awayGoals > result.homeGoals) ? 1 : 0;
      }
    }

    expect(wins / MATCH_COUNT).toBeGreaterThan(0.55);
    // 10 000 matches in segments: longer than the default 5 s.
  }, 30_000);
});
