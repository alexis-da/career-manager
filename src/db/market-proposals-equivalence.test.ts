import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { displayClubName } from "../engine/club-name";
import { marketValueFor } from "../engine/economy";
import {
  MARKET_ENTRIES,
  type ElevenSlot,
  type MarketBuyer,
  type MarketCandidate,
  type MarketEntry,
  type Proposal,
  type ProposalTag,
  type WeakSpot,
} from "../engine/market-proposals";
import { ratingAt, type Position } from "../engine/positions";
import type { WorldVersion } from "../engine/world-version";
import type { Prisma } from "../generated/prisma/client";
import { clubColorsOf } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import type { prisma as prismaClient } from "./client";
import type * as LineupModule from "./lineup";
import type * as MarketModule from "./market";
import type { getMarketProposals as GetMarketProposals, MarketProposal, MarketProposals } from "./market-proposals";
import type * as TransfersModule from "./transfers";

// getMarketProposals reads a few hundred players, by rating and potential, until no one left can change what it
// proposes. Proof that it proposes exactly what the implementation it replaced did, which read every player of the
// save: that implementation, as it stood at commit 829e62a, copied here (its database part, and proposeSignings with
// its helpers), against the new one on several saves, clubs, seeds and worlds, at creation and after matchdays, with the
// wage room and the budget of the managed club cut, and its reputation at both ends. Runs against DATABASE_URL, on
// throwaway saves; skipped without it. Modules are imported lazily because the client throws without DATABASE_URL.

// ------------------------------------------------------------------ the reference: proposeSignings at 829e62a

const MAX_PROPOSALS_PER_ENTRY = 10;
const GEM_MAX_AGE = 21;
const GEM_MIN_GROWTH = 6;
const BARGAIN_MAX_PRICE_SHARE = 0.75;
const BARGAIN_MAX_GAP_TO_WEAK_SPOT = 3;

type SlotImpact = Pick<Proposal, "slot" | "impact">;

const byKey = (a: MarketCandidate, b: MarketCandidate): number =>
  a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0;

const byGem = (a: MarketCandidate, b: MarketCandidate): number =>
  b.potential - a.potential || a.askingPrice - b.askingPrice || byKey(a, b);

const byBargain = (a: MarketCandidate, b: MarketCandidate): number =>
  b.marketValue - b.askingPrice - (a.marketValue - a.askingPrice) || b.overall - a.overall || byKey(a, b);

const byStar = (a: MarketCandidate, b: MarketCandidate): number =>
  b.overall - a.overall || a.askingPrice - b.askingPrice || byKey(a, b);

const isReachable = (candidate: MarketCandidate, buyer: MarketBuyer): boolean =>
  buyer.reputation >= candidate.minimumReputation && candidate.askingPrice <= buyer.budget;

const isGem = (candidate: MarketCandidate): boolean =>
  candidate.age <= GEM_MAX_AGE && candidate.potential >= candidate.overall + GEM_MIN_GROWTH;

const hasBargainPrice = (candidate: MarketCandidate): boolean =>
  candidate.marketValue > 0 && candidate.askingPrice <= BARGAIN_MAX_PRICE_SHARE * candidate.marketValue;

const roundedRatingAt = (candidate: MarketCandidate, slot: Position): number =>
  Math.round(ratingAt({ id: candidate.playerKey, position: candidate.position, overall: candidate.overall }, slot));

function weakSpotOf(eleven: readonly ElevenSlot[]): WeakSpot | null {
  let weakest: ElevenSlot | undefined;
  for (const starter of eleven) {
    if (weakest === undefined || starter.rating < weakest.rating) {
      weakest = starter;
    }
  }
  return weakest === undefined ? null : { position: weakest.slot, rating: Math.round(weakest.rating) };
}

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

function needTag(candidate: MarketCandidate): ProposalTag {
  if (isGem(candidate)) {
    return "gem";
  }
  return hasBargainPrice(candidate) ? "bargain" : "fit";
}

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

function affordableAt<C extends MarketCandidate>(eligible: readonly C[], weakSpot: WeakSpot | null): Proposal<C>[] {
  if (weakSpot === null) {
    return [];
  }
  return eligible
    .map((candidate) => ({ candidate, impact: roundedRatingAt(candidate, weakSpot.position) - weakSpot.rating }))
    .sort(
      (a, b) =>
        b.impact - a.impact ||
        a.candidate.askingPrice - b.candidate.askingPrice ||
        b.candidate.overall - a.candidate.overall ||
        byKey(a.candidate, b.candidate),
    )
    .slice(0, MAX_PROPOSALS_PER_ENTRY)
    .map(({ candidate, impact }): Proposal<C> => ({ candidate, slot: weakSpot.position, impact, tag: "affordable" }));
}

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

function proposeSignings<C extends MarketCandidate>(eleven: readonly ElevenSlot[], candidates: readonly C[], buyer: MarketBuyer) {
  const weakSpot = weakSpotOf(eleven);
  const reachable = candidates.filter((candidate) => isReachable(candidate, buyer));
  const eligible = reachable.filter((candidate) => candidate.askedWage <= buyer.wageRoom);
  const isBargain = (candidate: MarketCandidate): boolean =>
    hasBargainPrice(candidate) && (weakSpot === null || candidate.overall >= weakSpot.rating - BARGAIN_MAX_GAP_TO_WEAK_SPOT);
  const entriesOf = (pool: readonly C[]): Record<MarketEntry, Proposal<C>[]> => ({
    needs: needsOf(pool, weakSpot),
    gems: topOf(pool.filter(isGem), byGem, "gem", eleven),
    bargains: topOf(pool.filter(isBargain), byBargain, "bargain", eleven),
    stars: topOf(pool, byStar, "star", eleven),
  });
  const entries = entriesOf(eligible);
  const unbounded = entriesOf(reachable);
  const wageBound = Object.fromEntries(
    MARKET_ENTRIES.map((entry) => [entry, entries[entry].length === 0 && unbounded[entry].length > 0]),
  ) as Record<MarketEntry, boolean>;
  return {
    weakSpot,
    entries: { ...entries, needs: wageBound.needs ? affordableAt(eligible, weakSpot) : entries.needs },
    wageBound,
  };
}

// ------------------------------------------------------------------ the reference: getMarketProposals at 829e62a

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

type Modules = {
  db: typeof prismaClient;
  getMarketProposals: typeof GetMarketProposals;
  lineups: typeof LineupModule;
  market: typeof MarketModule;
  transfers: typeof TransfersModule;
};

let loaded: Modules | undefined;

const modules = (): Modules => {
  if (loaded === undefined) {
    throw new Error("Modules not loaded");
  }
  return loaded;
};

function toCandidate(row: CandidateRow, currentDate: Date): Candidate {
  const age = ageInYears(row.birthDate, currentDate);
  const quote = modules().transfers.quoteFor(row, row.clubSave, currentDate);
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

/** What the reference weighed: the managed club as a buyer, its eleven, and every player of the market. */
async function referenceInputs(saveId: string) {
  const { db, lineups, market, transfers } = modules();
  const [overview, { lineup }, clubPlayers, freeAgents] = await Promise.all([
    market.getMarketOverview(saveId),
    lineups.getManagedLineup(saveId),
    db.playerSave.findMany({ where: { saveId, clubSave: { saveId, isManaged: false } }, select: CANDIDATE_SELECT }),
    db.playerSave.findMany({ where: transfers.freeAgentWhere(saveId), select: CANDIDATE_SELECT }),
  ]);
  return {
    buyer: overview,
    eleven: lineup.starters.map(({ player, slot }): ElevenSlot => ({ slot, rating: ratingAt(player, slot) })),
    candidates: [...clubPlayers, ...freeAgents].map((row) => toCandidate(row, overview.currentDate)),
  };
}

async function referenceProposals(saveId: string): Promise<MarketProposals> {
  const { buyer, eleven, candidates } = await referenceInputs(saveId);
  const { weakSpot, entries, wageBound } = proposeSignings(eleven, candidates, buyer);
  const proposed = MARKET_ENTRIES.flatMap((entry) => entries[entry].map(({ candidate }) => candidate.id));
  const rows = await modules().db.playerSave.findMany({ where: { saveId, id: { in: [...new Set(proposed)] } }, select: VIEW_SELECT });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const views = (proposals: Proposal<Candidate>[]): MarketProposal[] =>
    proposals.map((proposal) => toMarketProposal(proposal, getOrThrow(byId, proposal.candidate.id, "proposed player")));
  return {
    weakSpot,
    entries: { needs: views(entries.needs), gems: views(entries.gems), bargains: views(entries.bargains), stars: views(entries.stars) },
    wageBound,
  };
}

// ------------------------------------------------------------------ the saves

type SaveCase = { key: string; slug: string; seed: string; worldVersion: WorldVersion };

const SAVES: readonly SaveCase[] = [
  { key: "top", slug: "fc-barcelona", seed: "equivalence-top", worldVersion: 2 }, // first of a first division
  { key: "bottom", slug: "ac-monza", seed: "equivalence-bottom", worldVersion: 2 }, // last of a first division
  { key: "second", slug: "cardiff-city-fc", seed: "equivalence-second", worldVersion: 2 }, // last of a second division
  { key: "world-1", slug: "olympique-de-marseille", seed: "equivalence-world-1", worldVersion: 1 },
];

type ManagedClub = { id: string; budget: number; wageBudget: number; reputation: number; payroll: number };

describe.skipIf(process.env.DATABASE_URL === undefined)("getMarketProposals against the implementation it replaced", () => {
  const saveIds = new Map<string, string>();

  const saveOf = (key: string): string => getOrThrow(saveIds, key, "save case");

  const expectSame = async (saveId: string): Promise<MarketProposals> => {
    const reference = await referenceProposals(saveId);
    expect(await modules().getMarketProposals(saveId)).toEqual(reference);
    return reference;
  };

  const managedClub = async (saveId: string): Promise<ManagedClub> => {
    const { db } = modules();
    const club = await db.clubSave.findFirstOrThrow({
      where: { saveId, isManaged: true },
      select: { id: true, budget: true, wageBudget: true, reputation: true },
    });
    const { _sum } = await db.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } });
    return { ...club, payroll: _sum.wage ?? 0 };
  };

  /** Runs `check` with the managed club changed, then gives it back what it had. */
  const withManagedClub = async (
    saveId: string,
    change: (club: ManagedClub) => Partial<Pick<ManagedClub, "budget" | "wageBudget" | "reputation">>,
    check: () => Promise<void>,
  ): Promise<void> => {
    const { db } = modules();
    const club = await managedClub(saveId);
    await db.clubSave.update({ where: { id: club.id, saveId }, data: change(club) });
    try {
      await check();
    } finally {
      const { budget, wageBudget, reputation } = club;
      await db.clubSave.update({ where: { id: club.id, saveId }, data: { budget, wageBudget, reputation } });
    }
  };

  /**
   * A wage room that pays nobody who would improve the weak spot, but someone else: just under the lowest wage asked by
   * those who would improve it, reachable on price and reputation.
   */
  const affordableRoom = async (saveId: string): Promise<number> => {
    const { buyer, eleven, candidates } = await referenceInputs(saveId);
    const weakSpot = weakSpotOf(eleven);
    if (weakSpot === null) {
      throw new Error("No weak spot");
    }
    const reachable = candidates.filter((candidate) => isReachable(candidate, buyer));
    const improving = reachable.filter((candidate) => roundedRatingAt(candidate, weakSpot.position) > weakSpot.rating);
    expect(improving.length).toBeGreaterThan(0);
    const room = Math.min(...improving.map((candidate) => candidate.askedWage)) - 1;
    expect(reachable.some((candidate) => candidate.askedWage <= room)).toBe(true);
    return room;
  };

  beforeAll(async () => {
    const [{ prisma }, { getMarketProposals }, lineups, market, transfers, { createSave }, { createTestOwner }] =
      await Promise.all([
        import("./client"),
        import("./market-proposals"),
        import("./lineup"),
        import("./market"),
        import("./transfers"),
        import("./saves"),
        import("./test-support"),
      ]);
    loaded = { db: prisma, getMarketProposals, lineups, market, transfers };
    await Promise.all(
      SAVES.map(async ({ key, slug, seed, worldVersion }) => {
        const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug }, select: { id: true } });
        const ownerId = await createTestOwner();
        const { id } = await createSave({ name: `Équivalence ${key}`, managerName: "Test", clubId, seed, ownerId, worldVersion });
        saveIds.set(key, id);
      }),
    );
  }, 300_000);

  afterAll(async () => {
    await loaded?.db.save.deleteMany({ where: { id: { in: [...saveIds.values()] } } });
    await loaded?.db.$disconnect();
  }, 120_000);

  it.each(SAVES.map(({ key }) => key))("proposes the same on the %s save at its creation", async (key) => {
    const { entries } = await expectSame(saveOf(key));

    for (const entry of MARKET_ENTRIES) {
      expect(entries[entry].length, entry).toBeGreaterThan(0);
    }
  }, 60_000);

  it.each(["top", "second"])(
    "proposes the same « affordable » players when the wage room pays nobody who would improve the weak spot (%s)",
    async (key) => {
      const saveId = saveOf(key);
      const room = await affordableRoom(saveId);
      await withManagedClub(saveId, ({ payroll }) => ({ wageBudget: payroll + room }), async () => {
        const { entries, wageBound } = await expectSame(saveId);

        expect(wageBound.needs).toBe(true);
        expect(entries.needs.length).toBeGreaterThan(0);
        expect(entries.needs.every(({ tag }) => tag === "affordable")).toBe(true);
      });
    },
    60_000,
  );

  it.each(["top", "bottom"])("proposes the same when the wage room pays nobody at all (%s)", async (key) => {
    const saveId = saveOf(key);
    await withManagedClub(saveId, ({ payroll }) => ({ wageBudget: payroll - 1 }), async () => {
      const { entries, wageBound } = await expectSame(saveId);

      for (const entry of MARKET_ENTRIES) {
        expect(entries[entry], entry).toEqual([]);
      }
      expect(Object.values(wageBound)).toContain(true);
    });
  }, 60_000);

  it.each([
    ["top", 0],
    ["bottom", 300_000],
    ["second", 50_000],
  ] as const)("proposes the same with a small budget (%s, %i €)", async (key, budget) => {
    const saveId = saveOf(key);
    await withManagedClub(saveId, () => ({ budget }), async () => {
      const { entries } = await expectSame(saveId);

      expect(entries.stars.length).toBeGreaterThan(0);
      expect(entries.stars.every(({ askingPrice }) => askingPrice <= budget)).toBe(true);
    });
  }, 60_000);

  it.each([
    ["bottom", 99],
    ["top", 25],
    ["world-1", 45],
  ] as const)("proposes the same with the reputation at an end (%s, %i)", async (key, reputation) => {
    const saveId = saveOf(key);
    await withManagedClub(saveId, () => ({ reputation }), async () => {
      await expectSame(saveId);
    });
  }, 60_000);

  it("proposes the same on the demo save, a season on: players progressed, retired, released", async () => {
    const { ensureDemoSave } = await import("./test-support");
    // Read only: the demo save is shared with other files.
    await expectSame(await ensureDemoSave());
  }, 900_000);

  it("proposes the same after a few matchdays", async () => {
    const { playNextMatchday } = await import("./matchday");
    const saveId = saveOf("bottom");
    for (let matchday = 0; matchday < 3; matchday++) {
      expect(await playNextMatchday(saveId)).not.toBeNull();
    }

    await expectSame(saveId);
    await withManagedClub(saveId, ({ payroll }) => ({ wageBudget: payroll + 150_000 }), async () => {
      await expectSame(saveId);
    });
  }, 180_000);
});
