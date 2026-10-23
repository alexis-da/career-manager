import { displayClubName } from "../engine/club-name";
import { DEFAULT_WORLD_VERSION, worldTiers, type WorldVersion } from "../engine/world-version";
import { prisma } from "./client";

export type ClubOption = {
  id: string;
  name: string;
};

export type CompetitionClubs = {
  code: string;
  name: string;
  clubs: ClubOption[];
};

/**
 * Clubs a save of a world can be created with, grouped by competition, both in alphabetical order of the names shown.
 * Reference tables only.
 */
export async function listClubsByCompetition(worldVersion: WorldVersion = DEFAULT_WORLD_VERSION): Promise<CompetitionClubs[]> {
  const competitions = await prisma.competition.findMany({
    where: { tier: { in: worldTiers(worldVersion) } },
    orderBy: { name: "asc" },
    select: { code: true, name: true, clubs: { select: { id: true, slug: true, name: true } } },
  });
  return competitions.map((competition) => ({
    ...competition,
    clubs: competition.clubs
      .map((club) => ({ id: club.id, name: displayClubName(club) }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr")),
  }));
}
