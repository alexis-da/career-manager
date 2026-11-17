import { displayClubName } from "../engine/club-name";
import { EUROPE_FINAL_ROUND, type EuropeCode } from "../engine/europe";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { prisma } from "./client";
import { europeCodeOf } from "./europe";
import { clubOf, clubsOfSave, readArchivedSeason } from "./season-archive";

// What a season's review shows of the European competitions beside the managed club's own run: each competition's
// winner that year. Reads only, scoped by saveId; a completed season's from its archive once it has one, its Fixture
// rows being then deleted or never read again (src/db/season-archive.ts), as the cup's winner (getCupWinnerName).

type Db = PrismaClient | Prisma.TransactionClient;

/** A European competition's winner of a season: by its displayed name, and whether it is the managed club. */
export type EuropeWinner = { code: EuropeCode; club: string; managed: boolean };

type WinnerClub = { isManaged: boolean; club: { slug: string; name: string } };

/** The club that won a European season's final (EUROPE_FINAL_ROUND, its shoot-out included); null before it is played. */
async function finalWinnerOf(db: Db, saveId: string, seasonId: string): Promise<WinnerClub | null> {
  const archived = await readArchivedSeason(db, saveId, seasonId);
  if (archived !== null) {
    const winnerId = archived.fixtures.find((fixture) => fixture.round === EUROPE_FINAL_ROUND && fixture.played)?.winnerClubSaveId ?? null;
    if (winnerId === null) {
      return null;
    }
    const clubs = await clubsOfSave(db, saveId, [winnerId]);
    return clubOf(clubs, winnerId);
  }
  const final = await db.fixture.findFirst({
    where: { saveId, seasonId, round: EUROPE_FINAL_ROUND, played: true },
    select: { winnerClubSave: { select: { isManaged: true, club: { select: { slug: true, name: true } } } } },
  });
  return final?.winnerClubSave ?? null;
}

/**
 * The winners of the European competitions of a season, by its start year, the Coupe des Lauriers (eu.1) first: each
 * competition of the save that year whose final is played. Empty without one (a worldVersion 1 save, a challenge save,
 * a season before the save had them). One query after the other.
 */
export async function getEuropeWinners(saveId: string, startYear: number, db: Db = prisma): Promise<EuropeWinner[]> {
  const seasons = await db.season.findMany({
    where: { saveId, startYear, competition: { kind: "EUROPE" } },
    orderBy: { competition: { code: "asc" } },
    select: { id: true, competition: { select: { code: true } } },
  });
  const winners: EuropeWinner[] = [];
  for (const season of seasons) {
    const winner = await finalWinnerOf(db, saveId, season.id);
    if (winner !== null) {
      winners.push({ code: europeCodeOf(season.competition.code), club: displayClubName(winner.club), managed: winner.isManaged });
    }
  }
  return winners;
}
