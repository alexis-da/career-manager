import { displayClubName } from "../engine/club-name";
import { nextTransferWindowOpening, seasonStartYear, transferWindowAt } from "../engine/world";
import { prisma } from "./client";
import { getPlayerProfiles, type PlayerProfile } from "./players";
import { quoteSquad, type ContractTerms } from "./transfers";

export type SquadPlayerView = PlayerProfile & {
  terms: ContractTerms;
};

export type SquadView = {
  currentDate: Date;
  startYear: number;
  windowOpen: boolean;
  nextWindowOpensOn: Date;
  club: { name: string; budget: number; wageBudget: number; payroll: number };
  players: SquadPlayerView[];
};

/** The managed club's squad with, for each player, his sheet and the terms of renewal, release and sale. */
export async function getSquadView(saveId: string): Promise<SquadView> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, budget: true, wageBudget: true, club: { select: { slug: true, name: true } } },
  });

  const [players, terms, payroll] = await Promise.all([
    getPlayerProfiles(saveId, { clubSaveId: club.id }),
    quoteSquad(saveId),
    prisma.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } }),
  ]);

  return {
    currentDate: save.currentDate,
    startYear: seasonStartYear(save.currentDate),
    windowOpen: transferWindowAt(save.currentDate) !== null,
    nextWindowOpensOn: nextTransferWindowOpening(save.currentDate),
    club: { name: displayClubName(club.club), budget: club.budget, wageBudget: club.wageBudget, payroll: payroll._sum.wage ?? 0 },
    players: players.map((player) => {
      const playerTerms = terms.get(player.id);
      if (playerTerms === undefined) {
        throw new Error(`No contract terms for player ${player.id}`);
      }
      return { ...player, terms: playerTerms };
    }),
  };
}
