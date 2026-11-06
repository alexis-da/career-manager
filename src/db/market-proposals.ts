import { displayClubName } from "../engine/club-name";
import { marketValueFor } from "../engine/economy";
import type { AttributeName } from "../engine/generation";
import {
  MARKET_ENTRIES,
  proposeSignings,
  type MarketCandidate,
  type MarketEntry,
  type Proposal,
  type ProposalTag,
  type WeakSpot,
} from "../engine/market-proposals";
import { ratingAt, type Position } from "../engine/positions";
import type { Prisma } from "../generated/prisma/client";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { prisma } from "./client";
import { getManagedLineup } from "./lineup";
import { getMarketOverview } from "./market";
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

/** What choosing takes, for every player of the world: the rest is read for those proposed, a few dozen. */
const CANDIDATE_SELECT = {
  id: true,
  playerKey: true,
  birthDate: true,
  position: true,
  overall: true,
  potential: true,
  wage: true,
  contractUntil: true,
  clubSave: { select: { isManaged: true, reputation: true } },
} as const;

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
  clubSave: { select: { club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true } } } },
} as const;

type CandidateRow = Prisma.PlayerSaveGetPayload<{ select: typeof CANDIDATE_SELECT }>;
type ViewRow = Prisma.PlayerSaveGetPayload<{ select: typeof VIEW_SELECT }>;

type Candidate = MarketCandidate & { id: string };

function toCandidate(row: CandidateRow, currentDate: Date): Candidate {
  const age = ageInYears(row.birthDate, currentDate);
  const quote = quoteFor(row, row.clubSave, currentDate);
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

function toMarketProposal({ candidate, slot, impact, tag }: Proposal<Candidate>, row: ViewRow): MarketProposal {
  const club = row.clubSave?.club ?? null;
  return {
    id: candidate.id,
    playerKey: candidate.playerKey,
    firstName: row.firstName,
    lastName: row.lastName,
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
      pace: row.pace,
      shooting: row.shooting,
      passing: row.passing,
      dribbling: row.dribbling,
      defending: row.defending,
      physical: row.physical,
      goalkeeping: row.goalkeeping,
    },
    slot,
    impact,
    tag,
  };
}

/**
 * What the buying screen proposes today, among the players of the AI clubs and the free agents. Prices depend on the
 * current date, so candidates are quoted and sorted here rather than in SQL, as listClubPlayers does. Read only.
 */
export async function getMarketProposals(saveId: string): Promise<MarketProposals> {
  const [overview, { lineup }, clubPlayers, freeAgents] = await Promise.all([
    getMarketOverview(saveId),
    getManagedLineup(saveId),
    prisma.playerSave.findMany({ where: { saveId, clubSave: { saveId, isManaged: false } }, select: CANDIDATE_SELECT }),
    prisma.playerSave.findMany({ where: freeAgentWhere(saveId), select: CANDIDATE_SELECT }),
  ]);

  const { weakSpot, entries, wageBound } = proposeSignings(
    // A slot nobody could fill is not in starters: it is never the weak spot, nor a slot to play in.
    lineup.starters.map(({ player, slot }) => ({ slot, rating: ratingAt(player, slot) })),
    [...clubPlayers, ...freeAgents].map((row) => toCandidate(row, overview.currentDate)),
    overview,
  );
  const proposed = MARKET_ENTRIES.flatMap((entry) => entries[entry].map(({ candidate }) => candidate.id));
  const rows = await prisma.playerSave.findMany({ where: { saveId, id: { in: [...new Set(proposed)] } }, select: VIEW_SELECT });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const views = (proposals: Proposal<Candidate>[]): MarketProposal[] =>
    proposals.map((proposal) => toMarketProposal(proposal, getOrThrow(byId, proposal.candidate.id, "proposed player")));
  return {
    weakSpot,
    entries: {
      needs: views(entries.needs),
      gems: views(entries.gems),
      bargains: views(entries.bargains),
      stars: views(entries.stars),
    },
    wageBound,
  };
}
