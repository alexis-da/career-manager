import { displayClubName } from "../engine/club-name";
import { isSuspended } from "../engine/discipline";
import { chooseFormation } from "../engine/formation-choice";
import type { FormationName } from "../engine/formations";
import { averageStarterRating, type Lineup, type SquadPlayer } from "../engine/lineup";
import { formationStrength, type TeamStrength } from "../engine/strength";
import { competitionTier } from "../engine/tiers";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { DISCIPLINE_SELECT } from "./discipline-view";
import { getManagedLineup, type LineupPlayer } from "./lineup";
import { fitnessAtKickOff } from "./fitness-view";

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
  lineup: Lineup<LineupPlayer & SquadPlayer>; // his probable eleven, injuries judged on the match day, suspensions for its competition
  averageRating: number; // mean rating of his starters in their slots
  strength: TeamStrength; // his eleven's attack and defense, as the engine plays them (strength.ts)
  managedAverageRating: number; // the same for the managed club's lineup of that match
  recent: OpponentResult[]; // his last played matches, most recent first, whatever the season
  topScorer: { name: string; goals: number } | null; // in his squad, this season
};

/**
 * The managed club's next opponent, or the opponent of one of its unplayed fixtures, as he will likely line up: the
 * formation he chooses and his eleven in it, as the matchday picks an AI club's (chooseFormation), its tired players
 * rested (selectRestedLineup) and its suspended ones out (withSuspensions), his recent results and his top scorer.
 * Null when the managed club has no match left, or when fixtureId is not an unplayed fixture of the managed club.
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
    select: {
      scheduledAt: true,
      season: { select: { startYear: true, competition: { select: { kind: true } } } },
      homeClubSaveId: true,
      awayClubSaveId: true,
    },
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
      select: {
        competition: { select: { tier: true } },
        club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true } },
      },
    }),
    prisma.playerSave.findMany({
      where: { saveId, clubSaveId: opponentId },
      orderBy: { playerKey: "asc" },
      select: {
        playerKey: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        position: true,
        overall: true,
        pace: true,
        shooting: true,
        passing: true,
        dribbling: true,
        defending: true,
        physical: true,
        goalkeeping: true,
        form: true,
        morale: true,
        injuredUntil: true,
        fitness: true,
        ...DISCIPLINE_SELECT,
      },
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
      // Its league season's scorer, cup match or not: the cup keeps the stats of the managed club's players only.
      where: {
        saveId,
        season: { saveId, startYear: next.season.startYear, competition: { kind: "LEAGUE" } },
        goals: { gt: 0 },
        playerSave: { saveId, clubSaveId: opponentId },
      },
      orderBy: [{ goals: "desc" }, { assists: "desc" }, { playerSave: { playerKey: "asc" } }],
      select: { goals: true, playerSave: { select: { firstName: true, lastName: true } } },
    }),
    getManagedLineup(saveId),
  ]);

  // What the engine weighs each one by, his strength's attributes included.
  const players: (LineupPlayer & SquadPlayer)[] = rows.map((row) => ({
    id: row.playerKey,
    firstName: row.firstName,
    lastName: row.lastName,
    position: row.position,
    overall: row.overall,
    pace: row.pace,
    shooting: row.shooting,
    passing: row.passing,
    dribbling: row.dribbling,
    defending: row.defending,
    physical: row.physical,
    goalkeeping: row.goalkeeping,
    form: row.form,
    morale: row.morale,
    injuredUntil: row.injuredUntil,
    age: ageInYears(row.birthDate, save.currentDate),
    // Same rule as the matchday: a player is out while his injury runs past the match day.
    injured: row.injuredUntil !== null && row.injuredUntil > matchDate,
    // And while suspended for the match's competition (withSuspensions), unless his club plays before and he serves it
    // there: the preview does not show it.
    suspended: isSuspended(row, next.season.competition.kind),
    // Rested until then, unless his club plays before: the preview does not show it.
    fitness: fitnessAtKickOff(row.fitness, save.currentDate, matchDate),
  }));
  // The formation he chooses for this squad, as the matchday will (chooseFormation), and his eleven in it.
  const { formation, lineup } = chooseFormation(players, competitionTier(opponent.competition.tier));

  return {
    matchDate,
    atHome,
    clubName: displayClubName(opponent.club),
    clubColors: clubColorsOf(opponent.club),
    formation,
    lineup,
    averageRating: averageStarterRating(lineup),
    strength: formationStrength(lineup, formation),
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
