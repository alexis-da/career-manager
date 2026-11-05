import { NEUTRAL_BUDGET_COEFFICIENT } from "../engine/balance";
import { prisma } from "./client";

/**
 * The board's last dotation to the managed club, as SeasonBudget keeps it on the league season it opened (gameplay v2,
 * V2): the season's budget and how it was made, and its wage cap.
 */
export type ClubDotation = {
  startYear: number; // of its season
  reputation: number; // 1–99, the club's at the season's opening
  reputationRank: number; // by reputation in its division, ties sharing the best rank
  clubCount: number; // in its division that season: the clubs of the season's fixtures
  dotation: number; // euros: the creation's budget at that rank, in that division
  coefficient: number; // hundredths: 100 neutral, 70 to 140 by the objectives of the season before
  objectivesAmount: number; // euros: what the coefficient added to the dotation, negative for a malus
  carryOver: number; // euros: half of the transfer budget left unspent the season before
  budget: number; // euros: the dotation, plus the objectives' amount, plus the carry-over
  wageBudget: number; // euros per season: the wage cap given with it
  first: boolean; // the save's first season: its creation budget, nothing carried over, no objectives
};

export type ClubFinances = {
  budget: number; // euros
  wageBudget: number; // euros per season
  payroll: number; // euros per season
  wageRoom: number; // euros per season left under the wage budget, negative above it
  dotation: ClubDotation | null; // the board's last; null for a save made before the season budgets, until its next season
};

/** The managed club's money, as the Club screen shows it. */
export async function getClubFinances(saveId: string): Promise<ClubFinances> {
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, budget: true, wageBudget: true },
  });
  const [wages, dotation] = await Promise.all([
    prisma.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } }),
    getLatestDotation(saveId),
  ]);
  const payroll = wages._sum.wage ?? 0;
  return { budget: club.budget, wageBudget: club.wageBudget, payroll, wageRoom: club.wageBudget - payroll, dotation };
}

/** The managed club's latest dotation, by its season's start: the current season's, unless the save is older than them. */
async function getLatestDotation(saveId: string): Promise<ClubDotation | null> {
  const row = await prisma.seasonBudget.findFirst({
    where: { saveId },
    orderBy: { season: { startYear: "desc" } },
    select: {
      reputation: true,
      reputationRank: true,
      dotation: true,
      coefficient: true,
      carryOver: true,
      budget: true,
      wageBudget: true,
      season: { select: { id: true, startYear: true } },
    },
  });
  if (row === null) {
    return null;
  }
  const { season, ...dotation } = row;
  const seasonId = season.id;
  const [clubCount, earlierSeasons] = await Promise.all([
    // The clubs of its fixtures, exact for a past season too: a club promoted or relegated since has changed division.
    prisma.clubSave.count({
      where: {
        saveId,
        OR: [{ homeFixtures: { some: { saveId, seasonId } } }, { awayFixtures: { some: { saveId, seasonId } } }],
      },
    }),
    prisma.season.count({ where: { saveId, completed: true, startYear: { lt: season.startYear } } }),
  ]);
  return {
    ...dotation,
    startYear: season.startYear,
    clubCount,
    objectivesAmount: dotation.budget - dotation.carryOver - dotation.dotation,
    first: earlierSeasons === 0 && dotation.carryOver === 0 && dotation.coefficient === NEUTRAL_BUDGET_COEFFICIENT,
  };
}

/** The name the player manages the save under. */
export async function getManagerName(saveId: string): Promise<string> {
  const { managerName } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { managerName: true } });
  return managerName;
}
