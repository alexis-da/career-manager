import { displayClubName } from "../engine/club-name";
import { seasonStartYear, transferWindowAt } from "../engine/world";
import { worldVersionOf, type WorldVersion } from "../engine/world-version";
import { prisma } from "./client";
import { hasCup } from "./cup-view";
import { hasEurope } from "./europe-view";
import { getSaveSummary, type SaveSummary } from "./saves";

const NAMED_CLUB = { select: { club: { select: { slug: true, name: true } } } };

export type SaveHeader = SaveSummary & {
  startYear: number;
  // The managed club's next fixture: its matchday, its cup round, or its European round (told by its competition's
  // code, « eu.1 »); null once its season is over.
  nextStage: { round: number; cup: boolean; competitionCode: string } | null;
  // The same fixture for the sidebar's card.
  nextMatch: { date: Date; atHome: boolean; opponent: string } | null;
  seasonFinished: boolean; // every fixture of the seasons in progress is played
  windowOpen: boolean;
  liveMatch: boolean; // the managed club's match waits at half-time
  competitionCode: string; // the managed club's competition now: « fr.2 », named by the screens
  worldVersion: WorldVersion;
  hasCup: boolean; // a worldVersion 2 save with the national cups: « Coupe » in its navigation
  hasEurope: boolean; // a save with a European season: « Europe » in its navigation
  hasNations: boolean; // a save with national teams (Save.breaksFrom): « Sélections » in its navigation
  // The first date of an international break the save plays before the managed club's next match: « Prochain match »
  // stops after it (playUntilNextMatch), and says so; null otherwise.
  nextBreak: Date | null;
};

/** What the navigation bar of a save shows, or null when the save does not exist. */
export async function getSaveHeader(saveId: string): Promise<SaveHeader | null> {
  const summary = await getSaveSummary(saveId);
  if (summary === null) {
    return null;
  }
  const [managed, seasonsInProgress, save, withCup, withEurope] = await Promise.all([
    prisma.clubSave.findFirstOrThrow({
      where: { saveId, isManaged: true },
      select: { id: true, competition: { select: { code: true } } },
    }),
    // By their ids, not by a filter on Season: Postgres would read the seasons in progress of every save.
    prisma.season.findMany({ where: { saveId, completed: false }, select: { id: true } }),
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true, worldVersion: true, breaksFrom: true } }),
    hasCup(saveId),
    hasEurope(saveId),
  ]);
  const inProgress = { in: seasonsInProgress.map((season) => season.id) };
  // A date is played whole (playNextMatchday): no fixture waits before the save's date. Whatever index Postgres takes,
  // its search starts there.
  const ahead = { gte: summary.currentDate };
  const nextFixture = await prisma.fixture.findFirst({
    where: {
      saveId,
      played: false,
      seasonId: inProgress,
      scheduledAt: ahead,
      OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }],
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      round: true,
      scheduledAt: true,
      homeClubSaveId: true,
      homeClubSave: NAMED_CLUB,
      awayClubSave: NAMED_CLUB,
      season: { select: { competition: { select: { kind: true, code: true } } } },
    },
  });
  // A fixture left to play in the seasons in progress: the managed club's next one, or any other, the soonest first on
  // the index (saveId, scheduledAt), from the save's date: the search stops at the first.
  const unplayedLeft =
    nextFixture !== null ||
    (await prisma.fixture.findFirst({
      where: { saveId, played: false, seasonId: inProgress, scheduledAt: ahead },
      orderBy: { scheduledAt: "asc" },
      select: { id: true },
    })) !== null;

  // The next international break, when the save has some: before the managed club's next match, the next step.
  const nextInternational =
    save.breaksFrom === null
      ? null
      : await prisma.internationalMatch.findFirst({
          where: { saveId, played: false, scheduledAt: ahead },
          orderBy: { scheduledAt: "asc" },
          select: { scheduledAt: true },
        });
  const nextBreak =
    nextInternational !== null && (nextFixture === null || nextInternational.scheduledAt < nextFixture.scheduledAt)
      ? nextInternational.scheduledAt
      : null;

  const atHome = nextFixture?.homeClubSaveId === managed.id;
  return {
    ...summary,
    startYear: seasonStartYear(summary.currentDate),
    nextStage:
      nextFixture === null
        ? null
        : {
            round: nextFixture.round,
            cup: nextFixture.season.competition.kind === "CUP",
            competitionCode: nextFixture.season.competition.code,
          },
    nextMatch:
      nextFixture === null
        ? null
        : {
            date: nextFixture.scheduledAt,
            atHome,
            opponent: displayClubName((atHome ? nextFixture.awayClubSave : nextFixture.homeClubSave).club),
          },
    seasonFinished: seasonsInProgress.length > 0 && !unplayedLeft,
    windowOpen: transferWindowAt(summary.currentDate) !== null,
    liveMatch: save.liveFixtureId !== null,
    competitionCode: managed.competition.code,
    worldVersion: worldVersionOf(save.worldVersion),
    hasCup: withCup,
    hasEurope: withEurope,
    hasNations: save.breaksFrom !== null,
    nextBreak,
  };
}
