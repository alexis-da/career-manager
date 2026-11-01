import * as z from "zod";
import { RELEASE_COMPENSATION_SHARE } from "../engine/balance";
import { displayClubName } from "../engine/club-name";
import { contractEndDate } from "../engine/economy";
import {
  askingPrice,
  evaluateOffer,
  evaluateRenewal,
  minimumReputation,
  minimumWage,
  saleBids,
  saleRngSeed,
  type BidderClub,
  type OfferPlayer,
  type OfferRefusal,
  type SaleBid,
} from "../engine/transfer-ai";
import { seasonStartYear, transferWindowAt } from "../engine/world";
import type { Prisma } from "../generated/prisma/client";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

const MAX_DATABASE_INT = 2_147_483_647;
const TRANSACTION_OPTIONS = { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: 30_000 };

const idSchema = z.string().min(1);
const feeSchema = z.number().int().min(0).max(MAX_DATABASE_INT);
const wageSchema = z.number().int().min(1).max(MAX_DATABASE_INT);
const yearsSchema = z.number().int().min(1).max(5);

export const playerActionSchema = z.object({ saveId: idSchema, playerSaveId: idSchema });
export const makeTransferOfferSchema = playerActionSchema.extend({ fee: feeSchema, wage: wageSchema, years: yearsSchema });
export const signFreeAgentSchema = playerActionSchema.extend({ wage: wageSchema, years: yearsSchema });
export const renewContractSchema = playerActionSchema.extend({ wage: wageSchema, years: yearsSchema });
export const releasePlayerSchema = playerActionSchema;
export const sellPlayerSchema = playerActionSchema;

export type PlayerActionInput = z.input<typeof playerActionSchema>;
export type MakeTransferOfferInput = z.input<typeof makeTransferOfferSchema>;
export type SignFreeAgentInput = z.input<typeof signFreeAgentSchema>;
export type RenewContractInput = z.input<typeof renewContractSchema>;

export type TransferRefusal =
  | "window_closed"
  | "not_available"
  | "insufficient_budget"
  | "wage_budget_exceeded"
  | "club_refused"
  | "player_refused"
  | "no_offer";

export type TransferOutcome =
  | {
      ok: true;
      fee: number; // transfer fee, or compensation paid for a release; euros
      budgetChange: number; // change of the managed club's budget
      payrollChange: number; // change of the managed club's wages per season
      clubSaveId: string | null; // the player's club afterwards
      contractUntil: Date | null;
    }
  | { ok: false; reason: TransferRefusal; refusals: OfferRefusal[] };

export type TransferQuote = {
  askingPrice: number; // euros; 0 for a free agent or a player of the managed club
  minimumWage: number; // euros per season the player accepts, renewal included
  minimumReputation: number; // the lowest reputation of a club he joins; 0 for a player of the managed club
};

/** Best AI bid for a player of the managed club today, or why there is none. */
export type SaleQuote =
  | { ok: true; fee: number; wage: number; years: number; buyerName: string }
  | { ok: false; reason: Extract<TransferRefusal, "window_closed" | "no_offer"> };

/** What each action would take today for a player of the managed club. */
export type ContractTerms = {
  renewalMinimumWage: number; // euros per season
  releaseCost: number; // euros paid to the player
  sale: SaleQuote;
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

type SaleMarket = {
  bidders: BidderClub[];
  clubBySlug: Map<string, { id: string; clubId: string; club: { slug: string; name: string } }>;
};

const refused = (reason: TransferRefusal, refusals: OfferRefusal[] = []): TransferOutcome => ({
  ok: false,
  reason,
  refusals,
});

/** Free agents of a save: without a club and not retired. */
export const freeAgentWhere = (saveId: string) =>
  ({ saveId, clubSaveId: null, transfers: { none: { saveId, type: "RETIREMENT" } } }) satisfies Prisma.PlayerSaveWhereInput;

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
  const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { seed: true, currentDate: true } });
  const club = await tx.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, clubId: true, budget: true, wageBudget: true, reputation: true },
  });
  const { _sum } = await tx.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } });
  return { save, club, payroll: _sum.wage ?? 0, windowOpen: transferWindowAt(save.currentDate) !== null };
}

/** AI clubs able to bid, with the wage room left under their wage budget. */
async function loadSaleMarket(tx: Tx, saveId: string): Promise<SaleMarket> {
  const clubs = await tx.clubSave.findMany({
    where: { saveId, isManaged: false },
    select: { id: true, clubId: true, budget: true, wageBudget: true, reputation: true, club: { select: { slug: true, name: true } } },
  });
  const payrolls = await tx.playerSave.groupBy({
    by: ["clubSaveId"],
    where: { saveId, clubSaveId: { not: null } },
    _sum: { wage: true },
  });
  const payrollByClub = new Map(payrolls.map((row) => [row.clubSaveId, row._sum.wage ?? 0]));
  return {
    bidders: clubs.map((candidate) => ({
      slug: candidate.club.slug,
      reputation: candidate.reputation,
      budget: candidate.budget,
      wageRoom: candidate.wageBudget - (payrollByClub.get(candidate.id) ?? 0),
    })),
    clubBySlug: new Map(clubs.map((candidate) => [candidate.club.slug, candidate])),
  };
}

/** The best AI bid for a player, drawn from the stream of the save, the date and the player: the same all day. */
function bestSaleBid(
  save: { seed: string; currentDate: Date },
  managedReputation: number,
  player: PlayerRow,
  market: SaleMarket,
): SaleBid | undefined {
  const [best] = saleBids(
    offerPlayer(player, save.currentDate),
    { reputation: managedReputation },
    market.bidders,
    makeRng(saleRngSeed(save.seed, save.currentDate, player.playerKey)),
  );
  return best;
}

/**
 * Terms of a player on a date, from his club: nothing to pay and his free-agent wage without a club, his renewal
 * wage at the managed club, his club's asking price and his raise elsewhere, and the reputation he asks of a club. Pure:
 * the market lists and quoteTransfer share it.
 */
export function quoteFor(
  player: QuotedPlayer,
  club: { isManaged: boolean; reputation: number } | null,
  date: Date,
): TransferQuote {
  const terms = offerPlayer(player, date);
  if (club === null) {
    return { askingPrice: 0, minimumWage: minimumWage(terms, null), minimumReputation: minimumReputation(terms, null) };
  }
  if (club.isManaged) {
    return { askingPrice: 0, minimumWage: evaluateRenewal(terms, 0).minimumWage, minimumReputation: 0 };
  }
  const selling = { reputation: club.reputation };
  return {
    askingPrice: askingPrice(terms),
    minimumWage: minimumWage(terms, selling),
    minimumReputation: minimumReputation(terms, selling),
  };
}

/** Terms a player would accept today: the asking price of his club and his minimum wage. Read only. */
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

/**
 * Renewal wage, release cost and best sale offer of every player of the managed club today, keyed by
 * PlayerSave.id. Read only: the actions compute the same terms again when they run.
 */
export async function quoteSquad(saveId: string): Promise<Map<string, ContractTerms>> {
  const { save, club, windowOpen } = await managedContext(prisma, saveId);
  const players = await prisma.playerSave.findMany({ where: { saveId, clubSaveId: club.id }, select: PLAYER_SELECT });
  const market = windowOpen ? await loadSaleMarket(prisma, saveId) : null;

  return new Map(
    players.map((player) => {
      let sale: SaleQuote = { ok: false, reason: "window_closed" };
      if (market !== null) {
        const best = bestSaleBid(save, club.reputation, player, market);
        sale =
          best === undefined
            ? { ok: false, reason: "no_offer" }
            : {
                ok: true,
                fee: best.fee,
                wage: best.wage,
                years: best.years,
                buyerName: displayClubName(getOrThrow(market.clubBySlug, best.clubSlug, "bidding club").club),
              };
      }
      return [
        player.id,
        {
          renewalMinimumWage: evaluateRenewal(offerPlayer(player, save.currentDate), 0).minimumWage,
          releaseCost: releaseCompensation(player, save.currentDate),
          sale,
        },
      ];
    }),
  );
}

/** Offer from the managed club for a player of an AI club: answered at once by the club and the player. */
export async function makeTransferOffer(input: MakeTransferOfferInput): Promise<TransferOutcome> {
  const { saveId, playerSaveId, fee, wage, years } = makeTransferOfferSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { save, club, payroll, windowOpen } = await managedContext(tx, saveId);
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
    if (fee > club.budget) {
      return refused("insufficient_budget");
    }
    if (payroll + wage > club.wageBudget) {
      return refused("wage_budget_exceeded");
    }
    const evaluation = evaluateOffer(
      offerPlayer(player, save.currentDate),
      { reputation: player.clubSave.reputation },
      { reputation: club.reputation },
      fee,
      wage,
    );
    if (!evaluation.clubAccepts) {
      return refused("club_refused", evaluation.refusals);
    }
    if (!evaluation.playerAccepts) {
      return refused("player_refused", evaluation.refusals);
    }

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
    return { ok: true, fee, budgetChange: -fee, payrollChange: wage, clubSaveId: club.id, contractUntil };
  }, TRANSACTION_OPTIONS);
}

/** Signs a free agent for the managed club, without a fee. */
export async function signFreeAgent(input: SignFreeAgentInput): Promise<TransferOutcome> {
  const { saveId, playerSaveId, wage, years } = signFreeAgentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { save, club, payroll, windowOpen } = await managedContext(tx, saveId);
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
    if (payroll + wage > club.wageBudget) {
      return refused("wage_budget_exceeded");
    }
    const evaluation = evaluateOffer(offerPlayer(player, save.currentDate), null, { reputation: club.reputation }, 0, wage);
    if (!evaluation.playerAccepts) {
      return refused("player_refused", evaluation.refusals);
    }

    const contractUntil = contractEndDate(save.currentDate, years);
    await tx.playerSave.update({ where: { id: player.id, saveId }, data: { clubSaveId: club.id, contractUntil, wage } });
    await tx.transfer.create({
      data: { saveId, playerSaveId: player.id, fromClubId: null, toClubId: club.clubId, fee: 0, type: "FREE", date: save.currentDate },
    });
    return { ok: true, fee: 0, budgetChange: 0, payrollChange: wage, clubSaveId: club.id, contractUntil };
  }, TRANSACTION_OPTIONS);
}

/** Extends the contract of a player of the managed club: new length from today and new wage, no transfer. */
export async function renewContract(input: RenewContractInput): Promise<TransferOutcome> {
  const { saveId, playerSaveId, wage, years } = renewContractSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { save, club, payroll, windowOpen } = await managedContext(tx, saveId);
    if (!windowOpen) {
      return refused("window_closed");
    }
    const player = await tx.playerSave.findFirst({ where: { id: playerSaveId, saveId, clubSaveId: club.id }, select: PLAYER_SELECT });
    if (player === null) {
      return refused("not_available");
    }
    if (payroll - player.wage + wage > club.wageBudget) {
      return refused("wage_budget_exceeded");
    }
    if (!evaluateRenewal(offerPlayer(player, save.currentDate), wage).accepted) {
      return refused("player_refused", ["wage_too_low"]);
    }

    const contractUntil = contractEndDate(save.currentDate, years);
    await tx.playerSave.update({ where: { id: player.id, saveId }, data: { contractUntil, wage } });
    return { ok: true, fee: 0, budgetChange: 0, payrollChange: wage - player.wage, clubSaveId: club.id, contractUntil };
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
      clubSaveId: null,
      contractUntil: null,
    };
  }, TRANSACTION_OPTIONS);
}

/** Puts a player of the managed club on sale and accepts the best AI bid at once. */
export async function sellPlayer(input: PlayerActionInput): Promise<TransferOutcome> {
  const { saveId, playerSaveId } = sellPlayerSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { save, club, windowOpen } = await managedContext(tx, saveId);
    if (!windowOpen) {
      return refused("window_closed");
    }
    const player = await tx.playerSave.findFirst({ where: { id: playerSaveId, saveId, clubSaveId: club.id }, select: PLAYER_SELECT });
    if (player === null) {
      return refused("not_available");
    }

    const market = await loadSaleMarket(tx, saveId);
    const best = bestSaleBid(save, club.reputation, player, market);
    if (best === undefined) {
      return refused("no_offer");
    }

    const buyer = getOrThrow(market.clubBySlug, best.clubSlug, "bidding club");
    const contractUntil = contractEndDate(save.currentDate, best.years);
    await tx.playerSave.update({
      where: { id: player.id, saveId },
      data: { clubSaveId: buyer.id, contractUntil, wage: best.wage },
    });
    await tx.clubSave.update({ where: { id: club.id, saveId }, data: { budget: { increment: best.fee } } });
    await tx.clubSave.update({ where: { id: buyer.id, saveId }, data: { budget: { decrement: best.fee } } });
    await tx.transfer.create({
      data: {
        saveId,
        playerSaveId: player.id,
        fromClubId: club.clubId,
        toClubId: buyer.clubId,
        fee: best.fee,
        type: "TRANSFER",
        date: save.currentDate,
      },
    });
    return {
      ok: true,
      fee: best.fee,
      budgetChange: best.fee,
      payrollChange: -player.wage,
      clubSaveId: buyer.id,
      contractUntil,
    };
  }, TRANSACTION_OPTIONS);
}
