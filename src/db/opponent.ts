import { displayClubName } from "../engine/club-name";
import type { FormationName } from "../engine/formations";
import { averageStarterRating, resolveLineup, type Lineup } from "../engine/lineup";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { getManagedLineup, parseFormation, parseSavedLineup, type LineupPlayer } from "./lineup";

/** Results shown in the opponent's recent form. */
export const OPPONENT_FORM_LENGTH = 5;

export type OpponentResult = {
  date: Date;
  againstName: string;
  atHome: boolean;
  scored: number;
  conceded: number;
};

export type OpponentPreview = {
  matchDate: Date;
  atHome: boolean; // the managed club plays at home
  clubName: string;
  clubColors: ClubColors;
  formation: FormationName;
  lineup: Lineup<LineupPlayer>; // his probable eleven, injuries judged on the match day
  averageRating: number; // mean rating of his starters in their slots
  managedAverageRating: number; // the same for the managed club's lineup of that match
  recent: OpponentResult[]; // his last played matches, most recent first, whatever the season
  topScorer: { name: string; goals: number } | null; // in his squad, this season
};

/**
 * The managed club's next opponent, or the opponent of one of its unplayed fixtures, as he will likely line up: his
 * formation and saved lineup completed automatically (an AI club has neither, so this is the automatic 4-3-3 the
 * matchday plays), his recent results and his top scorer. Null when the managed club has no match left, or when
 * fixtureId is not an unplayed fixture of the managed club.
 */
export async function getOpponentPreview(saveId: string, fixtureId?: string): Promise<OpponentPreview | null> {
  const [save, managed] = await Promise.all([
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
    prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } }),
  ]);
  const next = await prisma.fixture.findFirst({
    where: {
      saveId,
      played: false,
      ...(fixtureId === undefined ? {} : { id: fixtureId }),
      OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }],
    },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true, seasonId: true, homeClubSaveId: true, awayClubSaveId: true },
  });
  if (next === null) {
    return null;
  }
  const atHome = next.homeClubSaveId === managed.id;
  const opponentId = atHome ? next.awayClubSaveId : next.homeClubSaveId;
  const matchDate = next.scheduledAt;

  const [opponent, rows, recentRows, scorer, managedLineup] = await Promise.all([
    prisma.clubSave.findFirstOrThrow({
      where: { id: opponentId, saveId },
      select: { formation: true, lineup: true, club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true } } },
    }),
    prisma.playerSave.findMany({
      where: { saveId, clubSaveId: opponentId },
      orderBy: { playerKey: "asc" },
      select: { playerKey: true, firstName: true, lastName: true, birthDate: true, position: true, overall: true, injuredUntil: true },
    }),
    prisma.fixture.findMany({
      where: { saveId, played: true, OR: [{ homeClubSaveId: opponentId }, { awayClubSaveId: opponentId }] },
      orderBy: { scheduledAt: "desc" },
      take: OPPONENT_FORM_LENGTH,
      select: {
        scheduledAt: true,
        homeClubSaveId: true,
        homeGoals: true,
        awayGoals: true,
        homeClubSave: { select: { club: { select: { slug: true, name: true } } } },
        awayClubSave: { select: { club: { select: { slug: true, name: true } } } },
      },
    }),
    prisma.playerSeasonStats.findFirst({
      where: { saveId, seasonId: next.seasonId, goals: { gt: 0 }, playerSave: { saveId, clubSaveId: opponentId } },
      orderBy: [{ goals: "desc" }, { assists: "desc" }, { playerSave: { playerKey: "asc" } }],
      select: { goals: true, playerSave: { select: { firstName: true, lastName: true } } },
    }),
    getManagedLineup(saveId),
  ]);

  const players: LineupPlayer[] = rows.map(({ playerKey, birthDate, ...row }) => ({
    ...row,
    id: playerKey,
    age: ageInYears(birthDate, save.currentDate),
    // Same rule as the matchday: a player is out while his injury runs past the match day.
    injured: row.injuredUntil !== null && row.injuredUntil > matchDate,
  }));
  const formation = parseFormation(opponent.formation);
  const lineup = resolveLineup(formation, parseSavedLineup(opponent.lineup), players);

  return {
    matchDate,
    atHome,
    clubName: displayClubName(opponent.club),
    clubColors: clubColorsOf(opponent.club),
    formation,
    lineup,
    averageRating: averageStarterRating(lineup),
    managedAverageRating: averageStarterRating(managedLineup.lineup),
    recent: recentRows.map((fixture) => {
      const home = fixture.homeClubSaveId === opponentId;
      return {
        date: fixture.scheduledAt,
        againstName: displayClubName((home ? fixture.awayClubSave : fixture.homeClubSave).club),
        atHome: home,
        scored: (home ? fixture.homeGoals : fixture.awayGoals) ?? 0,
        conceded: (home ? fixture.awayGoals : fixture.homeGoals) ?? 0,
      };
    }),
    topScorer:
      scorer === null
        ? null
        : { name: `${scorer.playerSave.firstName} ${scorer.playerSave.lastName}`, goals: scorer.goals },
  };
}
