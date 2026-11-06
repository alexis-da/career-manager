import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ASKING_PRICE_BY_SEASONS_LEFT,
  MARKET_VALUE_STEP,
  RESALE_CAP_FEE_PERCENT,
  RESALE_CAP_VALUE_PERCENT,
  SALE_BID_SHARE_MIN,
} from "../engine/balance";
import { marketValueFor } from "../engine/economy";
import { seasonEndDate, WORLD_START_YEAR } from "../engine/world";
import { ageInYears } from "../lib/dates";
import type { prisma as prismaClient } from "./client";
import type * as TransfersModule from "./transfers";

const MANAGED_SLUG = "liverpool-fc";

/** Dates of the test: the day the save starts, a day of the next window, and the day the next season's window opens. */
const SUMMER = new Date(Date.UTC(WORLD_START_YEAR, 6, 1));
const WINTER = new Date(Date.UTC(WORLD_START_YEAR + 1, 0, 12));
const NEXT_SUMMER = new Date(Date.UTC(WORLD_START_YEAR + 1, 6, 1));

// The resale cap against DATABASE_URL, on a throwaway save managing Liverpool: a player with one season left on his
// contract, sold cheap by his club (ASKING_PRICE_BY_SEASONS_LEFT), bought in the summer window, used to fetch 80 to 120 %
// of his value from the AI clubs in January. The tests run in order on the save. Skipped without DATABASE_URL; modules
// are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("offers for a player who joined less than a year ago", () => {
  let db: typeof prismaClient | undefined;
  let transfers: typeof TransfersModule | undefined;
  let saveId = "";
  const recruits = { bought: "", price: 0, signed: "" };

  const loaded = () => {
    if (db === undefined || transfers === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, transfers };
  };

  beforeAll(async () => {
    const [{ prisma }, transfersModule, { createSave }, { createTestOwner }] = await Promise.all([
      import("./client"),
      import("./transfers"),
      import("./saves"),
      import("./test-support"),
    ]);
    db = prisma;
    transfers = transfersModule;
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: MANAGED_SLUG }, select: { id: true } });
    ({ id: saveId } = await createSave({
      name: "Test plafond de revente",
      managerName: "Test",
      clubId,
      seed: "resale-cap",
      ownerId: await createTestOwner(),
      worldVersion: 1, // no second division needed here: half the rows
    }));
  }, 300_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: saveId } });
    await db?.$disconnect();
  }, 120_000);

  const setDate = (date: Date) => loaded().db.save.update({ where: { id: saveId }, data: { currentDate: date } });

  const saleOf = async (playerSaveId: string) => (await loaded().transfers.quoteSquad(saveId)).get(playerSaveId)?.sale;

  /** A player's market value on a date, as the AI clubs bid on it. */
  const valueOf = async (playerSaveId: string, date: Date): Promise<number> => {
    const player = await loaded().db.playerSave.findUniqueOrThrow({
      where: { id: playerSaveId },
      select: { birthDate: true, overall: true, potential: true },
    });
    return marketValueFor({ age: ageInYears(player.birthDate, date), overall: player.overall, potential: player.potential });
  };

  it("keeps a player bought with a season left and a free agent from a sale in the window they joined", async () => {
    const { db, transfers } = loaded();
    // The best player of an AI club in his last season, at his club's price for it: 60 % of his value.
    const target = await db.playerSave.findFirstOrThrow({
      where: { saveId, contractUntil: seasonEndDate(WORLD_START_YEAR), clubSave: { saveId, isManaged: false }, overall: { lte: 78 } },
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      select: { id: true },
    });
    const quote = await transfers.quoteTransfer({ saveId, playerSaveId: target.id });
    const purchase = await transfers.makeTransferOffer({
      saveId,
      playerSaveId: target.id,
      fee: quote.askingPrice,
      wage: quote.minimumWage,
      years: 3,
    });
    const freeAgent = await db.playerSave.findFirstOrThrow({
      where: transfers.freeAgentWhere(saveId),
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      select: { id: true },
    });
    const freeTerms = await transfers.quoteTransfer({ saveId, playerSaveId: freeAgent.id });
    const signing = await transfers.signFreeAgent({ saveId, playerSaveId: freeAgent.id, wage: freeTerms.minimumWage, years: 2 });
    Object.assign(recruits, { bought: target.id, price: quote.askingPrice, signed: freeAgent.id });

    expect([purchase.ok, signing.ok]).toEqual([true, true]);
    expect(quote.askingPrice).toBe(
      Math.round((ASKING_PRICE_BY_SEASONS_LEFT[0][1] * (await valueOf(target.id, SUMMER))) / MARKET_VALUE_STEP) * MARKET_VALUE_STEP,
    );
    expect(await saleOf(recruits.bought)).toEqual({ ok: false, reason: "bought_this_window" });
    expect(await saleOf(recruits.signed)).toEqual({ ok: false, reason: "bought_this_window" });
  }, 60_000);

  it("offers at most 110 % of the price paid in the next window, where the sale pays that", async () => {
    const { db, transfers } = loaded();
    await setDate(WINTER);
    const cap = Math.floor((recruits.price * RESALE_CAP_FEE_PERCENT) / 100);
    // Without the cap, the lowest share of his value a club bids is still above it: every club offers the cap.
    expect(SALE_BID_SHARE_MIN * (await valueOf(recruits.bought, WINTER)) - MARKET_VALUE_STEP / 2).toBeGreaterThan(cap);

    const sale = await saleOf(recruits.bought);
    expect(sale).toMatchObject({ ok: true, fee: cap, resaleCap: "purchase" });

    const { budget: before } = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { budget: true } });
    const outcome = await transfers.sellPlayer({ saveId, playerSaveId: recruits.bought });
    const { budget: after } = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { budget: true } });

    expect(outcome).toMatchObject({ ok: true, fee: cap, budgetChange: cap });
    expect(after - before).toBe(cap);
  }, 60_000);

  it("offers at most half his value for a free agent signed less than a year ago", async () => {
    const half = Math.floor(((await valueOf(recruits.signed, WINTER)) * RESALE_CAP_VALUE_PERCENT) / 100);

    expect(await saleOf(recruits.signed)).toMatchObject({ ok: true, fee: half, resaleCap: "free" });
  }, 60_000);

  it("lifts the cap on the same day a year after the arrival", async () => {
    await setDate(NEXT_SUMMER);
    const sale = await saleOf(recruits.signed);
    const half = Math.floor(((await valueOf(recruits.signed, NEXT_SUMMER)) * RESALE_CAP_VALUE_PERCENT) / 100);

    expect(sale?.ok).toBe(true);
    expect(sale).not.toHaveProperty("resaleCap");
    expect(sale?.ok === true && sale.fee).toBeGreaterThan(half);
  }, 60_000);
});
