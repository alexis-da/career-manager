import { addYears } from "../lib/dates";
import type { Rng } from "../lib/rng";
import {
  ASKING_PRICE_BY_SEASONS_LEFT,
  FREE_AGENT_MIN_WAGE_SHARE,
  MARKET_VALUE_STEP,
  MIN_GOALKEEPERS,
  PLAYER_REPUTATION_MARGIN,
  REPUTATION_STEP_DOWN,
  RESALE_CAP_FEE_PERCENT,
  RESALE_CAP_VALUE_PERCENT,
  SALE_BID_SHARE_MAX,
  SALE_BID_SHARE_MIN,
  SALE_MAX_BIDDERS,
  SQUAD_SIZE_MIN,
  TRANSFER_MIN_WAGE_RAISE,
  WAGE_SALE_MIN_FEE_SHARE,
  WAGE_STEP,
} from "./balance";
import { interpolate, lerp } from "./curves";
import { contractYears, marketValueFor, wageFor } from "./economy";

export type OfferPlayer = {
  age: number; // whole years at the offer date
  overall: number;
  potential: number;
  wage: number; // current wage, euros per season
  seasonsLeft: number; // seasons left on the contract, the current one included; 0 for a free agent
};

export type OfferClub = {
  reputation: number; // 1–99
};

export type OfferRefusal = "fee_too_low" | "wage_too_low" | "club_reputation_too_low";

export type OfferEvaluation = {
  accepted: boolean;
  clubAccepts: boolean;
  playerAccepts: boolean;
  askingPrice: number; // euros; 0 for a free agent
  minimumWage: number; // euros per season
  refusals: OfferRefusal[];
};

export type RenewalEvaluation = {
  accepted: boolean;
  minimumWage: number;
};

export type BidderClub = OfferClub & {
  slug: string; // stable key: bids are ordered by it on ties, never by a database id
  budget: number; // euros
  wageRoom: number; // euros per season left under the wage budget
};

export type SaleBid = {
  clubSlug: string;
  fee: number;
  wage: number;
  years: number;
};

const roundToStep = (value: number, step: number): number => Math.round(value / step) * step;

/**
 * Smallest multiple of step at or above value. Rounds to the euro first: a product such as 3 000 000 × 1.1
 * is 3 300 000.0000000005 in floating point and must not become the next step.
 */
const ceilToStep = (value: number, step: number): number => Math.ceil(Math.round(value) / step) * step;

/** Fee a club asks for its player: the market value, scaled by the seasons left on his contract. */
export function askingPrice(player: OfferPlayer): number {
  return roundToStep(
    marketValueFor(player) * interpolate(ASKING_PRICE_BY_SEASONS_LEFT, player.seasonsLeft),
    MARKET_VALUE_STEP,
  );
}

/**
 * Lowest wage a player accepts to join a club, rounded up to WAGE_STEP: his current wage plus
 * TRANSFER_MIN_WAGE_RAISE when he leaves a club, FREE_AGENT_MIN_WAGE_SHARE of his market wage when he is a
 * free agent (sellingClub null).
 */
export function minimumWage(player: OfferPlayer, sellingClub: OfferClub | null): number {
  return sellingClub === null
    ? ceilToStep(wageFor(player) * FREE_AGENT_MIN_WAGE_SHARE, WAGE_STEP)
    : ceilToStep(player.wage * (1 + TRANSFER_MIN_WAGE_RAISE), WAGE_STEP);
}

/** Lowest reputation of a club the player accepts to join: close to his level and to his current club's. */
export function minimumReputation(player: OfferPlayer, sellingClub: OfferClub | null): number {
  const byRating = player.overall - PLAYER_REPUTATION_MARGIN;
  return sellingClub === null ? byRating : Math.max(byRating, sellingClub.reputation - REPUTATION_STEP_DOWN);
}

/**
 * Immediate answer to an offer, with no pending state. The selling club accepts a fee at or above its
 * asking price; the player accepts a wage at or above his minimum from a club reputed enough. For a free
 * agent, pass sellingClub null: there is no fee to accept.
 */
export function evaluateOffer(
  player: OfferPlayer,
  sellingClub: OfferClub | null,
  buyingClub: OfferClub,
  fee: number,
  wage: number,
): OfferEvaluation {
  const asking = sellingClub === null ? 0 : askingPrice(player);
  const wageFloor = minimumWage(player, sellingClub);
  const refusals: OfferRefusal[] = [];
  if (fee < asking) {
    refusals.push("fee_too_low");
  }
  if (wage < wageFloor) {
    refusals.push("wage_too_low");
  }
  if (buyingClub.reputation < minimumReputation(player, sellingClub)) {
    refusals.push("club_reputation_too_low");
  }
  const clubAccepts = !refusals.includes("fee_too_low");
  const playerAccepts = !refusals.includes("wage_too_low") && !refusals.includes("club_reputation_too_low");
  return {
    accepted: clubAccepts && playerAccepts,
    clubAccepts,
    playerAccepts,
    askingPrice: asking,
    minimumWage: wageFloor,
    refusals,
  };
}

/** A player extends his contract for at least his current wage or his market wage, whichever is higher. */
export function evaluateRenewal(player: OfferPlayer, wage: number): RenewalEvaluation {
  const floor = Math.max(player.wage, wageFor(player));
  return { accepted: wage >= floor, minimumWage: floor };
}

/** Seed of the bids for a player put on sale on a date. */
export function saleRngSeed(saveSeed: string, date: Date, playerKey: string): string {
  return `${saveSeed}:sale:${date.toISOString().slice(0, 10)}:${playerKey}`;
}

/** A player's arrival at the managed club: bought for a fee, or signed free. */
export type ClubArrival = { date: Date; type: "TRANSFER" | "FREE"; fee: number };

/** The highest fee the AI clubs offer for a player in the year after he joined the managed club, and how he joined. */
export type ResaleCap = { kind: "purchase" | "free"; fee: number };

/**
 * The cap on the AI offers for a player of the managed club on a date, from his arrivals at the club: for a year after
 * the last one, up to the day before the same day a year later (addYears), RESALE_CAP_FEE_PERCENT of the fee paid for a
 * player bought, RESALE_CAP_VALUE_PERCENT of his market value on that date for a player signed free, rounded down to
 * the euro; of two arrivals on that last day, the lower. Null without an arrival in that year.
 */
export function resaleCap(arrivals: readonly ClubArrival[], player: OfferPlayer, date: Date): ResaleCap | null {
  if (arrivals.length === 0) {
    return null;
  }
  const last = arrivals.reduce((latest, arrival) => (arrival.date > latest.date ? arrival : latest));
  if (date >= addYears(last.date, 1)) {
    return null;
  }
  return arrivals
    .filter((arrival) => arrival.date.getTime() === last.date.getTime())
    .map(
      (arrival): ResaleCap =>
        arrival.type === "TRANSFER"
          ? { kind: "purchase", fee: Math.floor((arrival.fee * RESALE_CAP_FEE_PERCENT) / 100) }
          : { kind: "free", fee: Math.floor((marketValueFor(player) * RESALE_CAP_VALUE_PERCENT) / 100) },
    )
    .reduce((lowest, cap) => (cap.fee < lowest.fee ? cap : lowest));
}

/** The order in which AI clubs bid for a player on sale: most reputed first, then by slug. */
export function biddingOrder(a: BidderClub, b: BidderClub): number {
  return b.reputation - a.reputation || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

/** The bids of a walk down the bidding order, and whether it got to its end. */
export type SaleWalk = {
  bids: SaleBid[]; // best first: highest fee, then highest reputation
  done: boolean; // false: the walk ran past the last club it was given while others follow, and needs them
};

/**
 * Bids of AI clubs for a player the managed club puts on sale, walking down the clubs in bidding order (biddingOrder):
 * only clubs the player would join, with wage room for his minimum wage, bid, at most SALE_MAX_BIDDERS, each offering a
 * drawn share of his market value when its budget allows. The clubs may be the first of that order only, the others
 * still to be read (`more`): a walk that needs one past them is not done, and is to be started again, with a new stream
 * from the same seed, once more are read. Every club reached draws as it would in a walk given all of them, so the bids
 * of a walk that is done are those of saleBids. Returned best first: highest fee, then highest reputation.
 *
 * feeCap (resaleCap): a club that draws a higher fee, and can pay it, offers the cap instead. It draws nothing: the clubs
 * that bid, their wages and contracts, are those of the walk without it, only their fees are lowered, and the most
 * reputed of the clubs offering the cap makes the best bid.
 */
export function walkSaleBids(
  player: OfferPlayer,
  sellingClub: OfferClub,
  ordered: readonly BidderClub[],
  more: boolean,
  rng: Rng,
  feeCap: number = Number.POSITIVE_INFINITY,
): SaleWalk {
  const value = marketValueFor(player);
  const wage = minimumWage(player, sellingClub);
  const reputationFloor = minimumReputation(player, sellingClub);
  const reputationBySlug = new Map<string, number>();

  const bids: SaleBid[] = [];
  let done = true;
  for (let index = 0; bids.length < SALE_MAX_BIDDERS; index++) {
    const club = ordered.at(index);
    if (club === undefined) {
      done = !more;
      break;
    }
    // In bidding order, every club after one the player would not join is reputed less still.
    if (club.reputation < reputationFloor) {
      break;
    }
    if (club.wageRoom < wage) {
      continue;
    }
    const fee = roundToStep(value * lerp(SALE_BID_SHARE_MIN, SALE_BID_SHARE_MAX, rng()), MARKET_VALUE_STEP);
    if (fee > club.budget) {
      continue;
    }
    reputationBySlug.set(club.slug, club.reputation);
    bids.push({ clubSlug: club.slug, fee: Math.min(fee, feeCap), wage, years: contractYears(player.age, rng) });
  }

  const reputationOf = (bid: SaleBid): number => reputationBySlug.get(bid.clubSlug) ?? 0;
  bids.sort((a, b) => b.fee - a.fee || reputationOf(b) - reputationOf(a) || (a.clubSlug < b.clubSlug ? -1 : 1));
  return { bids, done };
}

/** Bids of AI clubs for a player the managed club puts on sale (walkSaleBids), all the clubs given in any order. */
export function saleBids(
  player: OfferPlayer,
  sellingClub: OfferClub,
  bidders: readonly BidderClub[],
  rng: Rng,
): SaleBid[] {
  return walkSaleBids(player, sellingClub, [...bidders].sort(biddingOrder), false, rng).bids;
}

/** A player of an AI club over its wage budget, as planWageSales reads him. */
export type WageSalePlayer = OfferPlayer & {
  id: string; // stable player key
  goalkeeper: boolean;
};

export type WageSale = SaleBid & { playerId: string };

/**
 * Sales of an AI club whose payroll is above its wage budget: its best-paid players first, each to the best bid of the
 * other AI clubs (saleBids: clubs he would join, with the budget and the wage room), never under
 * WAGE_SALE_MIN_FEE_SHARE of his market value, until the payroll is back within the budget. A player without such a bid
 * stays and the next best paid is tried; the squad never drops under SQUAD_SIZE_MIN players nor MIN_GOALKEEPERS
 * goalkeepers. Each sale takes the buyer's budget and wage room for the next ones. Nothing when within the budget.
 */
export function planWageSales(
  seller: OfferClub & { wageBudget: number },
  squad: readonly WageSalePlayer[],
  buyers: readonly BidderClub[],
  rngFor: (playerId: string) => Rng,
): WageSale[] {
  let payroll = squad.reduce((sum, player) => sum + player.wage, 0);
  if (payroll <= seller.wageBudget) {
    return [];
  }
  const market = buyers.map((buyer) => ({ ...buyer }));
  let size = squad.length;
  let goalkeepers = squad.filter((player) => player.goalkeeper).length;
  const sales: WageSale[] = [];

  const byWage = [...squad].sort((a, b) => b.wage - a.wage || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const player of byWage) {
    if (payroll <= seller.wageBudget || size <= SQUAD_SIZE_MIN) {
      break;
    }
    if (player.goalkeeper && goalkeepers <= MIN_GOALKEEPERS) {
      continue;
    }
    const floor = WAGE_SALE_MIN_FEE_SHARE * marketValueFor(player);
    const bid = saleBids(player, seller, market, rngFor(player.id)).find((candidate) => candidate.fee >= floor);
    const buyer = bid === undefined ? undefined : market.find((club) => club.slug === bid.clubSlug);
    if (bid === undefined || buyer === undefined) {
      continue;
    }
    sales.push({ ...bid, playerId: player.id });
    buyer.budget -= bid.fee;
    buyer.wageRoom -= bid.wage;
    payroll -= player.wage;
    size--;
    goalkeepers -= player.goalkeeper ? 1 : 0;
  }
  return sales;
}

/** Seed of the bids for a player an AI club over its wage budget sells in a preseason. */
export function wageSaleRngSeed(saveSeed: string, startYear: number, playerKey: string): string {
  return `${saveSeed}:wage-sale:${startYear}:${playerKey}`;
}
