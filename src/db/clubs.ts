import { displayClubName } from "../engine/club-name";
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

/** Clubs of the world grouped by competition, both in alphabetical order of the names shown. Reference tables only. */
export async function listClubsByCompetition(): Promise<CompetitionClubs[]> {
  const competitions = await prisma.competition.findMany({
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
