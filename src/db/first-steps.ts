import { prisma } from "./client";
import { archivedManagedMatches, archivedSeasonIds } from "./season-archive";

/**
 * The matches the managed club has played, in any competition and season, counted up to `limit`: enough for a save's
 * first steps, and cheap in a long save. Its own matches only: the other clubs' are played around it, already at the
 * half-time of its first. An archived season counts from its archive (src/db/season-archive.ts), never its rows.
 */
export async function managedMatchesPlayed(saveId: string, limit: number): Promise<number> {
  const archived = await archivedManagedMatches(prisma, saveId);
  if (archived >= limit) {
    return limit;
  }
  const [club, seasonIds] = await Promise.all([
    prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } }),
    archived === 0 ? [] : archivedSeasonIds(prisma, saveId),
  ]);
  const matches = await prisma.fixture.findMany({
    where: {
      saveId,
      played: true,
      OR: [{ homeClubSaveId: club.id }, { awayClubSaveId: club.id }],
      ...(seasonIds.length === 0 ? {} : { seasonId: { notIn: seasonIds } }),
    },
    take: limit - archived,
    select: { id: true },
  });
  return archived + matches.length;
}
