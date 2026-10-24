import { seasonStartYear, transferWindowAt } from "../engine/world";
import { worldVersionOf, type WorldVersion } from "../engine/world-version";
import { prisma } from "./client";
import { hasCup } from "./cup-view";
import { getSaveSummary, type SaveSummary } from "./saves";

export type SaveHeader = SaveSummary & {
  startYear: number;
  // The managed club's next fixture: its matchday, or its cup round; null once its season is over.
  nextStage: { round: number; cup: boolean } | null;
  seasonFinished: boolean; // every fixture of the seasons in progress is played
  windowOpen: boolean;
  liveMatch: boolean; // the managed club's match waits at half-time
  competitionName: string; // the managed club's competition now: « France — Division 2 »
  worldVersion: WorldVersion;
  hasCup: boolean; // a worldVersion 2 save with the national cups: « Coupe » in its navigation
};

/** What the navigation bar of a save shows, or null when the save does not exist. */
export async function getSaveHeader(saveId: string): Promise<SaveHeader | null> {
  const summary = await getSaveSummary(saveId);
  if (summary === null) {
    return null;
  }
  const managed = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, competition: { select: { name: true } } },
  });
  const [nextFixture, unplayed, seasonsInProgress, save, withCup] = await Promise.all([
    prisma.fixture.findFirst({
      where: {
        saveId,
        played: false,
        season: { completed: false },
        OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }],
      },
      orderBy: { scheduledAt: "asc" },
      select: { round: true, season: { select: { competition: { select: { kind: true } } } } },
    }),
    prisma.fixture.count({ where: { saveId, played: false, season: { completed: false } } }),
    prisma.season.count({ where: { saveId, completed: false } }),
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true, worldVersion: true } }),
    hasCup(saveId),
  ]);

  return {
    ...summary,
    startYear: seasonStartYear(summary.currentDate),
    nextStage: nextFixture === null ? null : { round: nextFixture.round, cup: nextFixture.season.competition.kind === "CUP" },
    seasonFinished: seasonsInProgress > 0 && unplayed === 0,
    windowOpen: transferWindowAt(summary.currentDate) !== null,
    liveMatch: save.liveFixtureId !== null,
    competitionName: managed.competition.name,
    worldVersion: worldVersionOf(save.worldVersion),
    hasCup: withCup,
  };
}
