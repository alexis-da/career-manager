import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { ageInYears } from "../lib/dates";
import { makeRng } from "../lib/rng";
import { FULL_FITNESS } from "./balance";
import { fitnessAfterMatch, recoveredFitness } from "./fitness";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "./generation";
import { averageStarterRating, selectLineup, selectRestedLineup, type SquadPlayer } from "./lineup";
import { matchRngSeed, nextForm, outcomeFor, playerMatchStats, simulateMatch, type Appearance } from "./match";
import { generateBalancedSchedule, matchdayDates } from "./schedule";
import { competitionTier } from "./tiers";
import { firstMatchdayDate, WORLD_START_DATE } from "./world";

// The ten leagues of the real world over a whole season, played as a save of world 2 plays them, on its calendar
// (matchdayDates: Saturdays, and Tuesdays for the longest seasons): AI lineups picked before every match and their tired
// players rested (selectRestedLineup), injured players left out, form and fitness carried from one match to the next for
// every player of both clubs (nextForm, fitnessAfterMatch, as recordFinishedMatches applies them) and fitness recovered
// day by day (recoveredFitness, as playNextMatchday applies it). The cups are left out. The calibration of match.test.ts
// is at neutral form and full fitness; the targets of the gameplay sheet (docs/design/gameplay-v1.md), measured on saves
// by npm run measure:balance, must hold over a season too.
const SAVE_SEED = "match-season";
const START_YEAR = 2026;
const DAY_MS = 86_400_000;

type Played = { homeGoals: number; awayGoals: number; homeStrength: number; awayStrength: number };

const season = (() => {
  const plan = buildWorldPlan();
  const squads = new Map<string, SquadPlayer[]>();
  for (const { competition, clubs } of plan) {
    for (const club of clubs) {
      squads.set(
        club.slug,
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
          fitness: 100,
          injured: false,
        })),
      );
    }
  }
  const squadOf = (slug: string): SquadPlayer[] => squads.get(slug) ?? [];
  const strength = new Map([...squads].map(([slug, squad]) => [slug, averageStarterRating(selectLineup(squad))]));
  const injuredUntil = new Map<string, number>();
  const points = new Map<string, number>();
  const played: Played[] = [];
  const starterFitness: number[] = [];
  let rotations = 0;

  const matches = plan
    .flatMap(({ competition, clubs }) => {
      const pairings = generateBalancedSchedule(
        clubs.map((club) => club.slug).sort(),
        firstMatchdayDate(START_YEAR),
        makeRng(`${SAVE_SEED}:${competition.code}`),
      );
      const dates = matchdayDates(2 * (clubs.length - 1), START_YEAR);
      return pairings.map((match) => ({ ...match, scheduledAt: dates[match.round - 1] }));
    })
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.round - b.round);
  let today = matches[0].scheduledAt.getTime();
  for (const match of matches) {
    const date = match.scheduledAt.getTime();
    if (date > today) {
      const days = Math.round((date - today) / DAY_MS);
      for (const [slug, squad] of squads) {
        squads.set(slug, squad.map((player) => ({ ...player, fitness: recoveredFitness(player.fitness, days) })));
      }
      today = date;
    }
    const lineup = (slug: string) => {
      const available = squadOf(slug).map((player) => ({ ...player, injured: (injuredUntil.get(player.id) ?? 0) > date }));
      const rested = selectRestedLineup(available);
      const plain = new Set(selectLineup(available).starters.map((starter) => starter.player.id));
      rotations += rested.starters.filter((starter) => !plain.has(starter.player.id)).length;
      starterFitness.push(...rested.starters.map((starter) => starter.player.fitness));
      return rested;
    };
    const result = simulateMatch(
      lineup(match.home),
      lineup(match.away),
      matchRngSeed(SAVE_SEED, START_YEAR, match.round, match.home, match.away),
    );
    const stats = new Map(playerMatchStats(result).map((line) => [line.playerId, line]));
    const spells = new Map<string, Appearance[]>();
    for (const appearance of result.appearances) {
      spells.set(appearance.playerId, [...(spells.get(appearance.playerId) ?? []), appearance]);
    }
    for (const [side, slug] of [["home", match.home], ["away", match.away]] as const) {
      const outcome = outcomeFor(result, side);
      squads.set(
        slug,
        squadOf(slug).map((player) => ({
          ...player,
          form: nextForm(player.form, stats.get(player.id), outcome),
          fitness: Math.round(fitnessAfterMatch(player.fitness, spells.get(player.id) ?? [])),
        })),
      );
      points.set(slug, (points.get(slug) ?? 0) + (outcome === "win" ? 3 : outcome === "draw" ? 1 : 0));
    }
    for (const injury of result.injuries) {
      injuredUntil.set(injury.playerId, date + injury.days * DAY_MS);
    }
    played.push({
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
      homeStrength: strength.get(match.home) ?? 0,
      awayStrength: strength.get(match.away) ?? 0,
    });
  }

  const gaps = plan.map(({ clubs }) => {
    const table = clubs.map((club) => points.get(club.slug) ?? 0);
    return Math.max(...table) - Math.min(...table);
  });
  // A club's form: the mean form of its eleven best players by overall.
  const elevenForms = [...squads.values()].map((squad) => {
    const best = [...squad].sort((a, b) => b.overall - a.overall).slice(0, 11);
    return best.reduce((sum, player) => sum + player.form, 0) / best.length;
  });
  return { played, gaps, elevenForms, starterFitness, rotations, matches: matches.length };
})();

const share = (count: number): number => count / season.played.length;

describe("a season of the ten leagues, with form and injuries", () => {
  it("averages 2.6 to 2.8 goals per match", () => {
    const goals = season.played.reduce((sum, match) => sum + match.homeGoals + match.awayGoals, 0);

    expect(goals / season.played.length).toBeGreaterThanOrEqual(2.6);
    expect(goals / season.played.length).toBeLessThanOrEqual(2.8);
  });

  it("ends 24 to 27 % of matches level and gives 43 to 46 % of wins to the home team", () => {
    const draws = share(season.played.filter((match) => match.homeGoals === match.awayGoals).length);
    const homeWins = share(season.played.filter((match) => match.homeGoals > match.awayGoals).length);

    expect(draws).toBeGreaterThanOrEqual(0.24);
    expect(draws).toBeLessThanOrEqual(0.27);
    expect(homeWins).toBeGreaterThanOrEqual(0.43);
    expect(homeWins).toBeLessThanOrEqual(0.46);
  });

  it("parts the first and the last club of a league by 50 to 60 points on average", () => {
    const gap = season.gaps.reduce((sum, value) => sum + value, 0) / season.gaps.length;

    expect(gap).toBeGreaterThanOrEqual(50);
    expect(gap).toBeLessThanOrEqual(60);
  });

  it("lets the weaker club win 20 to 25 % of the matches between clubs a rating point apart or more", () => {
    const decided = season.played.filter((match) => Math.abs(match.homeStrength - match.awayStrength) >= 1);
    const upsets = decided.filter((match) =>
      match.homeStrength > match.awayStrength ? match.awayGoals > match.homeGoals : match.homeGoals > match.awayGoals,
    );

    expect(upsets.length / decided.length).toBeGreaterThanOrEqual(0.2);
    expect(upsets.length / decided.length).toBeLessThanOrEqual(0.25);
  });

  it("starts the AI elevens close to full fitness, never below 75 without the cups' midweek ties", () => {
    const mean = season.starterFitness.reduce((sum, value) => sum + value, 0) / season.starterFitness.length;

    expect(mean).toBeGreaterThan(95);
    expect(mean).toBeLessThan(FULL_FITNESS);
    // Saturday, Tuesday, Saturday at the most: 75 at the third kick-off, not tired enough to be rested.
    expect(Math.min(...season.starterFitness)).toBe(75);
    expect(season.rotations).toBe(0);
  });

  it("ends the season with every club's eleven between 30 and 75 of form, far from the bounds", () => {
    expect(Math.min(...season.elevenForms)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...season.elevenForms)).toBeLessThanOrEqual(75);
    // Form still moves: the spread between clubs is real.
    expect(Math.max(...season.elevenForms) - Math.min(...season.elevenForms)).toBeGreaterThan(25);
  });
});
