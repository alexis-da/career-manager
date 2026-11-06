import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { displayClubName } from "../engine/club-name";
import { marketValueFor } from "../engine/economy";
import {
  elevenOf,
  isReachable,
  MARKET_ENTRIES,
  proposeSignings,
  weakSpotOf,
  type MarketCandidate,
  type Proposal,
} from "../engine/market-proposals";
import { positionGroup, ratingAt, secondaryPositions, type Position } from "../engine/positions";
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
// proposes. Proof that it proposes exactly what reading every player of the save gives: the implementation it replaced,
// as it stood at commit 829e62a, copied here (its database part: every player of the AI clubs and every free agent,
// quoted one by one), gives them all to proposeSignings, against the new one on several saves, clubs, seeds and worlds,
// at creation and after matchdays, with the wage room and the budget of the managed club cut, its reputation at both
// ends, a slot left empty and a slot held out of line. Runs against DATABASE_URL, on throwaway saves; skipped without it.
// Modules are imported lazily because the client throws without DATABASE_URL.

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
  const [overview, { formation, lineup }, clubPlayers, freeAgents] = await Promise.all([
    market.getMarketOverview(saveId),
    lineups.getManagedLineup(saveId),
    db.playerSave.findMany({ where: { saveId, clubSave: { saveId, isManaged: false } }, select: CANDIDATE_SELECT }),
    db.playerSave.findMany({ where: transfers.freeAgentWhere(saveId), select: CANDIDATE_SELECT }),
  ]);
  return {
    buyer: overview,
    eleven: elevenOf(formation, lineup.starters),
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

  type SquadPlayer = { id: string; playerKey: string; position: Position; injuredUntil: Date | null };

  /** Runs `check` with some players of the managed club injured until long after the save's date, then heals them. */
  const withInjured = async (
    saveId: string,
    injured: (squad: SquadPlayer[]) => SquadPlayer[],
    check: () => Promise<void>,
  ): Promise<void> => {
    const { db } = modules();
    const club = await managedClub(saveId);
    const squad = await db.playerSave.findMany({
      where: { saveId, clubSaveId: club.id },
      orderBy: { playerKey: "asc" },
      select: { id: true, playerKey: true, position: true, injuredUntil: true },
    });
    const hurt = injured(squad);
    // Not simulation code: a date long after any save's.
    const healedOn = new Date(Date.UTC(2099, 0, 1));
    await db.playerSave.updateMany({ where: { saveId, id: { in: hurt.map(({ id }) => id) } }, data: { injuredUntil: healedOn } });
    try {
      await check();
    } finally {
      for (const { id, injuredUntil } of hurt) {
        await db.playerSave.update({ where: { id, saveId }, data: { injuredUntil } });
      }
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
    const improving = reachable.filter(
      ({ playerKey, position, overall }) => Math.round(ratingAt({ id: playerKey, position, overall }, weakSpot.position)) > weakSpot.rating,
    );
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

  it("proposes the same when injuries leave slots empty: the weak spot is the first of them", async () => {
    const saveId = saveOf("second");
    // Nine players left: two slots of the eleven nobody can fill.
    await withInjured(saveId, (squad) => squad.slice(9), async () => {
      const { weakSpot, entries } = await expectSame(saveId);

      expect(weakSpot).toMatchObject({ rating: 0, reason: "empty" });
      expect(entries.needs.length).toBeGreaterThan(0);
    });
  }, 60_000);

  it("proposes the same when the forwards are out: their slots are held out of line", async () => {
    const saveId = saveOf("top");
    const forward = (position: Position): boolean => positionGroup(position) === "FW";
    // The forwards, and whoever could play up front at a secondary position.
    const up = (player: SquadPlayer): boolean =>
      forward(player.position) || secondaryPositions(player.playerKey, player.position).some(forward);
    await withInjured(saveId, (squad) => squad.filter(up), async () => {
      const { weakSpot } = await expectSame(saveId);

      expect(weakSpot?.reason).toBe("outOfLine");
      expect(forward(weakSpot?.position ?? "GK")).toBe(true);
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
