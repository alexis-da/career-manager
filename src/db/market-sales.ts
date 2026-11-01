import { marketValueFor } from "../engine/economy";
import type { Position } from "../engine/positions";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { prisma } from "./client";
import { getManagedLineup } from "./lineup";
import { quoteSquad, type ContractTerms } from "./transfers";

/** A player of the managed club out of the eleven, and what a club would pay for him today. */
export type SaleRow = {
  id: string; // PlayerSave.id
  playerKey: string;
  firstName: string;
  lastName: string;
  age: number; // at the save's current date
  position: Position;
  overall: number;
  marketValue: number; // euros, from marketValueFor, never the stored column: the value at his age today
  clubColors: ClubColors; // for the shirt of his face
  terms: ContractTerms; // from quoteSquad
};

export type MarketSales = {
  rows: SaleRow[]; // those with an offer first, the highest first; then the others, best rated first
  offers: number; // rows with an offer
};

/** What sorts a row first: its offer, and any offer before none. */
const offerFee = ({ terms: { sale } }: SaleRow): number => (sale.ok ? sale.fee : -1);

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The players of the managed club out of the eleven it would field in its next match, each with the best AI offer for
 * him today: no offer is ever received, so this is what the market would pay. Read only.
 */
export async function getMarketSales(saveId: string): Promise<MarketSales> {
  const [{ lineup, injuredStarters }, terms, save, club] = await Promise.all([
    getManagedLineup(saveId),
    quoteSquad(saveId),
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
    prisma.clubSave.findFirstOrThrow({
      where: { saveId, isManaged: true },
      select: { id: true, club: { select: { primaryColor: true, secondaryColor: true } } },
    }),
  ]);
  // In a lineup, a player's id is his playerKey. A saved starter out injured is in the eleven he comes back to.
  const eleven = [...lineup.starters.map(({ player }) => player), ...injuredStarters].map((player) => player.id);
  const players = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: club.id, playerKey: { notIn: eleven } },
    select: {
      id: true,
      playerKey: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      position: true,
      overall: true,
      potential: true,
    },
  });

  const clubColors = clubColorsOf(club.club);
  const rows = players
    .map(({ birthDate, potential, ...player }): SaleRow => {
      const age = ageInYears(birthDate, save.currentDate);
      return {
        ...player,
        age,
        marketValue: marketValueFor({ age, overall: player.overall, potential }),
        clubColors,
        terms: getOrThrow(terms, player.id, "contract terms"),
      };
    })
    .sort((a, b) => offerFee(b) - offerFee(a) || b.overall - a.overall || byKey(a.playerKey, b.playerKey));

  return { rows, offers: rows.filter((row) => row.terms.sale.ok).length };
}
