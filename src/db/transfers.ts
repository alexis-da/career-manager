import * as z from "zod";
import { RELEASE_COMPENSATION_SHARE, SALE_MAX_BIDDERS } from "../engine/balance";
import { displayClubName } from "../engine/club-name";
import { contractEndDate } from "../engine/economy";
import {
  askingPrice,
  biddingOrder,
  evaluateOffer,
  evaluateRenewal,
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
  | "bought_this_window"
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

/**
 * Best AI bid for a player of the managed club today, or why there is none. resaleCap: he joined the club less than a
 * year ago, bought or signed free, and no club offers more than its cap (resaleCap); absent otherwise.
 */
export type SaleQuote =
  | { ok: true; fee: number; wage: number; years: number; buyerName: string; resaleCap?: ResaleCap["kind"] }
  | { ok: false; reason: Extract<TransferRefusal, "window_closed" | "bought_this_window" | "no_offer"> };

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
  const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { seed: true, currentDate: true } });
  const club = await tx.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, clubId: true, budget: true, wageBudget: true, reputation: true },
  });
  return { save, club, windowOpen: transferWindowAt(save.currentDate) !== null };
}

/** The wages of a club's players, euros per season. */
async function payrollOf(tx: Tx, saveId: string, clubSaveId: string): Promise<number> {
  const { _sum } = await tx.playerSave.aggregate({ where: { saveId, clubSaveId }, _sum: { wage: true } });
  return _sum.wage ?? 0;
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
 * its wage room, its wage budget less its payroll, read for these clubs only.
 *
 * Raw SQL for what Prisma cannot say: the join to Club by primary key, one Club row per club read (a findMany selecting
 * the club reads the whole Club table for them), and WITH TIES, the rest of the last reputation in the same query.
 */
async function readBidders(tx: Tx, saveId: string, below: number, count: number, floor: number): Promise<Bidder[]> {
  const clubs = await tx.$queryRaw<(Omit<Bidder, "wageRoom"> & { wageBudget: number })[]>`
    SELECT cs."id", cs."clubId", cs."budget", cs."wageBudget", cs."reputation", c."slug", c."name"
    FROM "ClubSave" cs
    JOIN "Club" c ON c."id" = cs."clubId"
    WHERE cs."saveId" = ${saveId} AND NOT cs."isManaged" AND cs."reputation" >= ${floor} AND cs."reputation" < ${below}
    ORDER BY cs."reputation" DESC
    FETCH FIRST ${count} ROWS WITH TIES`;
  if (clubs.length === 0) {
    return [];
  }
  const payrolls = await tx.playerSave.groupBy({
    by: ["clubSaveId"],
    where: { saveId, clubSaveId: { in: clubs.map((club) => club.id) } },
    _sum: { wage: true },
  });
  const payrollByClub = new Map(payrolls.map((row) => [row.clubSaveId, row._sum.wage ?? 0]));
  return clubs
    .map(({ wageBudget, ...club }) => ({ ...club, wageRoom: wageBudget - (payrollByClub.get(club.id) ?? 0) }))
    .sort(biddingOrder);
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
  const onSale = players
    .filter((player) => !bought.has(player.id))
    .map((player) => ({ player, cap: resaleCap(arrivalsOf(player), offerPlayer(player, save.currentDate), save.currentDate) }));
  const caps = new Map(onSale.map(({ player, cap }) => [player.id, cap]));
  const bids = windowOpen ? await bestSaleBids(prisma, saveId, save, club, onSale) : new Map<string, BestBid | null>();

  return new Map(
    players.map((player) => {
      let sale: SaleQuote = { ok: false, reason: "window_closed" };
      if (windowOpen && bought.has(player.id)) {
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
    if (fee > club.budget) {
      return refused("insufficient_budget");
    }
    if ((await payrollOf(tx, saveId, club.id)) + wage > club.wageBudget) {
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
    if ((await payrollOf(tx, saveId, club.id)) + wage > club.wageBudget) {
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
    const { save, club, windowOpen } = await managedContext(tx, saveId);
    if (!windowOpen) {
      return refused("window_closed");
    }
    const player = await tx.playerSave.findFirst({ where: { id: playerSaveId, saveId, clubSaveId: club.id }, select: PLAYER_SELECT });
    if (player === null) {
      return refused("not_available");
    }
    if ((await payrollOf(tx, saveId, club.id)) - player.wage + wage > club.wageBudget) {
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

/**
 * Puts a player of the managed club on sale and accepts the best AI bid at once, unless he arrived in this window; in
 * the year after he arrived, that bid is at most his resale cap (resaleCap). The fee quoteSquad shows.
 */
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
      clubSaveId: buyer.id,
      contractUntil,
    };
  }, TRANSACTION_OPTIONS);
}
