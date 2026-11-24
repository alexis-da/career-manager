import { cache } from "react";
import * as z from "zod";
import { RELEASE_COMPENSATION_SHARE, SALE_MAX_BIDDERS, SQUAD_LIMIT } from "../engine/balance";
import { displayClubName } from "../engine/club-name";
import { contractEndDate, marketValueFor, renewalWage, signingBonus } from "../engine/economy";
import {
  askingPrice,
  biddingOrder,
  evaluateOffer,
  minimumReputation,
  minimumWage,
  resaleCap,
  saleRngSeed,
  walkSaleBids,
  type BidderClub,
  type ClubArrival,
  type OfferClub,
  type OfferPlayer,
  type OfferRefusal,
  type ResaleCap,
  type SaleBid,
} from "../engine/transfer-ai";
import { seasonStartYear, transferWindowAt, transferWindowOpenDate } from "../engine/world";
import type { Prisma } from "../generated/prisma/client";
import { addYears, ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { liveMatchOf, lockSave } from "./matchday";
import { academyLocks } from "./shop";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

const MAX_DATABASE_INT = 2_147_483_647;
const TRANSACTION_OPTIONS = { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: 30_000 };

const idSchema = z.string().min(1);
const feeSchema = z.number().int().min(0).max(MAX_DATABASE_INT);
const wageSchema = z.number().int().min(1).max(MAX_DATABASE_INT);
const yearsSchema = z.number().int().min(1).max(5);

// The wage is optional (docs/design/simplification.md § 1.1): without it, the player's asked wage, the one he always gets
// at least. The screens still send one until they lose their wage fields.
export const playerActionSchema = z.object({ saveId: idSchema, playerSaveId: idSchema });
export const makeTransferOfferSchema = playerActionSchema.extend({ fee: feeSchema, wage: wageSchema.optional(), years: yearsSchema });
export const signFreeAgentSchema = playerActionSchema.extend({ wage: wageSchema.optional(), years: yearsSchema });
export const renewContractSchema = playerActionSchema.extend({ wage: wageSchema.optional(), years: yearsSchema });
export const releasePlayerSchema = playerActionSchema;
// A proposed sale (docs/design/simplification.md § 5.2) names the offer its card showed: sold only at that offer.
export const sellPlayerSchema = playerActionSchema.extend({ expected: z.object({ fee: feeSchema, buyerId: idSchema }).optional() });

export type PlayerActionInput = z.input<typeof playerActionSchema>;
export type MakeTransferOfferInput = z.input<typeof makeTransferOfferSchema>;
export type SignFreeAgentInput = z.input<typeof signFreeAgentSchema>;
export type RenewContractInput = z.input<typeof renewContractSchema>;
export type SellPlayerInput = z.input<typeof sellPlayerSchema>;

export type TransferRefusal =
  | "window_closed"
  | "not_available"
  | "bought_this_window"
  | "insufficient_budget" // a fee, or a free agent's signing bonus, above the budget; a release's compensation too
  | "squad_full" // a purchase or a free signing while the squad has SQUAD_LIMIT players already (§ 1.4)
  | "club_refused"
  | "player_refused" // the club's reputation is too low for him: the only reason a player refuses (OfferRefusal)
  | "no_offer"
  | "academy" // a promising youth of the shop, on his first contract: neither sold nor released (src/db/shop.ts)
  | "match_in_progress" // a sale while a match waits live: its line-up may hold the player (sellPlayer)
  | "offer_changed"; // a proposed sale whose best offer is no longer the one its card showed: nothing is sold

export type TransferOutcome =
  | {
      ok: true;
      fee: number; // euros: the transfer fee, a free agent's signing bonus, or the compensation paid for a release
      budgetChange: number; // change of the managed club's budget
      payrollChange: number; // change of the managed club's wages per season
      wage: number; // euros per season: the player's wage afterwards, his new contract's when he signs or extends
      clubSaveId: string | null; // the player's club afterwards
      contractUntil: Date | null;
    }
  // changedOffer: with offer_changed, the best offer now, which the card shows next.
  | { ok: false; reason: TransferRefusal; refusals: OfferRefusal[]; changedOffer?: { fee: number; buyerName: string } };

export type TransferQuote = {
  // Euros the managed club pays to sign him, out of its budget: his club's asking price; for a free agent, his signing
  // bonus (signingBonus of his market value today, docs/design/simplification.md § 1.3); 0 for a player of the managed club.
  askingPrice: number;
  minimumWage: number; // euros per season the player gets, at least, renewal included: what an offer without a wage pays
  minimumReputation: number; // the lowest reputation of a club he joins; 0 for a player of the managed club
};

/**
 * Best AI bid for a player of the managed club today, or why there is none. resaleCap: he joined the club less than a
 * year ago, bought or signed free, and no club offers more than its cap (resaleCap); absent otherwise.
 */
export type SaleQuote =
  | { ok: true; fee: number; wage: number; years: number; buyerName: string; resaleCap?: ResaleCap["kind"] }
  | { ok: false; reason: Extract<TransferRefusal, "window_closed" | "bought_this_window" | "no_offer" | "academy"> };

/** What each action would take today for a player of the managed club. */
export type ContractTerms = {
  renewalMinimumWage: number; // euros per season
  releaseCost: number; // euros paid to the player
  sale: SaleQuote;
  academyUntil: Date | null; // a promising youth of the shop: the end of his first contract, before which he stays
};

type Tx = Prisma.TransactionClient;

const PLAYER_SELECT = {
  id: true,
  playerKey: true,
  birthDate: true,
  overall: true,
  potential: true,
  wage: true,
  contractUntil: true,
  clubSaveId: true,
} as const;

type PlayerRow = {
  playerKey: string;
  birthDate: Date;
  overall: number;
  potential: number;
  wage: number;
  contractUntil: Date | null;
};

/** What the terms of a move depend on: the player's rating, age, wage and contract. */
type QuotedPlayer = Omit<PlayerRow, "playerKey">;

/** A player of the managed club, as his sale is quoted. */
type SquadPlayer = PlayerRow & { id: string };

/** An AI club that may bid for a player of the managed club, with what a sale to it takes. */
type Bidder = BidderClub & { id: string; clubId: string; name: string };

/** The best AI bid for a player of the managed club, and the club that makes it. */
type BestBid = { bid: SaleBid; buyer: Bidder };

const refused = (reason: TransferRefusal, refusals: OfferRefusal[] = []): TransferOutcome => ({
  ok: false,
  reason,
  refusals,
});

/** Free agents of a save: without a club and not retired (PlayerSave.retired, its index with the club's). */
export const freeAgentWhere = (saveId: string) => ({ saveId, clubSaveId: null, retired: false }) satisfies Prisma.PlayerSaveWhereInput;

function offerPlayer(player: QuotedPlayer, date: Date): OfferPlayer {
  return {
    age: ageInYears(player.birthDate, date),
    overall: player.overall,
    potential: player.potential,
    wage: player.wage,
    seasonsLeft:
      player.contractUntil === null ? 0 : Math.max(0, player.contractUntil.getUTCFullYear() - seasonStartYear(date)),
  };
}

/** Compensation a released player receives: RELEASE_COMPENSATION_SHARE of the wages left on his contract. */
const releaseCompensation = (player: PlayerRow, date: Date): number =>
  Math.round(player.wage * offerPlayer(player, date).seasonsLeft * RELEASE_COMPENSATION_SHARE);

async function managedContext(tx: Tx, saveId: string) {
  const save = await tx.save.findUniqueOrThrow({
    where: { id: saveId },
    select: { seed: true, currentDate: true, liveFixtureId: true, liveInternationalId: true },
  });
  const club = await tx.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, clubId: true, budget: true, reputation: true },
  });
  return { save, club, windowOpen: transferWindowAt(save.currentDate) !== null };
}

/**
 * The players under contract at a club, retired ones never (a retired player has no club anyway): what SQUAD_LIMIT counts
 * (docs/design/simplification.md § 1.4). By the index on (saveId, clubSaveId, retired).
 */
export async function squadSizeOf(db: Tx, saveId: string, clubSaveId: string): Promise<number> {
  return db.playerSave.count({ where: { saveId, clubSaveId, retired: false } });
}

/**
 * The arrivals at a club, bought or signed free, of each of the players given (PlayerSave.id) in the year up to a date:
 * what decides whether he may be sold (arrivedThisWindow) and for how much (resaleCap). Empty when no window is open:
 * nothing is sold then.
 */
async function recentArrivals(
  tx: Tx,
  saveId: string,
  clubId: string,
  date: Date,
  playerSaveIds: readonly string[],
): Promise<Map<string, ClubArrival[]>> {
  const byPlayer = new Map<string, ClubArrival[]>();
  if (transferWindowAt(date) === null || playerSaveIds.length === 0) {
    return byPlayer;
  }
  const arrivals = await tx.transfer.findMany({
    where: {
      saveId,
      playerSaveId: { in: [...playerSaveIds] },
      toClubId: clubId,
      type: { in: ["TRANSFER", "FREE"] },
      date: { gte: addYears(date, -1) },
    },
    select: { playerSaveId: true, date: true, type: true, fee: true },
  });
  for (const { playerSaveId, date: arrivedOn, type, fee } of arrivals) {
    // The query asks for these two types only; the check tells TypeScript.
    if (type === "TRANSFER" || type === "FREE") {
      byPlayer.set(playerSaveId, [...(byPlayer.get(playerSaveId) ?? []), { date: arrivedOn, type, fee }]);
    }
  }
  return byPlayer;
}

/**
 * Whether a player joined the club, bought or signed free, since the first day of the transfer window open on a date:
 * he cannot be sold before the next window. The first rule of a sale, before resaleCap.
 */
function arrivedThisWindow(arrivals: readonly ClubArrival[], date: Date): boolean {
  const opensOn = transferWindowOpenDate(date);
  return opensOn !== null && arrivals.some((arrival) => arrival.date >= opensOn);
}

/** Above every club's reputation (1–99): the bound of the first clubs read. */
const ABOVE_ANY_REPUTATION = 100;

/**
 * The AI clubs that follow, in bidding order, those already read (every club reputed `below` or more): the first
 * `count` of those reputed `floor` or more, and the others of the reputation of the last one, so that biddingOrder,
 * never the database's collation, orders the clubs of a reputation. Fewer than `count`: none is left. Each comes with
 * its squad size, its players under contract, read for these clubs only: one at SQUAD_LIMIT bids for nobody
 * (walkSaleBids). No wage room counts any more (docs/design/simplification.md § 1.5).
 *
 * Raw SQL for what Prisma cannot say: the join to Club by primary key, one Club row per club read (a findMany selecting
 * the club reads the whole Club table for them), and WITH TIES, the rest of the last reputation in the same query.
 */
async function readBidders(tx: Tx, saveId: string, below: number, count: number, floor: number): Promise<Bidder[]> {
  const clubs = await tx.$queryRaw<Omit<Bidder, "squadSize">[]>`
    SELECT cs."id", cs."clubId", cs."budget", cs."reputation", c."slug", c."name"
    FROM "ClubSave" cs
    JOIN "Club" c ON c."id" = cs."clubId"
    WHERE cs."saveId" = ${saveId} AND NOT cs."isManaged" AND cs."reputation" >= ${floor} AND cs."reputation" < ${below}
    ORDER BY cs."reputation" DESC
    FETCH FIRST ${count} ROWS WITH TIES`;
  if (clubs.length === 0) {
    return [];
  }
  const squads = await tx.playerSave.groupBy({
    by: ["clubSaveId"],
    where: { saveId, clubSaveId: { in: clubs.map((club) => club.id) }, retired: false },
    _count: { _all: true },
  });
  const sizeByClub = new Map(squads.map((row) => [row.clubSaveId, row._count._all]));
  return clubs.map((club) => ({ ...club, squadSize: sizeByClub.get(club.id) ?? 0 })).sort(biddingOrder);
}

/**
 * The best AI bid for each player on sale (null: no club bids), keyed by PlayerSave.id: drawn from the stream of the
 * save, the date and the player, the same all day, at most his resale cap when he has one. The AI clubs are read in
 * bidding order, a batch at a time, only as far as the walks of the bids go (walkSaleBids): a batch serves every player,
 * and a walk that runs past it starts again, with the same stream, once the next one is read. The bids are those of
 * saleBids over every AI club, capped.
 */
async function bestSaleBids(
  tx: Tx,
  saveId: string,
  save: { seed: string; currentDate: Date },
  seller: OfferClub,
  onSale: readonly { player: SquadPlayer; cap: ResaleCap | null }[],
): Promise<Map<string, BestBid | null>> {
  const market: Bidder[] = [];
  let more = true;
  const best = new Map<string, BestBid | null>();
  let pending = onSale.map(({ player, cap }) => ({ player, cap, terms: offerPlayer(player, save.currentDate) }));
  while (pending.length > 0) {
    const waiting: ((typeof pending)[number] & { missing: number })[] = [];
    for (const { player, cap, terms } of pending) {
      const rng = makeRng(saleRngSeed(save.seed, save.currentDate, player.playerKey));
      const walk = walkSaleBids(terms, seller, market, more, rng, cap?.fee);
      if (!walk.done) {
        waiting.push({ player, cap, terms, missing: SALE_MAX_BIDDERS - walk.bids.length });
        continue;
      }
      const [bid] = walk.bids;
      const buyer = bid === undefined ? undefined : market.find((club) => club.slug === bid.clubSlug);
      best.set(player.id, bid === undefined || buyer === undefined ? null : { bid, buyer });
    }
    if (waiting.length > 0) {
      // Every club read so far is reputed enough for each walk still waiting: they read the same clubs next.
      const count = Math.max(...waiting.map((entry) => entry.missing));
      const floor = Math.min(...waiting.map((entry) => minimumReputation(entry.terms, seller)));
      const clubs = await readBidders(tx, saveId, market.at(-1)?.reputation ?? ABOVE_ANY_REPUTATION, count, floor);
      market.push(...clubs);
      more = clubs.length >= count;
    }
    pending = waiting;
  }
  return best;
}

/**
 * Terms of a player on a date, from his club: his signing bonus and his free-agent wage without a club, his renewal
 * wage at the managed club, his club's asking price and his raise elsewhere, and the reputation he asks of a club. Pure:
 * the market lists, the proposals and quoteTransfer share it.
 */
export function quoteFor(
  player: QuotedPlayer,
  club: { isManaged: boolean; reputation: number } | null,
  date: Date,
): TransferQuote {
  const terms = offerPlayer(player, date);
  if (club === null) {
    return {
      askingPrice: signingBonus(marketValueFor(terms)),
      minimumWage: minimumWage(terms, null),
      minimumReputation: minimumReputation(terms, null),
    };
  }
  if (club.isManaged) {
    return { askingPrice: 0, minimumWage: renewalWage(terms), minimumReputation: 0 };
  }
  const selling = { reputation: club.reputation };
  return {
    askingPrice: askingPrice(terms),
    minimumWage: minimumWage(terms, selling),
    minimumReputation: minimumReputation(terms, selling),
  };
}

/** Terms a player would accept today: the asking price of his club (a free agent's bonus) and his minimum wage. Read only. */
export async function quoteTransfer(input: PlayerActionInput): Promise<TransferQuote> {
  const { saveId, playerSaveId } = playerActionSchema.parse(input);
  const [save, player] = await Promise.all([
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
    prisma.playerSave.findFirstOrThrow({
      where: { id: playerSaveId, saveId },
      select: { ...PLAYER_SELECT, clubSave: { select: { isManaged: true, reputation: true } } },
    }),
  ]);
  return quoteFor(player, player.clubSave, save.currentDate);
}

/** quoteSquad, with the club behind each offer (ClubSave.id), keyed by PlayerSave.id like the terms. */
export type SquadQuotes = { terms: Map<string, ContractTerms>; buyers: Map<string, string> };

/**
 * Renewal wage, release cost and best sale offer of every player of the managed club today, keyed by
 * PlayerSave.id. Read only: the actions compute the same terms again when they run.
 */
export async function quoteSquad(saveId: string): Promise<Map<string, ContractTerms>> {
  return (await quoteSquadWithBuyers(saveId)).terms;
}

/**
 * quoteSquad and the buyer of each offer, which a proposed sale names when it is accepted (getSaleProposals,
 * src/db/sale-proposals.ts). Read once per request (React's cache: the Vendre tab reads its rows and its proposals);
 * outside a server render, at each call.
 */
export const quoteSquadWithBuyers = cache(async (saveId: string): Promise<SquadQuotes> => {
  const { save, club, windowOpen } = await managedContext(prisma, saveId);
  const players = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: club.id },
    select: { id: true, playerKey: true, birthDate: true, overall: true, potential: true, wage: true, contractUntil: true },
  });
  const arrivals = await recentArrivals(
    prisma,
    saveId,
    club.clubId,
    save.currentDate,
    players.map((player) => player.id),
  );
  const arrivalsOf = (player: SquadPlayer): ClubArrival[] => arrivals.get(player.id) ?? [];
  const bought = new Set(players.filter((player) => arrivedThisWindow(arrivalsOf(player), save.currentDate)).map(({ id }) => id));
  const academy = await academyLocks(
    prisma,
    saveId,
    save.currentDate,
    players.map((player) => player.playerKey),
  );
  const onSale = players
    .filter((player) => !bought.has(player.id) && !academy.has(player.playerKey))
    .map((player) => ({ player, cap: resaleCap(arrivalsOf(player), offerPlayer(player, save.currentDate), save.currentDate) }));
  const caps = new Map(onSale.map(({ player, cap }) => [player.id, cap]));
  const bids = windowOpen ? await bestSaleBids(prisma, saveId, save, club, onSale) : new Map<string, BestBid | null>();
  const buyers = new Map<string, string>();
  for (const [playerSaveId, best] of bids) {
    if (best !== null) {
      buyers.set(playerSaveId, best.buyer.id);
    }
  }

  const terms = new Map(
    players.map((player) => {
      let sale: SaleQuote = { ok: false, reason: "window_closed" };
      if (academy.has(player.playerKey)) {
        sale = { ok: false, reason: "academy" };
      } else if (windowOpen && bought.has(player.id)) {
        sale = { ok: false, reason: "bought_this_window" };
      } else if (windowOpen) {
        const best = getOrThrow(bids, player.id, "best sale bid");
        const cap = getOrThrow(caps, player.id, "resale cap");
        sale =
          best === null
            ? { ok: false, reason: "no_offer" }
            : {
                ok: true,
                fee: best.bid.fee,
                wage: best.bid.wage,
                years: best.bid.years,
                buyerName: displayClubName(best.buyer),
                ...(cap === null ? {} : { resaleCap: cap.kind }),
              };
      }
      return [
        player.id,
        {
          renewalMinimumWage: renewalWage(offerPlayer(player, save.currentDate)),
          releaseCost: releaseCompensation(player, save.currentDate),
          sale,
          academyUntil: academy.get(player.playerKey) ?? null,
        },
      ];
    }),
  );
  return { terms, buyers };
});

/**
 * Offer from the managed club for a player of an AI club: answered at once by the club and the player. Refused while the
 * squad has SQUAD_LIMIT players; the player joins for the wage offered, at least the one he asks (the asked one without).
 */
export async function makeTransferOffer(input: MakeTransferOfferInput): Promise<TransferOutcome> {
  const { saveId, playerSaveId, fee, wage: offeredWage, years } = makeTransferOfferSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    // The save locked first, as a sale or a purchase in the shop locks it: two signings at once never take the squad
    // past SQUAD_LIMIT, nor the budget below what they cost.
    await lockSave(tx, saveId);
    const { save, club, windowOpen } = await managedContext(tx, saveId);
    if (!windowOpen) {
      return refused("window_closed");
    }
    const player = await tx.playerSave.findFirst({
      where: { id: playerSaveId, saveId },
      select: { ...PLAYER_SELECT, clubSave: { select: { id: true, clubId: true, reputation: true } } },
    });
    if (player === null || player.clubSave === null || player.clubSave.id === club.id) {
      return refused("not_available");
    }
    if ((await squadSizeOf(tx, saveId, club.id)) >= SQUAD_LIMIT) {
      return refused("squad_full");
    }
    if (fee > club.budget) {
      return refused("insufficient_budget");
    }
    const evaluation = evaluateOffer(
      offerPlayer(player, save.currentDate),
      { reputation: player.clubSave.reputation },
      { reputation: club.reputation },
      fee,
    );
    if (!evaluation.clubAccepts) {
      return refused("club_refused", evaluation.refusals);
    }
    if (!evaluation.playerAccepts) {
      return refused("player_refused", evaluation.refusals);
    }

    const wage = Math.max(offeredWage ?? 0, evaluation.minimumWage);
    const contractUntil = contractEndDate(save.currentDate, years);
    await tx.playerSave.update({ where: { id: player.id, saveId }, data: { clubSaveId: club.id, contractUntil, wage } });
    await tx.clubSave.update({ where: { id: club.id, saveId }, data: { budget: { decrement: fee } } });
    await tx.clubSave.update({ where: { id: player.clubSave.id, saveId }, data: { budget: { increment: fee } } });
    await tx.transfer.create({
      data: {
        saveId,
        playerSaveId: player.id,
        fromClubId: player.clubSave.clubId,
        toClubId: club.clubId,
        fee,
        type: "TRANSFER",
        date: save.currentDate,
      },
    });
    return { ok: true, fee, budgetChange: -fee, payrollChange: wage, wage, clubSaveId: club.id, contractUntil };
  }, TRANSACTION_OPTIONS);
}

/**
 * Signs a free agent for the managed club: no fee, his signing bonus instead (signingBonus of his market value today,
 * docs/design/simplification.md § 1.3), debited from the budget and written as the fee of the FREE transfer, which
 * « Bonne gestion » counts as a purchase. Refused while the squad has SQUAD_LIMIT players, or when the budget does not
 * pay the bonus; he joins for the wage offered, at least the one he asks (the asked one without).
 */
export async function signFreeAgent(input: SignFreeAgentInput): Promise<TransferOutcome> {
  const { saveId, playerSaveId, wage: offeredWage, years } = signFreeAgentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    // Locked as makeTransferOffer is: the squad's count and the bonus checked against what is there.
    await lockSave(tx, saveId);
    const { save, club, windowOpen } = await managedContext(tx, saveId);
    if (!windowOpen) {
      return refused("window_closed");
    }
    const player = await tx.playerSave.findFirst({
      where: { ...freeAgentWhere(saveId), id: playerSaveId },
      select: PLAYER_SELECT,
    });
    if (player === null) {
      return refused("not_available");
    }
    if ((await squadSizeOf(tx, saveId, club.id)) >= SQUAD_LIMIT) {
      return refused("squad_full");
    }
    const terms = offerPlayer(player, save.currentDate);
    const bonus = signingBonus(marketValueFor(terms));
    if (bonus > club.budget) {
      return refused("insufficient_budget");
    }
    const evaluation = evaluateOffer(terms, null, { reputation: club.reputation }, 0);
    if (!evaluation.playerAccepts) {
      return refused("player_refused", evaluation.refusals);
    }

    const wage = Math.max(offeredWage ?? 0, evaluation.minimumWage);
    const contractUntil = contractEndDate(save.currentDate, years);
    await tx.playerSave.update({ where: { id: player.id, saveId }, data: { clubSaveId: club.id, contractUntil, wage } });
    await tx.clubSave.update({ where: { id: club.id, saveId }, data: { budget: { decrement: bonus } } });
    await tx.transfer.create({
      data: { saveId, playerSaveId: player.id, fromClubId: null, toClubId: club.clubId, fee: bonus, type: "FREE", date: save.currentDate },
    });
    return { ok: true, fee: bonus, budgetChange: -bonus, payrollChange: wage, wage, clubSaveId: club.id, contractUntil };
  }, TRANSACTION_OPTIONS);
}

/**
 * Extends the contract of a player of the managed club: new length from today and new wage, no transfer. Never refused
 * for the wage (docs/design/simplification.md § 1.1): he extends for the wage offered, at least his floor (renewalWage),
 * his floor without one.
 */
export async function renewContract(input: RenewContractInput): Promise<TransferOutcome> {
  const { saveId, playerSaveId, wage: offeredWage, years } = renewContractSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { save, club, windowOpen } = await managedContext(tx, saveId);
    if (!windowOpen) {
      return refused("window_closed");
    }
    const player = await tx.playerSave.findFirst({ where: { id: playerSaveId, saveId, clubSaveId: club.id }, select: PLAYER_SELECT });
    if (player === null) {
      return refused("not_available");
    }

    const wage = Math.max(offeredWage ?? 0, renewalWage(offerPlayer(player, save.currentDate)));
    const contractUntil = contractEndDate(save.currentDate, years);
    await tx.playerSave.update({ where: { id: player.id, saveId }, data: { contractUntil, wage } });
    return { ok: true, fee: 0, budgetChange: 0, payrollChange: wage - player.wage, wage, clubSaveId: club.id, contractUntil };
  }, TRANSACTION_OPTIONS);
}

/**
 * Releases a player of the managed club, who becomes a free agent. The club pays him
 * RELEASE_COMPENSATION_SHARE of the wages left on his contract.
 */
export async function releasePlayer(input: PlayerActionInput): Promise<TransferOutcome> {
  const { saveId, playerSaveId } = releasePlayerSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { save, club, windowOpen } = await managedContext(tx, saveId);
    if (!windowOpen) {
      return refused("window_closed");
    }
    const player = await tx.playerSave.findFirst({ where: { id: playerSaveId, saveId, clubSaveId: club.id }, select: PLAYER_SELECT });
    if (player === null) {
      return refused("not_available");
    }
    if ((await academyLocks(tx, saveId, save.currentDate, [player.playerKey])).size > 0) {
      return refused("academy");
    }
    const compensation = releaseCompensation(player, save.currentDate);
    if (compensation > club.budget) {
      return refused("insufficient_budget");
    }

    await tx.playerSave.update({ where: { id: player.id, saveId }, data: { clubSaveId: null, contractUntil: null } });
    await tx.clubSave.update({ where: { id: club.id, saveId }, data: { budget: { decrement: compensation } } });
    await tx.transfer.create({
      data: { saveId, playerSaveId: player.id, fromClubId: club.clubId, toClubId: null, fee: 0, type: "FREE", date: save.currentDate },
    });
    return {
      ok: true,
      fee: compensation,
      budgetChange: -compensation,
      payrollChange: -player.wage,
      wage: player.wage,
      clubSaveId: null,
      contractUntil: null,
    };
  }, TRANSACTION_OPTIONS);
}

/**
 * Puts a player of the managed club on sale and accepts the best AI bid at once, unless he arrived in this window; in
 * the year after he arrived, that bid is at most his resale cap (resaleCap). The fee quoteSquad shows.
 */
export async function sellPlayer(input: SellPlayerInput): Promise<TransferOutcome> {
  const { saveId, playerSaveId, expected } = sellPlayerSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    // The save locked first, as a matchday or a step of the live match locks it: a sale waits for the one under way, then
    // reads the squad and the budgets it left (docs/design/simplification.md § 5.2).
    await lockSave(tx, saveId);
    const { save, club, windowOpen } = await managedContext(tx, saveId);
    if (!windowOpen) {
      return refused("window_closed");
    }
    // A match waiting live keeps its line-up in its state: the player may be on its pitch or its bench.
    if (liveMatchOf(save) !== null) {
      return refused("match_in_progress");
    }
    const player = await tx.playerSave.findFirst({ where: { id: playerSaveId, saveId, clubSaveId: club.id }, select: PLAYER_SELECT });
    if (player === null) {
      return refused("not_available");
    }
    if ((await academyLocks(tx, saveId, save.currentDate, [player.playerKey])).size > 0) {
      return refused("academy");
    }
    const arrivals = (await recentArrivals(tx, saveId, club.clubId, save.currentDate, [player.id])).get(player.id) ?? [];
    if (arrivedThisWindow(arrivals, save.currentDate)) {
      return refused("bought_this_window");
    }

    const cap = resaleCap(arrivals, offerPlayer(player, save.currentDate), save.currentDate);
    const best = getOrThrow(await bestSaleBids(tx, saveId, save, club, [{ player, cap }]), player.id, "best sale bid");
    if (best === null) {
      return refused("no_offer");
    }

    const { bid, buyer } = best;
    // A proposed sale is made at the offer its card showed, or not at all: another sale may have emptied a budget since.
    if (expected !== undefined && (buyer.id !== expected.buyerId || bid.fee !== expected.fee)) {
      return { ok: false, reason: "offer_changed", refusals: [], changedOffer: { fee: bid.fee, buyerName: displayClubName(buyer) } };
    }
    const contractUntil = contractEndDate(save.currentDate, bid.years);
    await tx.playerSave.update({
      where: { id: player.id, saveId },
      data: { clubSaveId: buyer.id, contractUntil, wage: bid.wage },
    });
    await tx.clubSave.update({ where: { id: club.id, saveId }, data: { budget: { increment: bid.fee } } });
    await tx.clubSave.update({ where: { id: buyer.id, saveId }, data: { budget: { decrement: bid.fee } } });
    await tx.transfer.create({
      data: {
        saveId,
        playerSaveId: player.id,
        fromClubId: club.clubId,
        toClubId: buyer.clubId,
        fee: bid.fee,
        type: "TRANSFER",
        date: save.currentDate,
      },
    });
    return {
      ok: true,
      fee: bid.fee,
      budgetChange: bid.fee,
      payrollChange: -player.wage,
      wage: bid.wage,
      clubSaveId: buyer.id,
      contractUntil,
    };
  }, TRANSACTION_OPTIONS);
}
