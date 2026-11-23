import { ASKING_PRICE_BY_SEASONS_LEFT, MARKET_VALUE_AGE_FACTOR, MARKET_VALUE_STEP } from "./balance";
import { marketValueFor } from "./economy";
import { formationPositions, type FormationName } from "./formations";
import { RATING_MAX, RATING_MIN } from "./generation";
import { positionGroup, ratingAt, secondaryPositions, type Position, type PositionedPlayer } from "./positions";
import { minimumWage } from "./transfer-ai";

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

/** The four entries, and what Needs proposes instead when the wage room alone empties it (affordableAt). */
export type RankedEntry = MarketEntry | "affordable";

export type ProposalTag = "best" | "gem" | "bargain" | "star" | "fit" | "affordable";

/**
 * Why a slot is the weak spot: nobody can fill it (« empty »), its starter plays out of his line (« outOfLine », « Hors
 * poste »), or he is the starter rated lowest in his slot (« lowest »).
 */
export type WeakSpotReason = "empty" | "outOfLine" | "lowest";

export type WeakSpot = {
  position: Position;
  rating: number; // rounded; 0 for an empty slot, which anyone who can play there improves
  reason: WeakSpotReason;
};

/** A slot of the eleven a club fields, in the formation's order. */
export type ElevenSlot = {
  slot: Position;
  rating: number | null; // its starter's rating there; null when no available player is left to fill it
  outOfLine?: boolean; // its starter plays out of his line (« Hors poste »)
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

/**
 * An entry's rule: the candidates it takes, eligibility aside, and the numbers its order compares, the smallest first.
 * The player key breaks the ties they leave.
 */
export type EntryRule = {
  takes: (candidate: MarketCandidate) => boolean;
  keys: (candidate: MarketCandidate) => number[];
};

const byKey = (a: MarketCandidate, b: MarketCandidate): number =>
  a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0;

/** Two lists of keys of an entry, compared in order: negative when the first comes first. */
function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < a.length; index++) {
    const difference = a[index] - b[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/** Who would accept the club and whose price it can pay, the wage room aside. */
export const isReachable = (candidate: MarketCandidate, buyer: MarketBuyer): boolean =>
  buyer.reputation >= candidate.minimumReputation && candidate.askingPrice <= buyer.budget;

/** Who would accept the club and whom it can pay, price and wage: nobody else is ever proposed. */
export const isEligible = (candidate: MarketCandidate, buyer: MarketBuyer): boolean =>
  isReachable(candidate, buyer) && candidate.askedWage <= buyer.wageRoom;

const isGem = (candidate: MarketCandidate): boolean =>
  candidate.age <= GEM_MAX_AGE && candidate.potential >= candidate.overall + GEM_MIN_GROWTH;

const hasBargainPrice = (candidate: MarketCandidate): boolean =>
  candidate.marketValue > 0 && candidate.askingPrice <= BARGAIN_MAX_PRICE_SHARE * candidate.marketValue;

const roundedRatingAt = (candidate: MarketCandidate, slot: Position): number =>
  Math.round(ratingAt({ id: candidate.playerKey, position: candidate.position, overall: candidate.overall }, slot));

/** What a candidate brings at the weak spot: his rounded rating there, less the starter's. */
const impactAt = (candidate: MarketCandidate, weakSpot: WeakSpot): number =>
  roundedRatingAt(candidate, weakSpot.position) - weakSpot.rating;

/**
 * The rules of the entries, from the weak spot: Needs, those who would improve it, the biggest gain first, then the
 * cheapest, then the best rated; « affordable », anyone, in the same order; Gems, the young with room to grow, by
 * potential, then price; Bargains, those cheap for their value and not far below the weak spot, by the money saved, then
 * rating; Stars, anyone, by rating, then price. Without a weak spot, Needs and « affordable » take nobody.
 */
export function entryRules(weakSpot: WeakSpot | null): Record<RankedEntry, EntryRule> {
  const needKeys = (candidate: MarketCandidate): number[] => [
    weakSpot === null ? 0 : -impactAt(candidate, weakSpot),
    candidate.askingPrice,
    -candidate.overall,
  ];
  return {
    needs: { takes: (candidate) => weakSpot !== null && impactAt(candidate, weakSpot) > 0, keys: needKeys },
    affordable: { takes: () => weakSpot !== null, keys: needKeys },
    gems: { takes: isGem, keys: (candidate) => [-candidate.potential, candidate.askingPrice] },
    bargains: {
      takes: (candidate) =>
        hasBargainPrice(candidate) &&
        (weakSpot === null || candidate.overall >= weakSpot.rating - BARGAIN_MAX_GAP_TO_WEAK_SPOT),
      keys: (candidate) => [-(candidate.marketValue - candidate.askingPrice), -candidate.overall],
    },
    stars: { takes: () => true, keys: (candidate) => [-candidate.overall, candidate.askingPrice] },
  };
}

/** The first candidates of a pool in an entry, MAX_PROPOSALS_PER_ENTRY at most, in its total order. */
export function firstOf<C extends MarketCandidate>(pool: readonly C[], rule: EntryRule): C[] {
  return pool
    .filter(rule.takes)
    .map((candidate) => ({ candidate, keys: rule.keys(candidate) }))
    .sort((a, b) => compareKeys(a.keys, b.keys) || byKey(a.candidate, b.candidate))
    .slice(0, MAX_PROPOSALS_PER_ENTRY)
    .map(({ candidate }) => candidate);
}

/** Whether a player plays a slot out of his line (« Hors poste »): not at his position nor a secondary one, nor in his line. */
function isOutOfLine(player: PositionedPlayer, slot: Position): boolean {
  return (
    player.position !== slot &&
    !secondaryPositions(player.id, player.position).includes(slot) &&
    positionGroup(player.position) !== positionGroup(slot)
  );
}

/**
 * The eleven a club fields in a formation, slot by slot, in its order: each starter's rating in his slot and whether he
 * plays out of his line, and an empty slot where no available player was left to fill it (resolveLineup leaves such a
 * slot out of the starters: the injured and the suspended are not available). No slot at all without any starter: an
 * eleven yet to be picked has nothing to compare.
 */
export function elevenOf(
  formation: FormationName,
  starters: readonly { player: PositionedPlayer & { overall: number }; slot: Position; index: number }[],
): ElevenSlot[] {
  if (starters.length === 0) {
    return [];
  }
  const byIndex = new Map(starters.map((starter) => [starter.index, starter]));
  return formationPositions(formation).map((position, index): ElevenSlot => {
    const starter = byIndex.get(index);
    if (starter === undefined) {
      return { slot: position, rating: null };
    }
    const { player, slot } = starter;
    return { slot, rating: ratingAt(player, slot), outOfLine: isOutOfLine(player, slot) };
  });
}

/** How pressing a slot of the eleven is, the smallest first: empty, then held out of line, then by its starter's rating. */
const urgencyOf = ({ rating, outOfLine }: ElevenSlot): number[] =>
  rating === null ? [0, 0] : [outOfLine === true ? 1 : 2, rating];

/**
 * The weak spot of the eleven: an empty slot first, which no available player is left to fill; then a slot its starter
 * holds out of his line (« Hors poste »), the one rated lowest there; then the starter rated lowest in his slot. The
 * first of the eleven on a tie. An empty slot is rated 0: anyone who can play there improves it. Null without any
 * starter.
 */
export function weakSpotOf(eleven: readonly ElevenSlot[]): WeakSpot | null {
  const weakest = eleven[weakSpotIndexOf(eleven)];
  if (weakest === undefined) {
    return null;
  }
  const { slot, rating, outOfLine } = weakest;
  return rating === null
    ? { position: slot, rating: 0, reason: "empty" }
    : { position: slot, rating: Math.round(rating), reason: outOfLine === true ? "outOfLine" : "lowest" };
}

/** The weak spot's slot in the eleven, its index in the formation (weakSpotOf); -1 without one. */
export function weakSpotIndexOf(eleven: readonly ElevenSlot[]): number {
  let weakest = -1;
  eleven.forEach((slot, index) => {
    const current = eleven[weakest];
    if (current === undefined || compareKeys(urgencyOf(slot), urgencyOf(current)) < 0) {
      weakest = index;
    }
  });
  return eleven.every(({ rating }) => rating === null) ? -1 : weakest;
}

/**
 * The slot of the eleven where a candidate brings the most, the first of the eleven on a tie: his rounded rating there,
 * less its starter's, all of it in an empty slot. An eleven without any slot has no starter to measure him against: his
 * own position, no impact.
 */
function bestSlot(candidate: MarketCandidate, eleven: readonly ElevenSlot[]): SlotImpact {
  let best: SlotImpact | undefined;
  for (const { slot, rating } of eleven) {
    const impact = roundedRatingAt(candidate, slot) - Math.round(rating ?? 0);
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

/** What the buying screen proposes, entry by entry, and which entries the wage room alone empties. */
export type SigningProposals<C extends MarketCandidate> = {
  weakSpot: WeakSpot | null;
  entries: Record<MarketEntry, Proposal<C>[]>;
  // The wage room alone keeps the entry's players out: with room enough, it would propose some. Needs then proposes
  // those the room still pays at the weak spot (affordableAt), when there are any.
  wageBound: Record<MarketEntry, boolean>;
};

/**
 * What the buying screen proposes: the eligible candidates in each entry (who would accept the club and whom it can pay,
 * price and wage: nobody else is ever proposed), MAX_PROPOSALS_PER_ENTRY at most, in a total order (the player key breaks
 * every tie, so the order of `candidates` never shows). An empty eleven has no weak spot, hence no needs and no rating
 * for a bargain to reach. An entry the wage room alone empties is wage-bound; Needs then proposes the players the room
 * still pays at the weak spot, even rated below the starter, tagged « affordable » (affordableAt).
 */
export function proposeSignings<C extends MarketCandidate>(
  eleven: readonly ElevenSlot[],
  candidates: readonly C[],
  buyer: MarketBuyer,
): SigningProposals<C> {
  const weakSpot = weakSpotOf(eleven);
  const rules = entryRules(weakSpot);
  const reachable = candidates.filter((candidate) => isReachable(candidate, buyer));
  const eligible = reachable.filter((candidate) => isEligible(candidate, buyer));
  /** Needs and « affordable » stay at the weak spot, whatever a candidate would bring elsewhere. */
  const atWeakSpot = (entry: "needs" | "affordable"): Proposal<C>[] =>
    weakSpot === null
      ? []
      : firstOf(eligible, rules[entry]).map(
          (candidate, rank): Proposal<C> => ({
            candidate,
            slot: weakSpot.position,
            impact: impactAt(candidate, weakSpot),
            tag: entry === "affordable" ? "affordable" : rank === 0 ? "best" : needTag(candidate),
          }),
        );
  /** The other entries place each candidate in the slot where he brings the most. */
  const inBestSlot = (entry: Exclude<MarketEntry, "needs">, tag: ProposalTag): Proposal<C>[] =>
    firstOf(eligible, rules[entry]).map((candidate): Proposal<C> => ({ candidate, ...bestSlot(candidate, eleven), tag }));
  // With room enough for any wage, the entry would take someone: the reachable players it takes.
  const wageBound = Object.fromEntries(
    MARKET_ENTRIES.map((entry) => [
      entry,
      !eligible.some(rules[entry].takes) && reachable.some(rules[entry].takes),
    ]),
  ) as Record<MarketEntry, boolean>;
  return {
    weakSpot,
    entries: {
      needs: atWeakSpot(wageBound.needs ? "affordable" : "needs"),
      gems: inBestSlot("gems", "gem"),
      bargains: inBestSlot("bargains", "bargain"),
      stars: inBestSlot("stars", "star"),
    },
    wageBound,
  };
}

// ---------------------------------------------------------------- bounds of a search in the database
// The database reads the market's players in an order (rating, or potential for Gems), a few at a time: what follows
// bounds what the players left can do in each entry, so that it stops as soon as no one left can enter its first ones.

/** The smallest share of his market value a club asks for its player, whatever the seasons left (askingPrice). */
const MIN_ASKING_SHARE = Math.min(...ASKING_PRICE_BY_SEASONS_LEFT.map(([, share]) => share));

/**
 * Below any asking price of a club for its player: a market value is a whole number of MARKET_VALUE_STEP, one at least
 * (marketValueFor), and the club asks at least MIN_ASKING_SHARE of it, rounded to the nearest step (askingPrice): never
 * more than half a step under that share. Positive: a free agent, who costs nothing, comes before a club's player on a
 * tie of rating or potential.
 */
export const CLUB_ASKING_PRICE_FLOOR = MARKET_VALUE_STEP * MIN_ASKING_SHARE - MARKET_VALUE_STEP / 2;

/** The age a market value peaks at (MARKET_VALUE_AGE_FACTOR). */
const PEAK_VALUE_AGE = MARKET_VALUE_AGE_FACTOR.reduce((peak, point) => (point[1] > peak[1] ? point : peak))[0];

/** maxClubSaving by overall, from RATING_MIN to RATING_MAX: computed once, when first asked. */
let clubSavingCeilings: number[] | undefined;

/**
 * Above what a club's player rated `overall` or less saves his buyer, his market value less his asking price: his club
 * asks at least MIN_ASKING_SHARE of his value, less half a step of rounding, and his value is at most that of the peak
 * age and the highest potential at his rating (marketValueFor grows with both), itself at most the highest over the
 * ratings up to his. A step more for the rounding of the products.
 */
export function maxClubSaving(overall: number): number {
  if (clubSavingCeilings === undefined) {
    const ceilings: number[] = [];
    let highest = 0;
    for (let rating = RATING_MIN; rating <= RATING_MAX; rating++) {
      const value = marketValueFor({ age: PEAK_VALUE_AGE, overall: rating, potential: RATING_MAX });
      highest = Math.max(highest, value * (1 - MIN_ASKING_SHARE) + MARKET_VALUE_STEP / 2 + MARKET_VALUE_STEP);
      ceilings.push(highest);
    }
    clubSavingCeilings = ceilings;
  }
  const rating = Math.min(RATING_MAX, Math.max(RATING_MIN, Math.ceil(overall)));
  return clubSavingCeilings[rating - RATING_MIN];
}

/**
 * The lowest overall a candidate of an entry can have: a rating in a slot never exceeds the overall, so Needs takes
 * nobody rated at the weak spot or below, and Bargains nobody rated more than BARGAIN_MAX_GAP_TO_WEAK_SPOT below it.
 * Without a weak spot, Needs and « affordable » take nobody: Infinity. -Infinity when any overall will do.
 */
export function lowestOverallIn(entry: RankedEntry, weakSpot: WeakSpot | null): number {
  switch (entry) {
    case "needs":
      return weakSpot === null ? Infinity : weakSpot.rating + 1;
    case "affordable":
      return weakSpot === null ? Infinity : -Infinity;
    case "bargains":
      return weakSpot === null ? -Infinity : weakSpot.rating - BARGAIN_MAX_GAP_TO_WEAK_SPOT;
    case "gems":
    case "stars":
      return -Infinity;
  }
}

/**
 * Keys no club player left in a search can come before in an entry, from the highest overall a player left can have
 * (his potential for Gems): a lower bound of his keys in entryRules' order. Null when no such player can enter it, rated
 * under lowestOverallIn.
 */
export function entryBound(entry: RankedEntry, weakSpot: WeakSpot | null, highest: number): number[] | null {
  if (highest < lowestOverallIn(entry, weakSpot)) {
    return null;
  }
  switch (entry) {
    case "stars":
    case "gems":
      return [-highest, CLUB_ASKING_PRICE_FLOOR];
    case "bargains":
      return [-maxClubSaving(highest), -highest];
    case "needs":
    case "affordable":
      // His impact at the weak spot is his rounded rating there, never above his overall, less the starter's.
      return weakSpot === null ? null : [-(highest - weakSpot.rating), CLUB_ASKING_PRICE_FLOOR, -highest];
  }
}

/**
 * Whether an entry's first candidates are certain: no player left can enter (bound null), or they are as many as the
 * entry keeps, and the last of them comes before the bound of every player left, ties included.
 */
export function isSettled(rule: EntryRule, first: readonly MarketCandidate[], bound: readonly number[] | null): boolean {
  return (
    bound === null ||
    (first.length >= MAX_PROPOSALS_PER_ENTRY && compareKeys(rule.keys(first[MAX_PROPOSALS_PER_ENTRY - 1]), bound) < 0)
  );
}

/**
 * How far a search must still read for an entry's first ones to be settled whatever lies further, when the players left
 * have an overall (potential for Gems) of `highest` at most: the lowest value left to read, every player of that value
 * or more. Null while the first ones are fewer than the entry keeps: the next players read may change everything.
 */
export function settlingFloor(
  entry: RankedEntry,
  weakSpot: WeakSpot | null,
  first: readonly MarketCandidate[],
  highest: number,
): number | null {
  if (first.length < MAX_PROPOSALS_PER_ENTRY) {
    return null;
  }
  const rule = entryRules(weakSpot)[entry];
  // The bounds only tighten as the value falls: the first one that settles the entry is the floor's.
  for (let value = Math.min(highest - 1, RATING_MAX); value >= RATING_MIN - 1; value--) {
    if (isSettled(rule, first, entryBound(entry, weakSpot, value))) {
      return value + 1;
    }
  }
  return RATING_MIN;
}

/** Largest wage, euros per season, the database holds. */
const MAX_DATABASE_INT = 2_147_483_647;

/**
 * The highest current wage of a club's player whose asked wage to move (minimumWage) the wage room pays; -1 when it pays
 * none. Exact: the asked wage grows with the current wage.
 */
export function highestWagePaid(wageRoom: number): number {
  const asks = (wage: number): number =>
    minimumWage({ age: 0, overall: 0, potential: 0, wage, seasonsLeft: 0 }, { reputation: 0 });
  if (asks(0) > wageRoom) {
    return -1;
  }
  let low = 0;
  let high = MAX_DATABASE_INT;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (asks(middle) <= wageRoom) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/**
 * Before every gem's birth date, on a date: a gem is GEM_MAX_AGE at most, so born after the same day GEM_MAX_AGE + 1
 * years earlier (ageInYears), two days of margin for a 29 February and a time of day.
 */
export function gemBirthDateFloor(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear() - GEM_MAX_AGE - 1, date.getUTCMonth(), date.getUTCDate() - 2));
}
