import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";
import type * as TransfersModule from "./transfers";

const SEED = "transfers-test";
const MANAGED_SLUG = "liverpool-fc";
const SELLER_SLUG = "fc-barcelona";

// Runs against DATABASE_URL on two throwaway saves with the same seed, managing Liverpool on the day saves start
// (summer window). Skipped without DATABASE_URL. Modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("transfers of the managed club", () => {
  let db: typeof prismaClient | undefined;
  let transfers: typeof TransfersModule | undefined;
  const saveIds: string[] = [];

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  const api = (): typeof TransfersModule => {
    if (transfers === undefined) {
      throw new Error("Transfers module not loaded");
    }
    return transfers;
  };

  beforeAll(async () => {
    const [{ prisma }, { createSave }, transfersModule, { ensureDemoUser }] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./transfers"),
      import("./test-support"),
    ]);
    db = prisma;
    transfers = transfersModule;
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: MANAGED_SLUG }, select: { id: true } });
    const ownerId = await ensureDemoUser();
    for (const name of ["Test transferts A", "Test transferts B"]) {
      saveIds.push((await createSave({ name, managerName: "Test", clubId, seed: SEED, ownerId })).id);
    }
  }, 300_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: { in: saveIds } } });
    await db?.$disconnect();
  }, 120_000);

  const clubState = async (saveId: string, slug: string) => {
    const club = await database().clubSave.findFirstOrThrow({
      where: { saveId, club: { slug } },
      select: { id: true, budget: true, wageBudget: true },
    });
    const { _sum } = await database().playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } });
    return { ...club, payroll: _sum.wage ?? 0 };
  };

  /** The n-th best player (1-based) of a club, by overall then key. */
  const rankedPlayer = (saveId: string, slug: string, rank: number) =>
    database().playerSave.findFirstOrThrow({
      where: { saveId, clubSave: { club: { slug } } },
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      skip: rank - 1,
      select: { id: true, playerKey: true, wage: true, clubSaveId: true, contractUntil: true },
    });

  it("sells a player to the best AI bid, identically in two saves with the same seed", async () => {
    const outcomes = [];
    for (const saveId of saveIds) {
      const before = await clubState(saveId, MANAGED_SLUG);
      const player = await rankedPlayer(saveId, MANAGED_SLUG, 10);
      const outcome = await api().sellPlayer({ saveId, playerSaveId: player.id });
      if (!outcome.ok || outcome.clubSaveId === null) {
        throw new Error(`Sale refused: ${JSON.stringify(outcome)}`);
      }
      const after = await clubState(saveId, MANAGED_SLUG);
      const buyer = await database().clubSave.findUniqueOrThrow({
        where: { id: outcome.clubSaveId },
        select: { budget: true, club: { select: { slug: true } } },
      });
      const moved = await database().playerSave.findUniqueOrThrow({ where: { id: player.id }, select: { clubSaveId: true, wage: true } });
      const transfer = await database().transfer.findFirstOrThrow({ where: { saveId, playerSaveId: player.id, type: "TRANSFER" } });

      expect(outcome.fee).toBeGreaterThan(0);
      expect(after.budget - before.budget).toBe(outcome.fee);
      expect(after.payroll - before.payroll).toBe(-player.wage);
      expect(outcome.payrollChange).toBe(-player.wage);
      expect(moved.clubSaveId).toBe(outcome.clubSaveId);
      expect(transfer.fee).toBe(outcome.fee);
      outcomes.push({
        playerKey: player.playerKey,
        buyer: buyer.club.slug,
        fee: outcome.fee,
        wage: moved.wage,
        contractUntil: outcome.contractUntil,
      });
    }

    expect(outcomes[1]).toEqual(outcomes[0]);
  });

  it("buys a player when the club and the player accept, moving budgets and wages by the right amounts", async () => {
    const [saveId] = saveIds;
    const player = await rankedPlayer(saveId, SELLER_SLUG, 8);
    const quote = await api().quoteTransfer({ saveId, playerSaveId: player.id });
    const [managedBefore, sellerBefore] = await Promise.all([clubState(saveId, MANAGED_SLUG), clubState(saveId, SELLER_SLUG)]);

    const outcome = await api().makeTransferOffer({
      saveId,
      playerSaveId: player.id,
      fee: quote.askingPrice,
      wage: quote.minimumWage,
      years: 3,
    });
    const [managedAfter, sellerAfter] = await Promise.all([clubState(saveId, MANAGED_SLUG), clubState(saveId, SELLER_SLUG)]);
    const transfer = await database().transfer.findFirstOrThrow({ where: { saveId, playerSaveId: player.id, type: "TRANSFER" } });

    expect(outcome).toMatchObject({ ok: true, fee: quote.askingPrice, budgetChange: -quote.askingPrice, payrollChange: quote.minimumWage });
    expect(managedAfter.budget - managedBefore.budget).toBe(-quote.askingPrice);
    expect(sellerAfter.budget - sellerBefore.budget).toBe(quote.askingPrice);
    expect(managedAfter.payroll - managedBefore.payroll).toBe(quote.minimumWage);
    expect(sellerAfter.payroll - sellerBefore.payroll).toBe(-player.wage);
    expect(transfer.fee).toBe(quote.askingPrice);
    expect(outcome.ok && outcome.contractUntil?.toISOString()).toBe("2029-06-30T00:00:00.000Z");
  });

  it("refuses an offer above the budget and changes nothing", async () => {
    const [saveId] = saveIds;
    const player = await rankedPlayer(saveId, SELLER_SLUG, 9);
    const managedBefore = await clubState(saveId, MANAGED_SLUG);

    const outcome = await api().makeTransferOffer({
      saveId,
      playerSaveId: player.id,
      fee: managedBefore.budget + 1,
      wage: player.wage * 2,
      years: 2,
    });

    expect(outcome).toEqual({ ok: false, reason: "insufficient_budget", refusals: [] });
    expect(await clubState(saveId, MANAGED_SLUG)).toEqual(managedBefore);
    expect((await rankedPlayer(saveId, SELLER_SLUG, 9)).id).toBe(player.id);
  });

  it("is refused by the club below its price, and by the player without his raise", async () => {
    const [saveId] = saveIds;
    const player = await rankedPlayer(saveId, SELLER_SLUG, 10);
    const quote = await api().quoteTransfer({ saveId, playerSaveId: player.id });
    const managedBefore = await clubState(saveId, MANAGED_SLUG);

    const lowFee = await api().makeTransferOffer({
      saveId,
      playerSaveId: player.id,
      fee: quote.askingPrice - 10_000,
      wage: quote.minimumWage,
      years: 2,
    });
    const lowWage = await api().makeTransferOffer({
      saveId,
      playerSaveId: player.id,
      fee: quote.askingPrice,
      wage: quote.minimumWage - 1,
      years: 2,
    });

    expect(lowFee).toEqual({ ok: false, reason: "club_refused", refusals: ["fee_too_low"] });
    expect(lowWage).toEqual({ ok: false, reason: "player_refused", refusals: ["wage_too_low"] });
    expect(await clubState(saveId, MANAGED_SLUG)).toEqual(managedBefore);
  });

  it("releases a player with compensation, signs him back as a free agent, and renews another contract", async () => {
    const [saveId] = saveIds;
    const released = await rankedPlayer(saveId, MANAGED_SLUG, 15);
    const start = await clubState(saveId, MANAGED_SLUG);

    const release = await api().releasePlayer({ saveId, playerSaveId: released.id });
    if (!release.ok) {
      throw new Error(`Release refused: ${release.reason}`);
    }
    const afterRelease = await clubState(saveId, MANAGED_SLUG);
    expect(release.fee).toBeGreaterThan(0);
    expect(afterRelease.budget - start.budget).toBe(-release.fee);
    expect(afterRelease.payroll - start.payroll).toBe(-released.wage);

    const freeAgentQuote = await api().quoteTransfer({ saveId, playerSaveId: released.id });
    expect(freeAgentQuote.askingPrice).toBe(0);
    const signing = await api().signFreeAgent({
      saveId,
      playerSaveId: released.id,
      wage: freeAgentQuote.minimumWage,
      years: 1,
    });
    const afterSigning = await clubState(saveId, MANAGED_SLUG);
    expect(signing).toMatchObject({ ok: true, fee: 0, budgetChange: 0, payrollChange: freeAgentQuote.minimumWage });
    expect(afterSigning.budget).toBe(afterRelease.budget);
    expect(afterSigning.payroll - afterRelease.payroll).toBe(freeAgentQuote.minimumWage);

    const renewed = await rankedPlayer(saveId, MANAGED_SLUG, 3);
    const renewalQuote = await api().quoteTransfer({ saveId, playerSaveId: renewed.id });
    const refusedRenewal = await api().renewContract({
      saveId,
      playerSaveId: renewed.id,
      wage: renewalQuote.minimumWage - 1,
      years: 4,
    });
    const renewal = await api().renewContract({
      saveId,
      playerSaveId: renewed.id,
      wage: renewalQuote.minimumWage + 100_000,
      years: 4,
    });
    const afterRenewal = await clubState(saveId, MANAGED_SLUG);

    expect(refusedRenewal).toEqual({ ok: false, reason: "player_refused", refusals: ["wage_too_low"] });
    expect(renewal).toMatchObject({ ok: true, budgetChange: 0, payrollChange: renewalQuote.minimumWage + 100_000 - renewed.wage });
    expect(renewal.ok && renewal.contractUntil?.toISOString()).toBe("2030-06-30T00:00:00.000Z");
    expect(afterRenewal.payroll - afterSigning.payroll).toBe(renewalQuote.minimumWage + 100_000 - renewed.wage);
  });

  it("refuses every operation outside a transfer window", async () => {
    const [saveId] = saveIds;
    await database().save.update({ where: { id: saveId }, data: { currentDate: new Date(Date.UTC(WORLD_START_YEAR, 9, 1)) } });
    const own = await rankedPlayer(saveId, MANAGED_SLUG, 5);
    const target = await rankedPlayer(saveId, SELLER_SLUG, 12);
    const before = await clubState(saveId, MANAGED_SLUG);

    const outcomes = await Promise.all([
      api().makeTransferOffer({ saveId, playerSaveId: target.id, fee: 1, wage: 1, years: 1 }),
      api().signFreeAgent({ saveId, playerSaveId: target.id, wage: 1, years: 1 }),
      api().renewContract({ saveId, playerSaveId: own.id, wage: own.wage * 2, years: 2 }),
      api().releasePlayer({ saveId, playerSaveId: own.id }),
      api().sellPlayer({ saveId, playerSaveId: own.id }),
    ]);

    expect(outcomes.map((outcome) => (outcome.ok ? "ok" : outcome.reason))).toEqual(Array(5).fill("window_closed"));
    expect(await clubState(saveId, MANAGED_SLUG)).toEqual(before);
  });

  it("validates its input with the exported Zod schemas", async () => {
    await expect(
      api().makeTransferOffer({ saveId: saveIds[0], playerSaveId: "x", fee: -1, wage: 1, years: 1 }),
    ).rejects.toThrow();
    expect(api().renewContractSchema.safeParse({ saveId: "s", playerSaveId: "p", wage: 1, years: 6 }).success).toBe(false);
  });
});
