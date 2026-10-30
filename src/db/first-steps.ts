import { prisma } from "./client";

/**
 * The matches the managed club has played, in any competition and season, counted up to `limit`: enough for a save's
 * first steps, and cheap in a long save. Its own matches only: the other clubs' are played around it, already at the
 * half-time of its first.
 */
export async function managedMatchesPlayed(saveId: string, limit: number): Promise<number> {
  const club = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const matches = await prisma.fixture.findMany({
    where: { saveId, played: true, OR: [{ homeClubSaveId: club.id }, { awayClubSaveId: club.id }] },
    take: limit,
    select: { id: true },
  });
  return matches.length;
}
