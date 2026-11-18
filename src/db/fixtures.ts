import { generateBalancedSchedule, generateSchedule, matchdayDates, scheduleRngSeed } from "../engine/schedule";
import type { WorldVersion } from "../engine/world-version";
import { firstMatchdayDate } from "../engine/world";
import type { Prisma } from "../generated/prisma/client";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";

export type SeasonClub = {
  slug: string;
  clubSaveId: string;
};

export type SeasonFixturesInput = {
  saveId: string;
  saveSeed: string;
  worldVersion: WorldVersion;
  seasonId: string;
  competitionCode: string;
  startYear: number;
  withBreaks: boolean; // a season with international breaks (worldVersion 2 only): matchdayDates without their Saturdays
  clubs: readonly SeasonClub[];
};

const bySlug = (a: SeasonClub, b: SeasonClub): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/**
 * Fixture rows of a new season: a seeded double round-robin between the clubs. Clubs are sorted by slug first, so their
 * order in the input never matters. A worldVersion 1 save keeps the calendar it always had: generateSchedule, one
 * matchday a week from the third Saturday of August. A worldVersion 2 save gets generateBalancedSchedule, never more than
 * two matches in a row at home or away, its matchdays placed by matchdayDates so that every competition ends the same day.
 */
export function seasonFixtures(input: SeasonFixturesInput): Prisma.FixtureCreateManyInput[] {
  const clubs = [...input.clubs].sort(bySlug);
  const clubSaveIdBySlug = new Map(clubs.map((club) => [club.slug, club.clubSaveId]));
  const generate = input.worldVersion === 1 ? generateSchedule : generateBalancedSchedule;
  const schedule = generate(
    clubs.map((club) => club.slug),
    firstMatchdayDate(input.startYear),
    makeRng(scheduleRngSeed(input.saveSeed, input.competitionCode, input.startYear)),
  );
  const dates = input.worldVersion === 1 ? null : matchdayDates(2 * (clubs.length - 1), input.startYear, input.withBreaks);
  return schedule.map((match) => ({
    saveId: input.saveId,
    seasonId: input.seasonId,
    round: match.round,
    scheduledAt: dates === null ? match.scheduledAt : dates[match.round - 1],
    homeClubSaveId: getOrThrow(clubSaveIdBySlug, match.home, "club save"),
    awayClubSaveId: getOrThrow(clubSaveIdBySlug, match.away, "club save"),
  }));
}
