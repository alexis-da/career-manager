import { prisma } from "./client";

export type ClubFinances = {
  budget: number; // euros
  wageBudget: number; // euros per season
  payroll: number; // euros per season
  wageRoom: number; // euros per season left under the wage budget, negative above it
};

/** The managed club's money, as the Club screen shows it. */
export async function getClubFinances(saveId: string): Promise<ClubFinances> {
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, budget: true, wageBudget: true },
  });
  const wages = await prisma.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } });
  const payroll = wages._sum.wage ?? 0;
  return { budget: club.budget, wageBudget: club.wageBudget, payroll, wageRoom: club.wageBudget - payroll };
}

/** The name the player manages the save under. */
export async function getManagerName(saveId: string): Promise<string> {
  const { managerName } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { managerName: true } });
  return managerName;
}
