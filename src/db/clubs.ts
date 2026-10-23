import { displayClubName } from "../engine/club-name";
import { competitionTier, type CompetitionTier } from "../engine/tiers";
import { DEFAULT_WORLD_VERSION, worldTiers, type WorldVersion } from "../engine/world-version";
import { prisma } from "./client";

export type ClubOption = {
  id: string;
  name: string;
};

export type CompetitionClubs = {
  code: string;
  name: string;
  country: string; // « France »
  tier: CompetitionTier;
  clubs: ClubOption[];
};

/**
 * Clubs a save of a world can be created with, grouped by competition: by country, then by division, the clubs in
 * alphabetical order of the names shown. Reference tables only.
 */
export async function listClubsByCompetition(worldVersion: WorldVersion = DEFAULT_WORLD_VERSION): Promise<CompetitionClubs[]> {
  const competitions = await prisma.competition.findMany({
    where: { tier: { in: worldTiers(worldVersion) } },
    orderBy: [{ country: "asc" }, { tier: "asc" }],
    select: { code: true, name: true, country: true, tier: true, clubs: { select: { id: true, slug: true, name: true } } },
  });
  return competitions.map((competition) => ({
    ...competition,
    tier: competitionTier(competition.tier),
    clubs: competition.clubs
      .map((club) => ({ id: club.id, name: displayClubName(club) }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr")),
  }));
}

/**
 * The world of a save created with a club, until the second divisions are the default: a second division club needs
 * worldVersion 2, any other club gets DEFAULT_WORLD_VERSION. Throws for a club without a competition.
 */
export async function creationWorldVersion(clubId: string): Promise<WorldVersion> {
  const club = await prisma.club.findUniqueOrThrow({ where: { id: clubId }, select: { competition: { select: { tier: true } } } });
  if (club.competition === null) {
    throw new Error(`Club ${clubId} has no competition`);
  }
  return competitionTier(club.competition.tier) === 2 ? 2 : DEFAULT_WORLD_VERSION;
}
