import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { marketValueFor } from "../engine/economy";
import { ageInYears } from "../lib/dates";
import type { prisma as prismaClient } from "./client";
import type { ManagedLineup } from "./lineup";
import type { MarketSales, SaleRow } from "./market-sales";
import type { ContractTerms, SaleQuote } from "./transfers";

// Other quotes for the test under way: on the first day of a window, the demo save's players all have an offer.
const handed = vi.hoisted(() => ({ quotes: null as Map<string, ContractTerms> | null }));

vi.mock("./transfers", async (importOriginal) => {
  const original = await importOriginal<typeof import("./transfers")>();
  return { ...original, quoteSquad: async (saveId: string) => handed.quotes ?? original.quoteSquad(saveId) };
});

const NO_OFFER: SaleQuote = { ok: false, reason: "no_offer" };

// Read only, against DATABASE_URL: the demo save, on 1 July of its second season. Skipped without it. The demo save is
// created on the first run when missing (a whole season to play, hence the long hook timeout) and kept for later runs.
// Modules are imported lazily because the client throws without DATABASE_URL.
describe.skipIf(process.env.DATABASE_URL === undefined)("getMarketSales on the demo save", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let keptOffSales: ManagedLineup["keptOffSales"] = [];
  let quotes = new Map<string, ContractTerms>();
  let sales: MarketSales = { rows: [], offers: 0 };

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  /** What getMarketSales gives with other sale quotes; the database is read as usual, and nothing is written. */
  const salesWith = async (sale: (quote: SaleQuote, index: number) => SaleQuote): Promise<MarketSales> => {
    const { getMarketSales } = await import("./market-sales");
    handed.quotes = new Map([...quotes].map(([id, terms], index) => [id, { ...terms, sale: sale(terms.sale, index) }]));
    try {
      return await getMarketSales(saveId);
    } finally {
      handed.quotes = null;
    }
  };

  const hasOffer = (row: SaleRow): boolean => row.terms.sale.ok;

  const expectBestRatedFirst = (rows: SaleRow[]): void => {
    expect(rows.length).toBeGreaterThan(1);
    for (const [index, row] of rows.slice(1).entries()) {
      const previous = rows[index];
      expect(previous.overall).toBeGreaterThanOrEqual(row.overall);
      if (previous.overall === row.overall) {
        expect(previous.playerKey < row.playerKey).toBe(true);
      }
    }
  };

  beforeAll(async () => {
    // First, and alone: a module imported while the mock above loads the original would get the original.
    const { quoteSquad } = await import("./transfers");
    const [{ prisma }, { getManagedLineup }, { getMarketSales }, { ensureDemoSave }] = await Promise.all([
      import("./client"),
      import("./lineup"),
      import("./market-sales"),
      import("./test-support"),
    ]);
    db = prisma;
    saveId = await ensureDemoSave();
    ({ keptOffSales } = await getManagedLineup(saveId));
    quotes = await quoteSquad(saveId);
    sales = await getMarketSales(saveId);
  }, 900_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("lists the whole squad but the eleven", async () => {
    const squad = await database().playerSave.findMany({
      where: { saveId, clubSave: { saveId, isManaged: true } },
      select: { playerKey: true },
    });
    const starters = keptOffSales;
    const listed = sales.rows.map((row) => row.playerKey);

    expect(starters).toHaveLength(11);
    expect(listed.filter((key) => starters.includes(key))).toEqual([]);
    expect([...listed, ...starters].sort()).toEqual(squad.map((player) => player.playerKey).sort());
  });

  it("keeps off the sales the eleven its assistant would field with the whole squad, a starter out of the next match in it", async () => {
    const [{ getLineupEditor, getManagedLineup }, { formationPositions }, { selectLineup }] = await Promise.all([
      import("./lineup"),
      import("../engine/formations"),
      import("../engine/lineup"),
    ]);
    const [editor, managed] = await Promise.all([getLineupEditor(saveId), getManagedLineup(saveId)]);
    const everyone = editor.players.map((player) => ({ ...player, injured: false, suspended: false }));
    const eleven = selectLineup(everyone, formationPositions(editor.formation)).starters.map(({ player }) => player.id);
    const fielded = managed.lineup.starters.map(({ player }) => player.id);
    const byKey = new Map(editor.players.map((player) => [player.id, player]));

    // The demo save's assistant makes its line-up: nobody ever saved one.
    expect(managed.byAssistant).toBe(true);
    expect(managed.keptOffSales).toEqual(eleven);
    expect(sales.rows.map((row) => row.playerKey).filter((key) => eleven.includes(key))).toEqual([]);
    expect(sales.rows).toHaveLength(editor.players.length - eleven.length);
    // Of his eleven, those out of the next match are injured or suspended, or the one the Jeunesse objective's young
    // player starts in place of: never offered, where their stand-ins may be.
    const out = eleven.filter((key) => !fielded.includes(key));
    const starter = editor.youth?.starter ?? null;
    const youthIn = starter !== null && fielded.includes(starter.id) && !eleven.includes(starter.id);
    const fit = out.filter((key) => byKey.get(key)?.injured !== true && byKey.get(key)?.suspended !== true);
    expect(fit).toHaveLength(youthIn ? 1 : 0);
  });

  it("puts the highest offer first", () => {
    const fees = sales.rows.map(({ terms: { sale } }) => (sale.ok ? sale.fee : 0));

    expect(sales.rows.every(hasOffer)).toBe(true);
    expect(fees).toEqual([...fees].sort((a, b) => b - a));
  });

  it("puts the players without an offer after the offers, best rated first, the player key last", async () => {
    const { rows } = await salesWith((quote, index) => (index % 2 === 0 ? quote : NO_OFFER));
    const offers = rows.filter(hasOffer);
    const others = rows.filter((row) => !hasOffer(row));

    expect(offers.length).toBeGreaterThan(0);
    expect(rows).toEqual([...offers, ...others]);
    expectBestRatedFirst(others);
  });

  it("falls back on the rating, then the player key, between offers of the same amount", async () => {
    const { rows } = await salesWith((quote) => (quote.ok ? { ...quote, fee: 1_000_000 } : quote));

    expectBestRatedFirst(rows);
  });

  it("counts the rows with an offer", async () => {
    const refused = await salesWith((quote, index) => (index % 2 === 0 ? quote : NO_OFFER));
    const closed = await salesWith(() => ({ ok: false, reason: "window_closed" }));

    expect(sales.offers).toBe(sales.rows.length);
    expect(sales.offers).toBeGreaterThan(0);
    expect(refused.offers).toBe(refused.rows.filter(hasOffer).length);
    expect(refused.offers).toBeLessThan(refused.rows.length);
    expect(closed.offers).toBe(0);
    expect(closed.rows).toHaveLength(sales.rows.length);
  });

  it("gives each row his PlayerSave.id, his value of today and the terms of quoteSquad", async () => {
    const { currentDate } = await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
    const players = await database().playerSave.findMany({
      where: { saveId, id: { in: sales.rows.map((row) => row.id) } },
      select: { id: true, playerKey: true, birthDate: true, potential: true },
    });
    const byId = new Map(players.map((player) => [player.id, player]));

    expect(players).toHaveLength(sales.rows.length);
    for (const row of sales.rows) {
      const player = byId.get(row.id);
      const age = player === undefined ? -1 : ageInYears(player.birthDate, currentDate);

      expect(player?.playerKey).toBe(row.playerKey);
      expect(row.age).toBe(age);
      expect(row.marketValue).toBe(marketValueFor({ age, overall: row.overall, potential: player?.potential ?? 0 }));
      expect(row.terms).toEqual(quotes.get(row.id));
    }
  });
});
