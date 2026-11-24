import { PLAYER_REPUTATION_MARGIN, REPUTATION_STEP_DOWN, SQUAD_LIMIT } from "../engine/balance";
import { displayClubName } from "../engine/club-name";
import { marketValueFor } from "../engine/economy";
import { RATING_MAX, RATING_MIN, type AttributeName } from "../engine/generation";
import {
  elevenOf,
  entryBound,
  entryRules,
  firstOf,
  isEligible,
  isSettled,
  MARKET_ENTRIES,
  proposeSignings,
  settlingFloor,
  weakSpotOf,
  type MarketBuyer,
  type MarketCandidate,
  type MarketEntry,
  type Proposal,
  type ProposalTag,
  type WeakSpot,
} from "../engine/market-proposals";
import type { Position } from "../engine/positions";
import type { Prisma } from "../generated/prisma/client";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { prisma } from "./client";
import { getManagedLineup } from "./lineup";
import { freeAgentWhere, quoteFor, squadSizeOf } from "./transfers";

export type MarketProposal = {
  id: string; // PlayerSave.id
  playerKey: string;
  firstName: string;
  lastName: string;
  age: number;
  position: Position;
  overall: number;
  potential: number;
  clubName: string | null; // null: a free agent
  clubColors: ClubColors | null;
  // Euros signing him takes from the budget: his club's asking price, or a free agent's signing bonus (TransferQuote).
  askingPrice: number;
  askedWage: number; // lowest wage he accepts, euros per season: written with his contract, never a condition
  marketValue: number; // euros
  attributes: Record<AttributeName, number>;
  slot: Position; // where he would play in the eleven
  impact: number; // his rounded rating in the slot, less the starter's
  tag: ProposalTag;
};

export type MarketProposals = {
  weakSpot: WeakSpot | null;
  entries: Record<MarketEntry, MarketProposal[]>;
  // Always false: no wage room keeps anyone out since the simplification (docs/design/simplification.md § 1.1). Kept
  // until the buying screen drops its wage panel.
  wageBound: Record<MarketEntry, boolean>;
  // The managed club has SQUAD_LIMIT players under contract or more: it signs nobody (squad_full), though the entries,
  // computed as ever, stay readable.
  squadFull: boolean;
};

/** No entry is ever wage-bound any more (MarketProposals.wageBound). */
const NEVER_WAGE_BOUND: Readonly<Record<MarketEntry, boolean>> = { needs: false, gems: false, bargains: false, stars: false };

/** What choosing takes for a player of the market: the rest is read for the few chosen. */
const ROW_SELECT = {
  id: true,
  playerKey: true,
  birthDate: true,
  position: true,
  overall: true,
  potential: true,
  wage: true,
  contractUntil: true,
  clubSaveId: true,
} as const;

/** The rest, for the few chosen: who they are, and their club, whose reputation their exact terms take. */
const VIEW_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  pace: true,
  shooting: true,
  passing: true,
  dribbling: true,
  defending: true,
  physical: true,
  goalkeeping: true,
  clubSave: {
    select: {
      isManaged: true,
      reputation: true,
      club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true } },
    },
  },
} as const;

type Row = Prisma.PlayerSaveGetPayload<{ select: typeof ROW_SELECT }>;
type ViewRow = Prisma.PlayerSaveGetPayload<{ select: typeof VIEW_SELECT }>;

/** A player of the market as proposeSignings weighs him, with his asked wage for the screen. */
type Candidate = MarketCandidate & { id: string; askedWage: number };

/** The managed club as a buyer, on the save's current date, with its players under contract. */
type Buyer = MarketBuyer & { clubSaveId: string; currentDate: Date; squadSize: number };

/** Players a search reads in its first batch, then twice as many in each next one, up to MAX_BATCH. */
const FIRST_BATCH = 32;
const MAX_BATCH = 512;

function toCandidate(row: Row, club: { isManaged: boolean; reputation: number } | null, currentDate: Date): Candidate {
  const age = ageInYears(row.birthDate, currentDate);
  const quote = quoteFor(row, club, currentDate);
  return {
    id: row.id,
    playerKey: row.playerKey,
    position: row.position,
    age,
    overall: row.overall,
    potential: row.potential,
    askingPrice: quote.askingPrice,
    askedWage: quote.minimumWage,
    minimumReputation: quote.minimumReputation,
    marketValue: marketValueFor({ age, overall: row.overall, potential: row.potential }),
  };
}

function toMarketProposal({ candidate, slot, impact, tag }: Proposal<Candidate>, view: ViewRow): MarketProposal {
  const club = view.clubSave?.club ?? null;
  return {
    id: candidate.id,
    playerKey: candidate.playerKey,
    firstName: view.firstName,
    lastName: view.lastName,
    age: candidate.age,
    position: candidate.position,
    overall: candidate.overall,
    potential: candidate.potential,
    clubName: club === null ? null : displayClubName(club),
    clubColors: club === null ? null : clubColorsOf(club),
    askingPrice: candidate.askingPrice,
    askedWage: candidate.askedWage,
    marketValue: candidate.marketValue,
    attributes: {
      pace: view.pace,
      shooting: view.shooting,
      passing: view.passing,
      dribbling: view.dribbling,
      defending: view.defending,
      physical: view.physical,
      goalkeeping: view.goalkeeping,
    },
    slot,
    impact,
    tag,
  };
}

/** The managed club's reputation, money and squad, and the save's date: what a player's terms are weighed against. */
async function buyerOf(saveId: string): Promise<Buyer> {
  const [save, club] = await Promise.all([
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
    prisma.clubSave.findFirstOrThrow({
      where: { saveId, isManaged: true },
      select: { id: true, reputation: true, budget: true },
    }),
  ]);
  return {
    clubSaveId: club.id,
    currentDate: save.currentDate,
    reputation: club.reputation,
    budget: club.budget,
    squadSize: await squadSizeOf(prisma, saveId, club.id),
  };
}

type SearchField = "overall" | "potential";

const onField = (field: SearchField, filter: Prisma.IntFilter): Prisma.PlayerSaveWhereInput =>
  field === "overall" ? { overall: filter } : { potential: filter };

/** Values a search reads at once at most, past a first batch: players are denser at each lower rating. */
const MAX_LEVELS = 4;

/**
 * Players read by a field, the highest first, whole values at a time: as many values as a batch needs at the density of
 * the last value read, MAX_LEVELS at most, or twice as many as the last batch's when it found nobody. By rating, a first
 * batch of the best ones comes first, in the order of the index on (saveId, overall), which then reads it alone; by
 * potential, values from the top straight away: a range of potential, which the planner weighs better than an order
 * beside the other conditions (it would read by rating instead).
 */
type Search = {
  /** The highest value a player left can have. */
  readonly edge: number;
  /** Every player is read. */
  readonly exhausted: boolean;
  /** Some `size` players more, none under `floor`. */
  read(size: number, floor: number): Promise<Row[]>;
};

function openSearch(where: Prisma.PlayerSaveWhereInput, field: SearchField, edge: number): Search {
  // Every player above `top` is read, and some of `top` after a first batch; null: nothing yet. `density`: the players of
  // the last value read; `levels`: the values the last batch read; `found`: whether it found anyone.
  const state = { edge, exhausted: false, top: null as number | null, density: 1, levels: MAX_LEVELS / 2, found: true };
  const atLeast = (floor: number): Prisma.PlayerSaveWhereInput => (floor <= RATING_MIN ? {} : onField(field, { gte: floor }));
  const keep = (rows: readonly Row[], last: number): void => {
    state.density = rows.filter((row) => row[field] === last).length;
    state.found = rows.length > 0;
  };
  return {
    get edge() {
      return state.edge;
    },
    get exhausted() {
      return state.exhausted;
    },
    async read(size, floor) {
      const { top } = state;
      if (top === null && field === "overall") {
        const rows = await prisma.playerSave.findMany({
          where: { AND: [where, atLeast(floor)] },
          orderBy: { overall: "desc" },
          take: size,
          select: ROW_SELECT,
        });
        const last = rows.at(-1);
        if (last === undefined || rows.length < size) {
          state.exhausted = floor <= RATING_MIN;
          state.top = floor - 1;
        } else {
          state.top = last.overall;
        }
        state.edge = state.top;
        keep(rows, state.top);
        return rows;
      }
      state.levels = state.found ? Math.min(MAX_LEVELS, Math.max(1, Math.floor(size / Math.max(1, state.density)))) : state.levels * 2;
      // From the top value on the first time: anything above it too.
      const lowest = Math.max(floor, (top ?? RATING_MAX) - state.levels + 1);
      const rows = await prisma.playerSave.findMany({
        where: { AND: [where, top === null ? {} : onField(field, { lte: top }), atLeast(lowest)] },
        select: ROW_SELECT,
      });
      state.exhausted = lowest <= RATING_MIN;
      state.top = lowest - 1;
      state.edge = lowest - 1;
      keep(rows, lowest);
      return rows;
    },
  };
}

/**
 * The players the buying screen can propose, as few as proposeSignings needs to give what it would give with every
 * player of the save: the four entries' first ones. Free agents are few: all are read. Players of the AI clubs are read
 * by rating, the highest first, and by potential for Gems, until no one left can enter an entry's first ones
 * (entryBound), and never under the value at which, once they are as many as the entry keeps, they are certain
 * (settlingFloor). The queries keep exactly the players who would accept the managed club, whatever their wage (no wage
 * room since the simplification, docs/design/simplification.md § 1.1); prices, a free agent's signing bonus included,
 * are checked here. Read only.
 */
async function chooseRows(saveId: string, buyer: Buyer, weakSpot: WeakSpot | null): Promise<Row[]> {
  const rules = entryRules(weakSpot);
  // A player joins no club reputed more than PLAYER_REPUTATION_MARGIN below his rating…
  const highestRating = buyer.reputation + PLAYER_REPUTATION_MARGIN;
  const [refusing, freeAgents] = await Promise.all([
    // …nor more than REPUTATION_STEP_DOWN below the club he leaves: these clubs' players refuse the managed club.
    prisma.clubSave.findMany({
      where: { saveId, reputation: { gt: buyer.reputation + REPUTATION_STEP_DOWN } },
      select: { id: true },
    }),
    prisma.playerSave.findMany({ where: { ...freeAgentWhere(saveId), overall: { lte: highestRating } }, select: ROW_SELECT }),
  ]);
  const accepting = {
    saveId,
    clubSaveId: { not: null, notIn: [buyer.clubSaveId, ...refusing.map(({ id }) => id)] },
    overall: { lte: highestRating },
  } satisfies Prisma.PlayerSaveWhereInput;
  // Their club's reputation is not read while searching: the query lets no club through above this one, and up to it
  // the reputation a player asks of a buyer (quoteFor) accepts the managed club exactly when his exact one does.
  const mostReputedClub = { isManaged: false, reputation: buyer.reputation + REPUTATION_STEP_DOWN };

  // Every player read, once, whichever search read him, and the eligible ones among them.
  const known = new Map<string, Row>();
  const eligible: Candidate[] = [];
  const add = (rows: readonly Row[]): void => {
    for (const row of rows) {
      if (known.has(row.id)) {
        continue;
      }
      const candidate = toCandidate(row, row.clubSaveId === null ? null : mostReputedClub, buyer.currentDate);
      known.set(row.id, row);
      if (isEligible(candidate, buyer)) {
        eligible.push(candidate);
      }
    }
  };
  add(freeAgents);

  const settled = (entry: MarketEntry, search: Search): boolean =>
    search.exhausted || isSettled(rules[entry], firstOf(eligible, rules[entry]), entryBound(entry, weakSpot, search.edge));
  const settle = async (search: Search, entries: readonly MarketEntry[]): Promise<void> => {
    for (let size = FIRST_BATCH; ; size = Math.min(size * 2, MAX_BATCH)) {
      const open = entries.filter((entry) => !settled(entry, search));
      if (open.length === 0) {
        return;
      }
      // Once every entry left has its first ones, none needs a player under the lowest of their floors.
      const floors = open.flatMap((entry) => {
        const floor = settlingFloor(entry, weakSpot, firstOf(eligible, rules[entry]), search.edge);
        return floor === null ? [] : [floor];
      });
      add(await search.read(size, floors.length === open.length ? Math.min(...floors) : -Infinity));
    }
  };

  // By rating and by potential.
  await Promise.all([
    settle(openSearch(accepting, "overall", highestRating), ["stars", "needs", "bargains"]),
    settle(openSearch(accepting, "potential", Infinity), ["gems"]),
  ]);

  const chosen = new Set(MARKET_ENTRIES.flatMap((entry) => firstOf(eligible, rules[entry]).map(({ id }) => id)));
  return [...chosen].map((id) => getOrThrow(known, id, "chosen player"));
}

/**
 * What the buying screen proposes today, among the players of the AI clubs and the free agents: proposeSignings on the
 * few players chooseRows reads, each with his exact terms, from his club; and whether the squad is full. Read only.
 */
export async function getMarketProposals(saveId: string): Promise<MarketProposals> {
  const [buyer, { formation, weakSpotLineup }] = await Promise.all([buyerOf(saveId), getManagedLineup(saveId)]);
  // Its slots, an empty one where no available player is left: the weak spot first, and a slot to play in. Read on the
  // eleven the market weighs (ManagedLineup.weakSpotLineup, docs/design/simplification.md § 3.4).
  const eleven = elevenOf(formation, weakSpotLineup.starters);
  const rows = await chooseRows(saveId, buyer, weakSpotOf(eleven));
  const views = await prisma.playerSave.findMany({
    where: { saveId, id: { in: rows.map(({ id }) => id) } },
    select: VIEW_SELECT,
  });
  const viewById = new Map(views.map((view) => [view.id, view]));
  const viewOf = (id: string): ViewRow => getOrThrow(viewById, id, "chosen player");

  const { weakSpot, entries } = proposeSignings(
    eleven,
    rows.map((row) => toCandidate(row, viewOf(row.id).clubSave, buyer.currentDate)),
    buyer,
  );
  const toViews = (proposals: Proposal<Candidate>[]): MarketProposal[] =>
    proposals.map((proposal) => toMarketProposal(proposal, viewOf(proposal.candidate.id)));
  return {
    weakSpot,
    entries: {
      needs: toViews(entries.needs),
      gems: toViews(entries.gems),
      bargains: toViews(entries.bargains),
      stars: toViews(entries.stars),
    },
    wageBound: { ...NEVER_WAGE_BOUND },
    squadFull: buyer.squadSize >= SQUAD_LIMIT,
  };
}
