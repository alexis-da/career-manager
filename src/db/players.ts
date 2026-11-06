import { displayClubName } from "../engine/club-name";
import type { AttributeName } from "../engine/generation";
import type { Position } from "../engine/positions";
import { seasonEndDate, seasonStartYear } from "../engine/world";
import { youthKeyPrefix } from "../engine/youth";
import type { Prisma } from "../generated/prisma/client";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { DISCIPLINE_SELECT, disciplineStatus, matchesAhead, type DisciplineStatus, type MatchesAhead } from "./discipline-view";
import { fitnessAtKickOff } from "./fitness-view";

/**
 * What the managed club still has to play: its next match, its day and competition, null once it has none left, and the
 * competitions it still has a match in. What its players are picked for, and judged on: fitness, injuries, suspensions.
 * Its fixtures are read by its id, on the home and away indexes (a filter on its ClubSave row would read every fixture
 * of the save); the caller who already has its id passes it.
 */
export async function managedMatchesAhead(saveId: string, managedClubSaveId?: string): Promise<MatchesAhead> {
  const clubSaveId =
    managedClubSaveId ??
    (await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } })).id;
  const fixtures = await prisma.fixture.findMany({
    where: { saveId, played: false, OR: [{ homeClubSaveId: clubSaveId }, { awayClubSaveId: clubSaveId }] },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true, season: { select: { competition: { select: { kind: true } } } } },
  });
  return matchesAhead(fixtures.map(({ scheduledAt, season }) => ({ date: scheduledAt, competition: season.competition.kind })));
}

export type TransferKind = "TRANSFER" | "LOAN" | "FREE" | "RETIREMENT";

export type SeasonStatsView = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

export type TransferHistoryItem = {
  id: string;
  date: Date;
  type: TransferKind;
  fee: number;
  fromClubName: string | null;
  toClubName: string | null;
};

/** What the player sheet shows of a player, wherever he plays. */
export type PlayerProfile = {
  id: string;
  playerKey: string;
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: Date;
  age: number;
  position: Position;
  clubName: string | null; // current club; null for a free agent or a retired player
  clubColors: ClubColors | null; // colors of the current club, for the shirt of his face
  overall: number;
  potential: number;
  form: number;
  // 0–100: a player of the managed club's at the kick-off of its next match (fitnessAtKickOff), the lineup page's figure;
  // anyone else's, or once the club has no match left, today's. Morale is no screen's: it is not read.
  fitness: number;
  fitnessAtNextMatch: boolean; // the fitness is the next match's
  // A player of the managed club's suspensions and yellow cards at risk, against its next match and the competitions it
  // still plays (disciplineStatus); null for anyone else's, whose club's matches are not read.
  discipline: DisciplineStatus | null;
  marketValue: number; // euros, as stored: set when the player enters the save, recomputed at each season transition
  wage: number;
  contractUntil: Date | null;
  injuredUntil: Date | null; // only while still injured at the current date
  contractExpiring: boolean; // the contract ends with the current season
  arrivedThisSeason: boolean; // young player who joined at this season's preseason
  attributes: Record<AttributeName, number>;
  seasonStats: SeasonStatsView;
  transfers: TransferHistoryItem[]; // most recent first
};

const EMPTY_STATS: SeasonStatsView = { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

/**
 * Profiles of the save's players matching `where`: identity, ratings, condition, contract, statistics of the
 * current season and transfer history. The save's id always scopes the query, whatever `where` says.
 */
export async function getPlayerProfiles(saveId: string, where: Prisma.PlayerSaveWhereInput): Promise<PlayerProfile[]> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const startYear = seasonStartYear(save.currentDate);

  const players = await prisma.playerSave.findMany({
    where: { ...where, saveId },
    select: {
      id: true,
      playerKey: true,
      firstName: true,
      lastName: true,
      nationality: true,
      birthDate: true,
      position: true,
      overall: true,
      potential: true,
      pace: true,
      shooting: true,
      passing: true,
      dribbling: true,
      defending: true,
      physical: true,
      goalkeeping: true,
      form: true,
      fitness: true,
      marketValue: true,
      wage: true,
      contractUntil: true,
      injuredUntil: true,
      ...DISCIPLINE_SELECT,
      clubSave: {
        select: { isManaged: true, club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true } } },
      },
    },
  });
  const playerIds = players.map((player) => player.id);

  // The managed club's players are picked for its next match: their fitness and their suspensions are that match's. Read
  // only when one of them is among the players.
  const ahead = players.some((player) => player.clubSave?.isManaged === true) ? await managedMatchesAhead(saveId) : null;
  const nextMatchDay = ahead?.next?.date ?? null;

  const [stats, transfers] = await Promise.all([
    prisma.playerSeasonStats.groupBy({
      by: ["playerSaveId"],
      where: { saveId, playerSaveId: { in: playerIds }, season: { startYear } },
      _sum: { appearances: true, minutes: true, goals: true, assists: true, yellowCards: true, redCards: true },
    }),
    prisma.transfer.findMany({
      where: { saveId, playerSaveId: { in: playerIds } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      select: { id: true, playerSaveId: true, date: true, type: true, fee: true, fromClubId: true, toClubId: true },
    }),
  ]);

  const clubIds = [...new Set(transfers.flatMap((transfer) => [transfer.fromClubId, transfer.toClubId]))].filter(
    (id): id is string => id !== null,
  );
  const clubs = await prisma.club.findMany({ where: { id: { in: clubIds } }, select: { id: true, slug: true, name: true } });
  const clubName = new Map(clubs.map((row) => [row.id, displayClubName(row)]));
  const statsByPlayer = new Map(stats.map((row) => [row.playerSaveId, row._sum]));
  const lastContractDay = seasonEndDate(startYear);
  const youthPrefix = youthKeyPrefix(startYear);

  return players.map((player) => {
    const playerStats = statsByPlayer.get(player.id);
    const managed = player.clubSave?.isManaged === true;
    const atNextMatch = managed && nextMatchDay !== null;
    return {
      id: player.id,
      playerKey: player.playerKey,
      firstName: player.firstName,
      lastName: player.lastName,
      nationality: player.nationality,
      birthDate: player.birthDate,
      age: ageInYears(player.birthDate, save.currentDate),
      position: player.position,
      clubName: player.clubSave === null ? null : displayClubName(player.clubSave.club),
      clubColors: player.clubSave === null ? null : clubColorsOf(player.clubSave.club),
      overall: player.overall,
      potential: player.potential,
      form: player.form,
      fitness: atNextMatch ? fitnessAtKickOff(player.fitness, save.currentDate, nextMatchDay) : player.fitness,
      fitnessAtNextMatch: atNextMatch,
      discipline: managed && ahead !== null ? disciplineStatus(player, ahead) : null,
      marketValue: player.marketValue,
      wage: player.wage,
      contractUntil: player.contractUntil,
      injuredUntil: player.injuredUntil !== null && player.injuredUntil > save.currentDate ? player.injuredUntil : null,
      contractExpiring: player.contractUntil !== null && player.contractUntil <= lastContractDay,
      arrivedThisSeason: player.playerKey.startsWith(youthPrefix),
      attributes: {
        pace: player.pace,
        shooting: player.shooting,
        passing: player.passing,
        dribbling: player.dribbling,
        defending: player.defending,
        physical: player.physical,
        goalkeeping: player.goalkeeping,
      },
      seasonStats:
        playerStats === undefined
          ? EMPTY_STATS
          : {
              appearances: playerStats.appearances ?? 0,
              minutes: playerStats.minutes ?? 0,
              goals: playerStats.goals ?? 0,
              assists: playerStats.assists ?? 0,
              yellowCards: playerStats.yellowCards ?? 0,
              redCards: playerStats.redCards ?? 0,
            },
      transfers: transfers
        .filter((transfer) => transfer.playerSaveId === player.id)
        .map((transfer) => ({
          id: transfer.id,
          date: transfer.date,
          type: transfer.type,
          fee: transfer.fee,
          fromClubName: transfer.fromClubId === null ? null : (clubName.get(transfer.fromClubId) ?? null),
          toClubName: transfer.toClubId === null ? null : (clubName.get(transfer.toClubId) ?? null),
        })),
    };
  });
}
