import { seasonStartYear, transferWindowAt } from "../engine/world";
import { prisma } from "./client";
import { getSaveSummary, type SaveSummary } from "./saves";

export type SaveHeader = SaveSummary & {
  startYear: number;
  nextRound: number | null; // matchday of the managed club's next fixture; null once its season is over
  seasonFinished: boolean; // every fixture of the seasons in progress is played
  windowOpen: boolean;
};

/** What the navigation bar of a save shows, or null when the save does not exist. */
export async function getSaveHeader(saveId: string): Promise<SaveHeader | null> {
  const summary = await getSaveSummary(saveId);
  if (summary === null) {
    return null;
  }
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const [nextFixture, unplayed, seasonsInProgress] = await Promise.all([
    prisma.fixture.findFirst({
      where: {
        saveId,
        played: false,
        season: { completed: false },
        OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }],
      },
      orderBy: { scheduledAt: "asc" },
      select: { round: true },
    }),
    prisma.fixture.count({ where: { saveId, played: false, season: { completed: false } } }),
    prisma.season.count({ where: { saveId, completed: false } }),
  ]);

  return {
    ...summary,
    startYear: seasonStartYear(summary.currentDate),
    nextRound: nextFixture?.round ?? null,
    seasonFinished: seasonsInProgress > 0 && unplayed === 0,
    windowOpen: transferWindowAt(summary.currentDate) !== null,
  };
}
