import { generateSchedule, scheduleRngSeed } from "../engine/schedule";
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
  seasonId: string;
  competitionCode: string;
  startYear: number;
  clubs: readonly SeasonClub[];
};

const bySlug = (a: SeasonClub, b: SeasonClub): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/**
 * Fixture rows of a new season: a seeded double round-robin between the clubs, one matchday a week from
 * the third Saturday of August. Clubs are sorted by slug first, so their order in the input never matters.
 */
export function seasonFixtures(input: SeasonFixturesInput): Prisma.FixtureCreateManyInput[] {
  const clubs = [...input.clubs].sort(bySlug);
  const clubSaveIdBySlug = new Map(clubs.map((club) => [club.slug, club.clubSaveId]));
  const schedule = generateSchedule(
    clubs.map((club) => club.slug),
    firstMatchdayDate(input.startYear),
    makeRng(scheduleRngSeed(input.saveSeed, input.competitionCode, input.startYear)),
  );
  return schedule.map((match) => ({
    saveId: input.saveId,
    seasonId: input.seasonId,
    round: match.round,
    scheduledAt: match.scheduledAt,
    homeClubSaveId: getOrThrow(clubSaveIdBySlug, match.home, "club save"),
    awayClubSaveId: getOrThrow(clubSaveIdBySlug, match.away, "club save"),
  }));
}
