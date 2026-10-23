import type { Rng } from "../lib/rng";
import {
  ASKING_PRICE_BY_SEASONS_LEFT,
  FREE_AGENT_MIN_WAGE_SHARE,
  MARKET_VALUE_STEP,
  MIN_GOALKEEPERS,
  PLAYER_REPUTATION_MARGIN,
  REPUTATION_STEP_DOWN,
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

/**
 * Bids of AI clubs for a player the managed club puts on sale. Only clubs the player would join, with wage
 * room for his minimum wage, bid: most reputed first, at most SALE_MAX_BIDDERS, each offering a drawn share
 * of his market value when its budget allows. Returned best first: highest fee, then highest reputation.
 */
export function saleBids(
  player: OfferPlayer,
  sellingClub: OfferClub,
  bidders: readonly BidderClub[],
  rng: Rng,
): SaleBid[] {
  const value = marketValueFor(player);
  const wage = minimumWage(player, sellingClub);
  const reputationFloor = minimumReputation(player, sellingClub);
  const eligible = bidders
    .filter((club) => club.reputation >= reputationFloor && club.wageRoom >= wage)
    .sort((a, b) => b.reputation - a.reputation || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const reputationBySlug = new Map(eligible.map((club) => [club.slug, club.reputation]));

  const bids: SaleBid[] = [];
  for (const club of eligible) {
    if (bids.length >= SALE_MAX_BIDDERS) {
      break;
    }
    const fee = roundToStep(value * lerp(SALE_BID_SHARE_MIN, SALE_BID_SHARE_MAX, rng()), MARKET_VALUE_STEP);
    if (fee > club.budget) {
      continue;
    }
    bids.push({ clubSlug: club.slug, fee, wage, years: contractYears(player.age, rng) });
  }

  const reputationOf = (bid: SaleBid): number => reputationBySlug.get(bid.clubSlug) ?? 0;
  return bids.sort(
    (a, b) => b.fee - a.fee || reputationOf(b) - reputationOf(a) || (a.clubSlug < b.clubSlug ? -1 : 1),
  );
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
