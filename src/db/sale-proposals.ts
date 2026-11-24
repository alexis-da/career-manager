import * as z from "zod";
import { displayClubName } from "../engine/club-name";
import { formationPositions } from "../engine/formations";
import { marketValueFor } from "../engine/economy";
import type { Position } from "../engine/positions";
import { saleProposalPeriod, saleProposals, SALE_PROPOSAL_MIN_CLUB_MATCHES } from "../engine/sale-proposals";
import { transferWindowCloseDate } from "../engine/world";
import { youthIntakeYear } from "../engine/youth";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { parseFormation } from "./lineup";
import { readArchivedYear } from "./season-archive";
import { quoteSquadWithBuyers, sellPlayer, type TransferOutcome } from "./transfers";

// The sales the assistant proposes in a transfer window (docs/design/simplification.md § 5): the players of the managed
// club who never play, read here, weighed by the pure rule of src/engine/sale-proposals.ts. Read only, but for « Garder »
// (keepSaleProposal). A proposal is accepted by sellPlayer at the offer its card shows (expected), never at another.

type Db = PrismaClient | Prisma.TransactionClient;

/** A sale the assistant proposes: the player, his figures over the period, and the best offer for him today. */
export type SaleProposal = {
  id: string; // PlayerSave.id
  playerKey: string;
  firstName: string;
  lastName: string;
  position: Position;
  overall: number;
  age: number; // at the save's current date
  marketValue: number; // euros, from marketValueFor: the value at his age today
  clubColors: ClubColors; // for the shirt of his face
  starts: number; // official starts for the club in the period
  minutes: number; // official minutes for the club in the period
  offer: { fee: number; buyerId: string; buyerName: string }; // buyerId: ClubSave.id, which the sale checks
};

export type SaleProposals = {
  // The period the figures cover: the season in progress (a winter window, « cette saison ») or the completed one (a
  // summer window, « la saison dernière »); null outside a window, when nothing is proposed.
  period: "season" | "last-season" | null;
  proposals: SaleProposal[]; // the best offer first, SALE_PROPOSALS_SHOWN at most
};

const NOTHING: SaleProposals = { period: null, proposals: [] };

/** A player's official starts and minutes for the club over the period. */
type Figures = { starts: number; minutes: number };

/**
 * The club's official matches played in a season's year, every competition (league, cup, Europe), and its players'
 * starts and minutes in them. An archived season is read from its archive, never its rows (src/db/season-archive.ts).
 */
async function periodFigures(
  db: Db,
  saveId: string,
  clubSaveId: string,
  startYear: number,
  playerSaveIds: readonly string[],
): Promise<{ clubMatches: number; byPlayer: Map<string, Figures> }> {
  const players = new Set(playerSaveIds);
  const byPlayer = new Map<string, Figures>();
  const add = (playerSaveId: string, starts: number, minutes: number): void => {
    if (!players.has(playerSaveId)) {
      return;
    }
    const figures = byPlayer.get(playerSaveId) ?? { starts: 0, minutes: 0 };
    byPlayer.set(playerSaveId, { starts: figures.starts + starts, minutes: figures.minutes + minutes });
  };

  const seasons = await db.season.findMany({ where: { saveId, startYear }, select: { id: true } });
  const { archivedIds, ofClub } = await readArchivedYear(db, saveId, startYear, clubSaveId);
  const archived = new Set(archivedIds);
  const live = seasons.map((season) => season.id).filter((id) => !archived.has(id));

  let clubMatches = 0;
  for (const season of ofClub) {
    clubMatches += season.fixtures.filter(
      (fixture) => fixture.played && (fixture.homeClubSaveId === clubSaveId || fixture.awayClubSaveId === clubSaveId),
    ).length;
    for (const stat of season.stats) {
      add(stat.playerSaveId, stat.starts, stat.minutes);
    }
  }
  if (live.length > 0) {
    clubMatches += await db.fixture.count({
      where: { saveId, seasonId: { in: live }, played: true, OR: [{ homeClubSaveId: clubSaveId }, { awayClubSaveId: clubSaveId }] },
    });
    const stats = await db.playerSeasonStats.findMany({
      where: { saveId, seasonId: { in: live }, playerSaveId: { in: [...players] } },
      select: { playerSaveId: true, starts: true, minutes: true },
    });
    for (const stat of stats) {
      add(stat.playerSaveId, stat.starts, stat.minutes);
    }
  }
  return { clubMatches, byPlayer };
}

/**
 * The sales the managed club's assistant proposes today, the best offer first (docs/design/simplification.md § 5.1):
 * none outside a window, nor over a period of fewer than SALE_PROPOSAL_MIN_CLUB_MATCHES official matches of the club.
 * A player is at the club the whole period when he joined it on its first day at the latest: no transfer to the club
 * after it, nor a young player of a later intake. A player under the resale cap is never proposed: his offer is capped.
 */
export async function getSaleProposals(saveId: string): Promise<SaleProposals> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const period = saleProposalPeriod(save.currentDate);
  if (period === null) {
    return NOTHING;
  }
  const label = period.inProgress ? "season" : "last-season";
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, clubId: true, formation: true, club: { select: { primaryColor: true, secondaryColor: true } } },
  });
  const players = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: club.id },
    select: {
      id: true,
      playerKey: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      position: true,
      overall: true,
      potential: true,
      saleKeptUntil: true,
    },
  });
  const ids = players.map((player) => player.id);
  const { clubMatches, byPlayer } = await periodFigures(prisma, saveId, club.id, period.startYear, ids);
  // The cheap reads first: a period too short proposes nothing, and the offers are not worth asking for.
  if (clubMatches < SALE_PROPOSAL_MIN_CLUB_MATCHES) {
    return { period: label, proposals: [] };
  }
  const arrivals = await prisma.transfer.findMany({
    where: { saveId, playerSaveId: { in: ids }, toClubId: club.clubId, date: { gt: period.start } },
    select: { playerSaveId: true },
  });
  const arrivedSince = new Set(arrivals.map((arrival) => arrival.playerSaveId));
  const { terms, buyers } = await quoteSquadWithBuyers(saveId);

  const candidates = players.map((player) => {
    const intake = youthIntakeYear(player.playerKey);
    const quote = terms.get(player.id);
    const buyerId = buyers.get(player.id);
    const sale = quote?.sale;
    const figures = byPlayer.get(player.id) ?? { starts: 0, minutes: 0 };
    const age = ageInYears(player.birthDate, save.currentDate);
    return {
      // In a lineup, a player's id is his playerKey.
      id: player.playerKey,
      position: player.position,
      overall: player.overall,
      injured: false,
      age,
      potential: player.potential,
      ...figures,
      atClubWholePeriod: !arrivedSince.has(player.id) && (intake === null || intake <= period.startYear),
      academyLocked: quote !== undefined && quote.academyUntil !== null,
      keptUntil: player.saleKeptUntil,
      offer:
        sale?.ok === true && sale.resaleCap === undefined && buyerId !== undefined ? { fee: sale.fee, buyerId, buyerName: sale.buyerName } : null,
      player,
    };
  });

  const proposed = saleProposals({
    date: save.currentDate,
    clubMatches,
    formation: formationPositions(parseFormation(club.formation)),
    squad: candidates,
  });
  const clubColors = clubColorsOf(club.club);
  return {
    period: label,
    proposals: proposed.flatMap(({ player, age, starts, minutes, offer }) =>
      offer === null
        ? []
        : [
            {
              id: player.id,
              playerKey: player.playerKey,
              firstName: player.firstName,
              lastName: player.lastName,
              position: player.position,
              overall: player.overall,
              age,
              marketValue: marketValueFor({ age, overall: player.overall, potential: player.potential }),
              clubColors,
              starts,
              minutes,
              offer,
            },
          ],
    ),
  };
}

export const acceptSaleProposalSchema = z.object({
  saveId: z.string().min(1),
  playerSaveId: z.string().min(1),
  fee: z.number().int().min(0),
  buyerId: z.string().min(1),
});
export const keepSaleProposalSchema = z.object({ saveId: z.string().min(1), playerSaveId: z.string().min(1) });

export type AcceptSaleProposalInput = z.input<typeof acceptSaleProposalSchema>;

/** A proposed sale made, with the names its confirmation gives, or the refusal of sellPlayer. */
export type AcceptedSale = { ok: true; fee: number; player: string; club: string } | Extract<TransferOutcome, { ok: false }>;

/**
 * « Vendre · 3,4 M€ » of a proposed sale (§ 5.2): sold at once at the offer its card shows (fee and buyer), never at
 * another (sellPlayer with expected: offer_changed, and the offer now).
 */
export async function acceptSaleProposal(input: AcceptSaleProposalInput): Promise<AcceptedSale> {
  const { saveId, playerSaveId, fee, buyerId } = acceptSaleProposalSchema.parse(input);
  const outcome = await sellPlayer({ saveId, playerSaveId, expected: { fee, buyerId } });
  if (!outcome.ok) {
    return outcome;
  }
  const [player, buyer] = await Promise.all([
    prisma.playerSave.findFirstOrThrow({ where: { id: playerSaveId, saveId }, select: { lastName: true } }),
    prisma.clubSave.findFirstOrThrow({ where: { id: buyerId, saveId }, select: { club: { select: { slug: true, name: true } } } }),
  ]);
  return { ok: true, fee: outcome.fee, player: player.lastName, club: displayClubName(buyer.club) };
}

/**
 * « Garder » (§ 5.2): the player is not proposed again before the window closes. His name, which the confirmation gives;
 * null when no window is open or he is not a player of the managed club, nothing written then.
 */
export async function keepSaleProposal(saveId: string, playerSaveId: string): Promise<string | null> {
  const [save, club] = await Promise.all([
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
    prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } }),
  ]);
  const closes = transferWindowCloseDate(save.currentDate);
  if (closes === null) {
    return null;
  }
  const kept = await prisma.playerSave.updateManyAndReturn({
    where: { id: playerSaveId, saveId, clubSaveId: club.id },
    data: { saleKeptUntil: closes },
    select: { lastName: true },
  });
  return kept[0]?.lastName ?? null;
}
