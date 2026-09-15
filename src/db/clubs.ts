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

/** Clubs of the world grouped by competition, both in alphabetical order. Reference tables only. */
export async function listClubsByCompetition(): Promise<CompetitionClubs[]> {
  return prisma.competition.findMany({
    orderBy: { name: "asc" },
    select: { code: true, name: true, clubs: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
  });
}
