import { ratingAt, type Position } from "./positions";

/** Proposals an entry of the market keeps at most. */
export const MAX_PROPOSALS_PER_ENTRY = 10;

/** A gem is this old at most… */
const GEM_MAX_AGE = 21;

/** …with at least this much room between his rating and his potential. */
const GEM_MIN_GROWTH = 6;

/** A bargain costs at most this share of his market value… */
const BARGAIN_MAX_PRICE_SHARE = 0.75;

/** …and is rated at most this far below the weak spot. */
const BARGAIN_MAX_GAP_TO_WEAK_SPOT = 3;

export const MARKET_ENTRIES = ["needs", "gems", "bargains", "stars"] as const;

export type MarketEntry = (typeof MARKET_ENTRIES)[number];

export type ProposalTag = "best" | "gem" | "bargain" | "star" | "fit";

export type WeakSpot = {
  position: Position;
  rating: number; // rounded
};

/** A starter of the eleven; a slot without a starter has no entry. */
export type ElevenSlot = {
  slot: Position;
  rating: number; // his rating in that slot
};

export type MarketCandidate = {
  playerKey: string; // stable identity: draws his secondary positions, and breaks every tie
  position: Position;
  age: number;
  overall: number;
  potential: number;
  askingPrice: number; // euros; 0 for a free agent
  askedWage: number; // euros per season
  minimumReputation: number; // the lowest reputation of a club he joins
  marketValue: number; // euros
};

export type MarketBuyer = {
  reputation: number;
  budget: number; // euros
  wageRoom: number; // euros per season left under the wage budget
};

export type Proposal<C extends MarketCandidate = MarketCandidate> = {
  candidate: C;
  slot: Position; // where he would play in the eleven
  impact: number; // his rounded rating in the slot, less the starter's: negative when he would not improve it
  tag: ProposalTag;
};

type SlotImpact = Pick<Proposal, "slot" | "impact">;

const byKey = (a: MarketCandidate, b: MarketCandidate): number =>
  a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0;

const byGem = (a: MarketCandidate, b: MarketCandidate): number =>
  b.potential - a.potential || a.askingPrice - b.askingPrice || byKey(a, b);

const byBargain = (a: MarketCandidate, b: MarketCandidate): number =>
  b.marketValue - b.askingPrice - (a.marketValue - a.askingPrice) || b.overall - a.overall || byKey(a, b);

const byStar = (a: MarketCandidate, b: MarketCandidate): number =>
  b.overall - a.overall || a.askingPrice - b.askingPrice || byKey(a, b);

/** Who would accept the club and whom it can pay: nobody else is ever proposed. */
const isEligible = (candidate: MarketCandidate, buyer: MarketBuyer): boolean =>
  buyer.reputation >= candidate.minimumReputation && candidate.askingPrice <= buyer.budget && candidate.askedWage <= buyer.wageRoom;

const isGem = (candidate: MarketCandidate): boolean =>
  candidate.age <= GEM_MAX_AGE && candidate.potential >= candidate.overall + GEM_MIN_GROWTH;

const hasBargainPrice = (candidate: MarketCandidate): boolean =>
  candidate.marketValue > 0 && candidate.askingPrice <= BARGAIN_MAX_PRICE_SHARE * candidate.marketValue;

const roundedRatingAt = (candidate: MarketCandidate, slot: Position): number =>
  Math.round(ratingAt({ id: candidate.playerKey, position: candidate.position, overall: candidate.overall }, slot));

/** The starter rated lowest in his slot, the first of the eleven on a tie; null for an empty eleven. */
export function weakSpotOf(eleven: readonly ElevenSlot[]): WeakSpot | null {
  let weakest: ElevenSlot | undefined;
  for (const starter of eleven) {
    if (weakest === undefined || starter.rating < weakest.rating) {
      weakest = starter;
    }
  }
  return weakest === undefined ? null : { position: weakest.slot, rating: Math.round(weakest.rating) };
}

/**
 * The slot of the eleven where a candidate brings the most, the first of the eleven on a tie. An empty eleven has no
 * starter to measure him against: his own position, no impact.
 */
function bestSlot(candidate: MarketCandidate, eleven: readonly ElevenSlot[]): SlotImpact {
  let best: SlotImpact | undefined;
  for (const { slot, rating } of eleven) {
    const impact = roundedRatingAt(candidate, slot) - Math.round(rating);
    if (best === undefined || impact > best.impact) {
      best = { slot, impact };
    }
  }
  return best ?? { slot: candidate.position, impact: 0 };
}

/** What a need brings besides filling the gap, for all but the first. */
function needTag(candidate: MarketCandidate): ProposalTag {
  if (isGem(candidate)) {
    return "gem";
  }
  return hasBargainPrice(candidate) ? "bargain" : "fit";
}

/** Candidates who would improve the weak spot: the biggest gain first, then the cheapest. */
function needsOf<C extends MarketCandidate>(eligible: readonly C[], weakSpot: WeakSpot | null): Proposal<C>[] {
  if (weakSpot === null) {
    return [];
  }
  return eligible
    .map((candidate) => ({ candidate, impact: roundedRatingAt(candidate, weakSpot.position) - weakSpot.rating }))
    .filter(({ impact }) => impact > 0)
    .sort(
      (a, b) =>
        b.impact - a.impact ||
        a.candidate.askingPrice - b.candidate.askingPrice ||
        b.candidate.overall - a.candidate.overall ||
        byKey(a.candidate, b.candidate),
    )
    .slice(0, MAX_PROPOSALS_PER_ENTRY)
    .map(({ candidate, impact }, rank): Proposal<C> => ({
      candidate,
      slot: weakSpot.position,
      impact,
      tag: rank === 0 ? "best" : needTag(candidate),
    }));
}

/** The first candidates by `order`, each placed in the slot where he brings the most. */
function topOf<C extends MarketCandidate>(
  candidates: readonly C[],
  order: (a: MarketCandidate, b: MarketCandidate) => number,
  tag: ProposalTag,
  eleven: readonly ElevenSlot[],
): Proposal<C>[] {
  return [...candidates]
    .sort(order)
    .slice(0, MAX_PROPOSALS_PER_ENTRY)
    .map((candidate): Proposal<C> => ({ candidate, ...bestSlot(candidate, eleven), tag }));
}

/**
 * What the buying screen proposes: the eligible candidates in each entry, MAX_PROPOSALS_PER_ENTRY at most, in a total
 * order (the player key breaks every tie, so the order of `candidates` never shows). An empty eleven has no weak spot,
 * hence no needs and no rating for a bargain to reach.
 */
export function proposeSignings<C extends MarketCandidate>(
  eleven: readonly ElevenSlot[],
  candidates: readonly C[],
  buyer: MarketBuyer,
): { weakSpot: WeakSpot | null; entries: Record<MarketEntry, Proposal<C>[]> } {
  const weakSpot = weakSpotOf(eleven);
  const eligible = candidates.filter((candidate) => isEligible(candidate, buyer));
  const isBargain = (candidate: MarketCandidate): boolean =>
    hasBargainPrice(candidate) && (weakSpot === null || candidate.overall >= weakSpot.rating - BARGAIN_MAX_GAP_TO_WEAK_SPOT);
  return {
    weakSpot,
    entries: {
      needs: needsOf(eligible, weakSpot),
      gems: topOf(eligible.filter(isGem), byGem, "gem", eleven),
      bargains: topOf(eligible.filter(isBargain), byBargain, "bargain", eleven),
      stars: topOf(eligible, byStar, "star", eleven),
    },
  };
}
