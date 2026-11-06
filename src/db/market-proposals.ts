import { PLAYER_REPUTATION_MARGIN, REPUTATION_STEP_DOWN } from "../engine/balance";
import { displayClubName } from "../engine/club-name";
import { marketValueFor } from "../engine/economy";
import { RATING_MAX, RATING_MIN, type AttributeName } from "../engine/generation";
import {
  entryBound,
  entryRules,
  firstOf,
  gemBirthDateFloor,
  highestWagePaid,
  isEligible,
  isReachable,
  isSettled,
  lowestOverallIn,
  MARKET_ENTRIES,
  proposeSignings,
  settlingFloor,
  weakSpotOf,
  type MarketBuyer,
  type MarketCandidate,
  type MarketEntry,
  type Proposal,
  type ProposalTag,
  type RankedEntry,
  type WeakSpot,
} from "../engine/market-proposals";
import { ratingAt, type Position } from "../engine/positions";
import type { Prisma } from "../generated/prisma/client";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { prisma } from "./client";
import { getManagedLineup } from "./lineup";
import { freeAgentWhere, quoteFor } from "./transfers";

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
  askingPrice: number; // euros; 0 for a free agent
  askedWage: number; // lowest wage he accepts, euros per season
  marketValue: number; // euros
  attributes: Record<AttributeName, number>;
  slot: Position; // where he would play in the eleven
  impact: number; // his rounded rating in the slot, less the starter's
  tag: ProposalTag;
};

export type MarketProposals = {
  weakSpot: WeakSpot | null;
  entries: Record<MarketEntry, MarketProposal[]>;
  // The wage room alone keeps the entry's players out (proposeSignings); Needs then proposes those it still pays.
  wageBound: Record<MarketEntry, boolean>;
};

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

type Candidate = MarketCandidate & { id: string };

/** The managed club as a buyer, on the save's current date. */
type Buyer = MarketBuyer & { clubSaveId: string; currentDate: Date };

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

/** The managed club's reputation and money, and the save's date: what a player's terms are weighed against. */
async function buyerOf(saveId: string): Promise<Buyer> {
  const [save, club] = await Promise.all([
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
    prisma.clubSave.findFirstOrThrow({
      where: { saveId, isManaged: true },
      select: { id: true, reputation: true, budget: true, wageBudget: true },
    }),
  ]);
  const { _sum } = await prisma.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } });
  return {
    clubSaveId: club.id,
    currentDate: save.currentDate,
    reputation: club.reputation,
    budget: club.budget,
    wageRoom: club.wageBudget - (_sum.wage ?? 0),
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
 * The first player of `where` that `takes` accepts, the lowest rated first, from `lowest` up: where the cheapest of a
 * kind shows. A first batch in the order of the index on (saveId, overall), then whole values upwards from its last
 * one, MAX_LEVELS at a time at most. Undefined when no player has it.
 */
async function lowestRatedOf<T>(
  where: Prisma.PlayerSaveWhereInput,
  lowest: number,
  takes: (rows: readonly Row[]) => T | undefined,
): Promise<T | undefined> {
  const from = (value: number): Prisma.PlayerSaveWhereInput => (value <= RATING_MIN ? {} : { overall: { gte: value } });
  const first = await prisma.playerSave.findMany({
    where: { AND: [where, from(lowest)] },
    orderBy: { overall: "asc" },
    take: FIRST_BATCH,
    select: ROW_SELECT,
  });
  const found = takes(first);
  const last = first.at(-1);
  if (found !== undefined || last === undefined || first.length < FIRST_BATCH) {
    return found;
  }
  // The last batch takes anything above.
  for (let value = last.overall, levels = 1; ; value += levels, levels = Math.min(MAX_LEVELS, levels * 2)) {
    const above = value + levels > RATING_MAX;
    const rows = await prisma.playerSave.findMany({
      where: { AND: [where, from(value), above ? {} : { overall: { lt: value + levels } }] },
      select: ROW_SELECT,
    });
    const found = takes(rows);
    if (found !== undefined || above) {
      return found;
    }
  }
}

/**
 * The players the buying screen can propose, as few as proposeSignings needs to give what it would give with every
 * player of the save: the four entries' first ones, Needs' « affordable » ones when the wage room alone empties it, and
 * a player each entry would take with room enough, when it takes none. Free agents are few: all are read. Players of
 * the AI clubs whose wage the wage room pays are read by rating, the highest first, and by potential for Gems, until no
 * one left can enter an entry's first ones (entryBound), and never under the value at which, once they are as many as
 * the entry keeps, they are certain (settlingFloor). The queries keep exactly the players who would accept the managed
 * club and whose wage it pays; prices are checked here. Read only.
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

  // Every player read, once, whichever search read him: the reachable ones, and the eligible ones among them.
  const known = new Map<string, { row: Row; candidate: Candidate }>();
  const reachable: Candidate[] = [];
  const eligible: Candidate[] = [];
  const add = (rows: readonly Row[]): Candidate[] =>
    rows.map((row) => {
      const seen = known.get(row.id);
      if (seen !== undefined) {
        return seen.candidate;
      }
      const candidate = toCandidate(row, row.clubSaveId === null ? null : mostReputedClub, buyer.currentDate);
      known.set(row.id, { row, candidate });
      if (isReachable(candidate, buyer)) {
        reachable.push(candidate);
        if (isEligible(candidate, buyer)) {
          eligible.push(candidate);
        }
      }
      return candidate;
    });
  add(freeAgents);

  const settled = (entry: RankedEntry, search: Search): boolean =>
    search.exhausted || isSettled(rules[entry], firstOf(eligible, rules[entry]), entryBound(entry, weakSpot, search.edge));
  const settle = async (search: Search, entries: readonly RankedEntry[]): Promise<void> => {
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

  // Those whose asked wage the wage room pays (exact), by rating and by potential.
  const paid = { ...accepting, wage: { lte: highestWagePaid(buyer.wageRoom) } } satisfies Prisma.PlayerSaveWhereInput;
  const byRating = openSearch(paid, "overall", highestRating);
  await Promise.all([
    settle(byRating, ["stars", "needs", "bargains"]),
    settle(openSearch(paid, "potential", Infinity), ["gems"]),
  ]);

  /**
   * A player the entry would take with room enough for any wage: a free agent, or a player of the AI clubs, the lowest
   * rated first, the cheapest (the young only, for Gems).
   */
  const witnessOf = async (entry: MarketEntry): Promise<Candidate | undefined> => {
    const lowest = lowestOverallIn(entry, weakSpot);
    const free = reachable.find(rules[entry].takes);
    if (free !== undefined || lowest === Infinity) {
      return free;
    }
    const where = entry === "gems" ? { ...accepting, birthDate: { gt: gemBirthDateFloor(buyer.currentDate) } } : accepting;
    return lowestRatedOf(where, lowest, (rows) =>
      add(rows).find((candidate) => isReachable(candidate, buyer) && rules[entry].takes(candidate)),
    );
  };
  // An entry the eligible players leave empty is wage-bound when someone reachable would enter it.
  const witnesses = await Promise.all(
    MARKET_ENTRIES.map(async (entry) => (eligible.some(rules[entry].takes) ? undefined : witnessOf(entry))),
  );
  const wageBoundNeeds = witnesses[MARKET_ENTRIES.indexOf("needs")] !== undefined;
  if (wageBoundNeeds) {
    await settle(byRating, ["affordable"]);
  }

  const kept: RankedEntry[] = wageBoundNeeds ? ["affordable", ...MARKET_ENTRIES] : [...MARKET_ENTRIES];
  const chosen = new Set([
    ...kept.flatMap((entry) => firstOf(eligible, rules[entry]).map(({ id }) => id)),
    ...witnesses.flatMap((witness) => (witness === undefined ? [] : [witness.id])),
  ]);
  return [...chosen].map((id) => getOrThrow(known, id, "chosen player").row);
}

/**
 * What the buying screen proposes today, among the players of the AI clubs and the free agents: proposeSignings on the
 * few players chooseRows reads, each with his exact terms, from his club. Read only.
 */
export async function getMarketProposals(saveId: string): Promise<MarketProposals> {
  const [buyer, { lineup }] = await Promise.all([buyerOf(saveId), getManagedLineup(saveId)]);
  // A slot nobody could fill is not in starters: it is never the weak spot, nor a slot to play in.
  const eleven = lineup.starters.map(({ player, slot }) => ({ slot, rating: ratingAt(player, slot) }));
  const rows = await chooseRows(saveId, buyer, weakSpotOf(eleven));
  const views = await prisma.playerSave.findMany({
    where: { saveId, id: { in: rows.map(({ id }) => id) } },
    select: VIEW_SELECT,
  });
  const viewById = new Map(views.map((view) => [view.id, view]));
  const viewOf = (id: string): ViewRow => getOrThrow(viewById, id, "chosen player");

  const { weakSpot, entries, wageBound } = proposeSignings(
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
    wageBound,
  };
}
