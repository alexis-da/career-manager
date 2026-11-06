import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MARKET_VALUE_STEP,
  RELEASE_COMPENSATION_SHARE,
  SALE_BID_SHARE_MAX,
  SALE_BID_SHARE_MIN,
  SALE_MAX_BIDDERS,
} from "../engine/balance";
import { displayClubName } from "../engine/club-name";
import { lerp } from "../engine/curves";
import { contractEndDate, contractYears, marketValueFor } from "../engine/economy";
import {
  evaluateRenewal,
  minimumReputation,
  minimumWage,
  saleRngSeed,
  type BidderClub,
  type OfferClub,
  type OfferPlayer,
  type SaleBid,
} from "../engine/transfer-ai";
import { seasonStartYear, transferWindowAt, transferWindowOpenDate, WORLD_START_YEAR } from "../engine/world";
import type { WorldVersion } from "../engine/world-version";
import { clubColorsOf } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { makeRng, type Rng } from "../lib/rng";
import type { prisma as prismaClient } from "./client";
import type { getManagedLineup as GetManagedLineup } from "./lineup";
import type { MarketSales, SaleRow } from "./market-sales";
import type { ContractTerms, SaleQuote } from "./transfers";

// ------------------------------------------------------------------------------------------------------------------
// The reference: the AI offers for the managed club's players as commit 829e62a computed them, every AI club and the
// payroll of every club of the save read at each call. Copied as it was, but for the database client, handed in.

const roundToStep = (value: number, step: number): number => Math.round(value / step) * step;

function referenceSaleBids(player: OfferPlayer, sellingClub: OfferClub, bidders: readonly BidderClub[], rng: Rng): SaleBid[] {
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

type ReferencePlayerRow = {
  playerKey: string;
  birthDate: Date;
  overall: number;
  potential: number;
  wage: number;
  contractUntil: Date | null;
};

type ReferenceSaleMarket = {
  bidders: BidderClub[];
  clubBySlug: Map<string, { id: string; clubId: string; club: { slug: string; name: string } }>;
};

function referenceOfferPlayer(player: Omit<ReferencePlayerRow, "playerKey">, date: Date): OfferPlayer {
  return {
    age: ageInYears(player.birthDate, date),
    overall: player.overall,
    potential: player.potential,
    wage: player.wage,
    seasonsLeft:
      player.contractUntil === null ? 0 : Math.max(0, player.contractUntil.getUTCFullYear() - seasonStartYear(date)),
  };
}

const referenceReleaseCompensation = (player: ReferencePlayerRow, date: Date): number =>
  Math.round(player.wage * referenceOfferPlayer(player, date).seasonsLeft * RELEASE_COMPENSATION_SHARE);

/** quoteSquad and getMarketSales at 829e62a. */
function referenceImplementation(db: typeof prismaClient, getManagedLineup: typeof GetManagedLineup) {
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

  async function managedContext(saveId: string) {
    const save = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { seed: true, currentDate: true } });
    const club = await db.clubSave.findFirstOrThrow({
      where: { saveId, isManaged: true },
      select: { id: true, clubId: true, budget: true, wageBudget: true, reputation: true },
    });
    const { _sum } = await db.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } });
    return { save, club, payroll: _sum.wage ?? 0, windowOpen: transferWindowAt(save.currentDate) !== null };
  }

  async function boughtThisWindow(saveId: string, clubId: string, date: Date): Promise<Set<string>> {
    const opensOn = transferWindowOpenDate(date);
    if (opensOn === null) {
      return new Set();
    }
    const arrivals = await db.transfer.findMany({
      where: { saveId, toClubId: clubId, type: { in: ["TRANSFER", "FREE"] }, date: { gte: opensOn } },
      select: { playerSaveId: true },
    });
    return new Set(arrivals.map((arrival) => arrival.playerSaveId));
  }

  async function loadSaleMarket(saveId: string): Promise<ReferenceSaleMarket> {
    const clubs = await db.clubSave.findMany({
      where: { saveId, isManaged: false },
      select: { id: true, clubId: true, budget: true, wageBudget: true, reputation: true, club: { select: { slug: true, name: true } } },
    });
    const payrolls = await db.playerSave.groupBy({
      by: ["clubSaveId"],
      where: { saveId, clubSaveId: { not: null } },
      _sum: { wage: true },
    });
    const payrollByClub = new Map(payrolls.map((row) => [row.clubSaveId, row._sum.wage ?? 0]));
    return {
      bidders: clubs.map((candidate) => ({
        slug: candidate.club.slug,
        reputation: candidate.reputation,
        budget: candidate.budget,
        wageRoom: candidate.wageBudget - (payrollByClub.get(candidate.id) ?? 0),
      })),
      clubBySlug: new Map(clubs.map((candidate) => [candidate.club.slug, candidate])),
    };
  }

  function bestSaleBid(
    save: { seed: string; currentDate: Date },
    managedReputation: number,
    player: ReferencePlayerRow,
    market: ReferenceSaleMarket,
  ): SaleBid | undefined {
    const [best] = referenceSaleBids(
      referenceOfferPlayer(player, save.currentDate),
      { reputation: managedReputation },
      market.bidders,
      makeRng(saleRngSeed(save.seed, save.currentDate, player.playerKey)),
    );
    return best;
  }

  async function quoteSquad(saveId: string): Promise<Map<string, ContractTerms>> {
    const { save, club, windowOpen } = await managedContext(saveId);
    const players = await db.playerSave.findMany({ where: { saveId, clubSaveId: club.id }, select: PLAYER_SELECT });
    const market = windowOpen ? await loadSaleMarket(saveId) : null;
    const bought = await boughtThisWindow(saveId, club.clubId, save.currentDate);

    return new Map(
      players.map((player) => {
        let sale: SaleQuote = { ok: false, reason: "window_closed" };
        if (market !== null && bought.has(player.id)) {
          sale = { ok: false, reason: "bought_this_window" };
        } else if (market !== null) {
          const best = bestSaleBid(save, club.reputation, player, market);
          sale =
            best === undefined
              ? { ok: false, reason: "no_offer" }
              : {
                  ok: true,
                  fee: best.fee,
                  wage: best.wage,
                  years: best.years,
                  buyerName: displayClubName(getOrThrow(market.clubBySlug, best.clubSlug, "bidding club").club),
                };
        }
        return [
          player.id,
          {
            renewalMinimumWage: evaluateRenewal(referenceOfferPlayer(player, save.currentDate), 0).minimumWage,
            releaseCost: referenceReleaseCompensation(player, save.currentDate),
            sale,
          },
        ];
      }),
    );
  }

  const offerFee = ({ terms: { sale } }: SaleRow): number => (sale.ok ? sale.fee : -1);
  const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

  async function getMarketSales(saveId: string): Promise<MarketSales> {
    const [{ lineup, missingStarters }, terms, save, club] = await Promise.all([
      getManagedLineup(saveId),
      quoteSquad(saveId),
      db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
      db.clubSave.findFirstOrThrow({
        where: { saveId, isManaged: true },
        select: { id: true, club: { select: { primaryColor: true, secondaryColor: true } } },
      }),
    ]);
    const eleven = [...lineup.starters.map(({ player }) => player), ...missingStarters].map((player) => player.id);
    const players = await db.playerSave.findMany({
      where: { saveId, clubSaveId: club.id, playerKey: { notIn: eleven } },
      select: {
        id: true,
        playerKey: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        position: true,
        overall: true,
        potential: true,
      },
    });

    const clubColors = clubColorsOf(club.club);
    const rows = players
      .map(({ birthDate, potential, ...player }): SaleRow => {
        const age = ageInYears(birthDate, save.currentDate);
        return {
          ...player,
          age,
          marketValue: marketValueFor({ age, overall: player.overall, potential }),
          clubColors,
          terms: getOrThrow(terms, player.id, "contract terms"),
        };
      })
      .sort((a, b) => offerFee(b) - offerFee(a) || b.overall - a.overall || byKey(a.playerKey, b.playerKey));

    return { rows, offers: rows.filter((row) => row.terms.sale.ok).length };
  }

  return { quoteSquad, getMarketSales };
}

// ------------------------------------------------------------------------------------------------------------------

/** The saves compared, each with a seed of its own: three clubs of a worldVersion 2 world, and one of worldVersion 1. */
const SAVES = {
  top: { slug: "paris-saint-germain-fc", seed: "sale-quotes-top", worldVersion: 2 }, // first division, reputed 90
  bottom: { slug: "cosenza-calcio", seed: "sale-quotes-bottom", worldVersion: 2 }, // second division, reputed 40
  middle: { slug: "torino-fc", seed: "sale-quotes-middle", worldVersion: 2 }, // first division, reputed 72
  oneDivision: { slug: "borussia-dortmund", seed: "sale-quotes-one-division", worldVersion: 1 },
} as const satisfies Record<string, { slug: string; seed: string; worldVersion: WorldVersion }>;

type SaveName = keyof typeof SAVES;

// Against DATABASE_URL, on four throwaway saves: the AI offers for the managed club's players (quoteSquad, the Sell tab
// of getMarketSales, the sale itself) are those of commit 829e62a, though the AI clubs are now read as far as the bids
// go. The tests run in order, and each moves its own save on. Skipped without DATABASE_URL; modules are imported lazily
// because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("AI offers for the managed club's players", () => {
  let modules:
    | {
        db: typeof prismaClient;
        transfers: typeof import("./transfers");
        sales: typeof import("./market-sales");
        matchday: typeof import("./matchday");
        reference: ReturnType<typeof referenceImplementation>;
      }
    | undefined;
  const saveIds = new Map<SaveName, string>();

  const loaded = () => {
    if (modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return modules;
  };

  const saveIdOf = (name: SaveName): string => getOrThrow(saveIds, name, "test save");

  beforeAll(async () => {
    const [{ prisma }, transfers, sales, matchday, { getManagedLineup }, { createSave }, { createTestOwner }] = await Promise.all([
      import("./client"),
      import("./transfers"),
      import("./market-sales"),
      import("./matchday"),
      import("./lineup"),
      import("./saves"),
      import("./test-support"),
    ]);
    modules = { db: prisma, transfers, sales, matchday, reference: referenceImplementation(prisma, getManagedLineup) };
    for (const [name, { slug, seed, worldVersion }] of Object.entries(SAVES) as [SaveName, (typeof SAVES)[SaveName]][]) {
      const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug }, select: { id: true } });
      const ownerId = await createTestOwner();
      saveIds.set(name, (await createSave({ name: `Test offres ${name}`, managerName: "Test", clubId, seed, ownerId, worldVersion })).id);
    }
  }, 600_000);

  afterAll(async () => {
    await modules?.db.save.deleteMany({ where: { id: { in: [...saveIds.values()] } } });
    await modules?.db.$disconnect();
  }, 120_000);

  /** The quotes and the Sell tab of a save today are those of the reference; its quotes, for the test to go on with. */
  const expectAsBefore = async (saveId: string): Promise<Map<string, ContractTerms>> => {
    const { transfers, sales, reference } = loaded();
    const quotes = await reference.quoteSquad(saveId);
    expect(await transfers.quoteSquad(saveId)).toEqual(quotes);
    expect(await sales.getMarketSales(saveId)).toEqual(await reference.getMarketSales(saveId));
    return quotes;
  };

  const offers = (quotes: Map<string, ContractTerms>): number => [...quotes.values()].filter(({ sale }) => sale.ok).length;

  const setDate = (saveId: string, date: Date) => loaded().db.save.update({ where: { id: saveId }, data: { currentDate: date } });

  /** Sells the player with the best offer of the quotes: sold at that offer, to that club, for that many seasons. */
  const expectSoldAsQuoted = async (saveId: string, quotes: Map<string, ContractTerms>): Promise<void> => {
    const { db, transfers } = loaded();
    const [playerSaveId, sale] = [...quotes]
      .flatMap(([id, { sale: quote }]) => (quote.ok ? [[id, quote] as const] : []))
      .sort(([, a], [, b]) => b.fee - a.fee)[0];
    const { currentDate } = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });

    const outcome = await transfers.sellPlayer({ saveId, playerSaveId });
    if (!outcome.ok || outcome.clubSaveId === null) {
      throw new Error(`Sale refused: ${JSON.stringify(outcome)}`);
    }
    const buyer = await db.clubSave.findUniqueOrThrow({
      where: { id: outcome.clubSaveId },
      select: { club: { select: { slug: true, name: true } } },
    });
    const moved = await db.playerSave.findUniqueOrThrow({ where: { id: playerSaveId }, select: { wage: true } });

    expect(outcome).toMatchObject({ fee: sale.fee, budgetChange: sale.fee, contractUntil: contractEndDate(currentDate, sale.years) });
    expect(displayClubName(buyer.club)).toBe(sale.buyerName);
    expect(moved.wage).toBe(sale.wage);
  };

  it("are the same on the day each save starts, in the summer window", async () => {
    for (const name of Object.keys(SAVES) as SaveName[]) {
      expect(offers(await expectAsBefore(saveIdOf(name)))).toBeGreaterThan(0);
    }
  }, 120_000);

  it("are the same in the winter window", async () => {
    for (const name of ["top", "bottom"] as const) {
      const saveId = saveIdOf(name);
      await setDate(saveId, new Date(Date.UTC(WORLD_START_YEAR + 1, 0, 12)));
      expect(offers(await expectAsBefore(saveId))).toBeGreaterThan(0);
    }
  }, 120_000);

  it("are the same when the most reputed clubs cannot pay, down to the reputation the players ask", async () => {
    const { db } = loaded();
    const saveId = saveIdOf("top");
    // Every walk goes past the clubs reputed 84 or more, which still draw a fee, then each reputation down to 80.
    await db.clubSave.updateMany({ where: { saveId, isManaged: false, reputation: { gte: 84 } }, data: { budget: 0 } });
    const quotes = await expectAsBefore(saveId);
    expect(offers(quotes)).toBeGreaterThan(0);
    await expectSoldAsQuoted(saveId, quotes);
    await expectAsBefore(saveId);

    // A player of a club reputed 90 joins no club under 80: none is left to bid.
    await db.clubSave.updateMany({ where: { saveId, isManaged: false, reputation: { gte: 80 } }, data: { budget: 0 } });
    const none = await expectAsBefore(saveId);
    expect([...none.values()].map(({ sale }) => sale)).toEqual([...none.values()].map(() => ({ ok: false, reason: "no_offer" })));
  }, 120_000);

  it("are the same when the most reputed clubs have no wage room", async () => {
    const { db } = loaded();
    const saveId = saveIdOf("bottom");
    // They are passed over without a draw: the walks go down to the clubs reputed under 70.
    await db.clubSave.updateMany({ where: { saveId, isManaged: false, reputation: { gte: 70 } }, data: { wageBudget: 0 } });
    const quotes = await expectAsBefore(saveId);
    expect(offers(quotes)).toBeGreaterThan(0);
    await expectSoldAsQuoted(saveId, quotes);
  }, 120_000);

  it("are the same after matchdays", async () => {
    const { db, matchday } = loaded();
    const saveId = saveIdOf("middle");
    await matchday.playNextMatchday(saveId);
    await matchday.playNextMatchday(saveId);
    const { currentDate } = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });

    expect(transferWindowAt(currentDate)).toBe("summer");
    expect(offers(await expectAsBefore(saveId))).toBeGreaterThan(0);
  }, 240_000);

  it("are the same after a purchase and a free signing, not for sale in their window, then after a sale", async () => {
    const { db, transfers } = loaded();
    const saveId = saveIdOf("oneDivision");
    const target = await db.playerSave.findFirstOrThrow({
      where: { saveId, clubSave: { saveId, club: { slug: "vfl-bochum-1848" } } },
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      select: { id: true },
    });
    const price = await transfers.quoteTransfer({ saveId, playerSaveId: target.id });
    const purchase = await transfers.makeTransferOffer({
      saveId,
      playerSaveId: target.id,
      fee: price.askingPrice,
      wage: price.minimumWage,
      years: 3,
    });
    const freeAgent = await db.playerSave.findFirstOrThrow({
      where: transfers.freeAgentWhere(saveId),
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      select: { id: true },
    });
    const freeAgentTerms = await transfers.quoteTransfer({ saveId, playerSaveId: freeAgent.id });
    const signing = await transfers.signFreeAgent({ saveId, playerSaveId: freeAgent.id, wage: freeAgentTerms.minimumWage, years: 2 });
    expect([purchase.ok, signing.ok]).toEqual([true, true]);

    const quotes = await expectAsBefore(saveId);
    for (const id of [target.id, freeAgent.id]) {
      expect(quotes.get(id)?.sale).toEqual({ ok: false, reason: "bought_this_window" });
    }
    await expectSoldAsQuoted(saveId, quotes);
    expect(offers(await expectAsBefore(saveId))).toBeGreaterThan(0);
  }, 120_000);
});
