import { marketValueFor } from "../engine/economy";
import type { AttributeName, Position } from "../engine/generation";
import { seasonEndDate, seasonStartYear, transferWindowAt } from "../engine/world";
import { youthKeyPrefix } from "../engine/youth";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { quoteSquad, type ContractTerms } from "./transfers";

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

export type SquadPlayerView = {
  id: string;
  playerKey: string;
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: Date;
  age: number;
  position: Position;
  overall: number;
  potential: number;
  form: number;
  morale: number;
  fitness: number;
  marketValue: number; // euros, computed today from rating and age
  wage: number;
  contractUntil: Date | null;
  injuredUntil: Date | null; // only while still injured at the current date
  contractExpiring: boolean; // the contract ends with the current season
  arrivedThisSeason: boolean; // young player who joined at this season's preseason
  attributes: Record<AttributeName, number>;
  seasonStats: SeasonStatsView;
  transfers: TransferHistoryItem[];
  terms: ContractTerms;
};

export type SquadView = {
  currentDate: Date;
  startYear: number;
  windowOpen: boolean;
  club: { name: string; budget: number; wageBudget: number; payroll: number };
  players: SquadPlayerView[];
};

const EMPTY_STATS: SeasonStatsView = { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

/** The managed club's squad with, for each player, his sheet: attributes, season stats, transfers and contract terms. */
export async function getSquadView(saveId: string): Promise<SquadView> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, budget: true, wageBudget: true, club: { select: { name: true } } },
  });
  const startYear = seasonStartYear(save.currentDate);

  const players = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: club.id },
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
      morale: true,
      fitness: true,
      wage: true,
      contractUntil: true,
      injuredUntil: true,
    },
  });
  const playerIds = players.map((player) => player.id);

  const [stats, transfers, terms] = await Promise.all([
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
    quoteSquad(saveId),
  ]);

  const clubIds = [...new Set(transfers.flatMap((transfer) => [transfer.fromClubId, transfer.toClubId]))].filter(
    (id): id is string => id !== null,
  );
  const clubs = await prisma.club.findMany({ where: { id: { in: clubIds } }, select: { id: true, name: true } });
  const clubName = new Map(clubs.map((row) => [row.id, row.name]));
  const statsByPlayer = new Map(stats.map((row) => [row.playerSaveId, row._sum]));
  const lastContractDay = seasonEndDate(startYear);
  const youthPrefix = youthKeyPrefix(startYear);
  const { _sum } = await prisma.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } });

  return {
    currentDate: save.currentDate,
    startYear,
    windowOpen: transferWindowAt(save.currentDate) !== null,
    club: { name: club.club.name, budget: club.budget, wageBudget: club.wageBudget, payroll: _sum.wage ?? 0 },
    players: players.map((player) => {
      const age = ageInYears(player.birthDate, save.currentDate);
      const playerStats = statsByPlayer.get(player.id);
      const playerTerms = terms.get(player.id);
      if (playerTerms === undefined) {
        throw new Error(`No contract terms for player ${player.id}`);
      }
      return {
        id: player.id,
        playerKey: player.playerKey,
        firstName: player.firstName,
        lastName: player.lastName,
        nationality: player.nationality,
        birthDate: player.birthDate,
        age,
        position: player.position,
        overall: player.overall,
        potential: player.potential,
        form: player.form,
        morale: player.morale,
        fitness: player.fitness,
        marketValue: marketValueFor({ age, overall: player.overall, potential: player.potential }),
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
        terms: playerTerms,
      };
    }),
  };
}
