import { displayClubName } from "../engine/club-name";
import { seasonStartYear, transferWindowAt } from "../engine/world";
import { worldVersionOf, type WorldVersion } from "../engine/world-version";
import { prisma } from "./client";
import { hasCup } from "./cup-view";
import { getSaveSummary, type SaveSummary } from "./saves";

const NAMED_CLUB = { select: { club: { select: { slug: true, name: true } } } };

export type SaveHeader = SaveSummary & {
  startYear: number;
  // The managed club's next fixture: its matchday, or its cup round; null once its season is over.
  nextStage: { round: number; cup: boolean } | null;
  // The same fixture for the sidebar's card.
  nextMatch: { date: Date; atHome: boolean; opponent: string } | null;
  seasonFinished: boolean; // every fixture of the seasons in progress is played
  windowOpen: boolean;
  liveMatch: boolean; // the managed club's match waits at half-time
  competitionCode: string; // the managed club's competition now: « fr.2 », named by the screens
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
    select: { id: true, competition: { select: { code: true } } },
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
      select: {
        round: true,
        scheduledAt: true,
        homeClubSaveId: true,
        homeClubSave: NAMED_CLUB,
        awayClubSave: NAMED_CLUB,
        season: { select: { competition: { select: { kind: true } } } },
      },
    }),
    prisma.fixture.count({ where: { saveId, played: false, season: { completed: false } } }),
    prisma.season.count({ where: { saveId, completed: false } }),
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true, worldVersion: true } }),
    hasCup(saveId),
  ]);

  const atHome = nextFixture?.homeClubSaveId === managed.id;
  return {
    ...summary,
    startYear: seasonStartYear(summary.currentDate),
    nextStage: nextFixture === null ? null : { round: nextFixture.round, cup: nextFixture.season.competition.kind === "CUP" },
    nextMatch:
      nextFixture === null
        ? null
        : {
            date: nextFixture.scheduledAt,
            atHome,
            opponent: displayClubName((atHome ? nextFixture.awayClubSave : nextFixture.homeClubSave).club),
          },
    seasonFinished: seasonsInProgress > 0 && unplayed === 0,
    windowOpen: transferWindowAt(summary.currentDate) !== null,
    liveMatch: save.liveFixtureId !== null,
    competitionCode: managed.competition.code,
    worldVersion: worldVersionOf(save.worldVersion),
    hasCup: withCup,
  };
}
