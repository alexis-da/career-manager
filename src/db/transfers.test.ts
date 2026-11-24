import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQUAD_LIMIT } from "../engine/balance";
import { displayClubName } from "../engine/club-name";
import { marketValueFor, signingBonus } from "../engine/economy";
import { WORLD_START_YEAR } from "../engine/world";
import { ageInYears } from "../lib/dates";
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
    const [{ prisma }, { createSave }, transfersModule, { createTestOwner }] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./transfers"),
      import("./test-support"),
    ]);
    db = prisma;
    transfers = transfersModule;
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: MANAGED_SLUG }, select: { id: true } });
    for (const name of ["Test transferts A", "Test transferts B"]) {
      saveIds.push((await createSave({ name, managerName: "Test", clubId, seed: SEED, ownerId: await createTestOwner(), worldVersion: 1 })).id);
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

  /** Buys the n-th best player of the selling club at his price and his minimum wage; returns his id. */
  const buyPlayer = async (saveId: string, rank: number): Promise<string> => {
    const { id: playerSaveId } = await rankedPlayer(saveId, SELLER_SLUG, rank);
    const quote = await api().quoteTransfer({ saveId, playerSaveId });
    const outcome = await api().makeTransferOffer({ saveId, playerSaveId, fee: quote.askingPrice, wage: quote.minimumWage, years: 3 });
    if (!outcome.ok) {
      throw new Error(`Purchase refused: ${outcome.reason}`);
    }
    return playerSaveId;
  };

  /** Signs the best free agent at his minimum wage; returns his id. */
  const signBestFreeAgent = async (saveId: string): Promise<string> => {
    const { id: playerSaveId } = await database().playerSave.findFirstOrThrow({
      where: api().freeAgentWhere(saveId),
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      select: { id: true },
    });
    const quote = await api().quoteTransfer({ saveId, playerSaveId });
    const outcome = await api().signFreeAgent({ saveId, playerSaveId, wage: quote.minimumWage, years: 2 });
    if (!outcome.ok) {
      throw new Error(`Signing refused: ${outcome.reason}`);
    }
    return playerSaveId;
  };

  const saleQuote = async (saveId: string, playerSaveId: string) => (await api().quoteSquad(saveId)).get(playerSaveId)?.sale;

  const setDate = (saveId: string, date: Date) => database().save.update({ where: { id: saveId }, data: { currentDate: date } });

  /** A club's players under contract, as SQUAD_LIMIT counts them. */
  const squadSizeOf = (saveId: string, clubSaveId: string) =>
    database().playerSave.count({ where: { saveId, clubSaveId, retired: false } });

  /**
   * Runs `check` with a club filled to SQUAD_LIMIT players by free agents moved in as they are (no contract, no wage),
   * then sends them back to the market: the best rated first, never `keep`.
   */
  const withFullSquad = async (saveId: string, clubSaveId: string, check: () => Promise<void>, keep: readonly string[] = []) => {
    const missing = SQUAD_LIMIT - (await squadSizeOf(saveId, clubSaveId));
    const fillers = await database().playerSave.findMany({
      where: { ...api().freeAgentWhere(saveId), id: { notIn: [...keep] } },
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      take: Math.max(0, missing),
      select: { id: true },
    });
    const ids = fillers.map(({ id }) => id);
    expect(ids).toHaveLength(Math.max(0, missing));
    await database().playerSave.updateMany({ where: { saveId, id: { in: ids } }, data: { clubSaveId } });
    try {
      expect(await squadSizeOf(saveId, clubSaveId)).toBeGreaterThanOrEqual(SQUAD_LIMIT);
      await check();
    } finally {
      await database().playerSave.updateMany({ where: { saveId, id: { in: ids }, clubSaveId }, data: { clubSaveId: null } });
    }
  };

  /** What signing a free agent costs today: his signing bonus, a quarter of his market value. */
  const bonusOf = async (saveId: string, playerSaveId: string): Promise<number> => {
    const [{ currentDate }, player] = await Promise.all([
      database().save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
      database().playerSave.findUniqueOrThrow({ where: { id: playerSaveId }, select: { birthDate: true, overall: true, potential: true } }),
    ]);
    return signingBonus(marketValueFor({ age: ageInYears(player.birthDate, currentDate), overall: player.overall, potential: player.potential }));
  };

  /** The sale of a player who arrived in this window is refused and changes nothing, and the squad quotes say the same. */
  const expectBoughtThisWindow = async (saveId: string, playerSaveId: string) => {
    const before = await clubState(saveId, MANAGED_SLUG);
    const squadSize = () => database().playerSave.count({ where: { saveId, clubSaveId: before.id } });
    const transferCount = () => database().transfer.count({ where: { saveId } });
    const squadBefore = await squadSize();
    const transfersBefore = await transferCount();

    const outcome = await api().sellPlayer({ saveId, playerSaveId });

    expect(outcome).toEqual({ ok: false, reason: "bought_this_window", refusals: [] });
    expect(await clubState(saveId, MANAGED_SLUG)).toEqual(before);
    expect(await squadSize()).toBe(squadBefore);
    expect(await transferCount()).toBe(transfersBefore);
    expect(await saleQuote(saveId, playerSaveId)).toEqual({ ok: false, reason: "bought_this_window" });
  };

  /** The squad quotes offer a sale, and it goes through at the fee they announced. */
  const expectSold = async (saveId: string, playerSaveId: string) => {
    const quote = await saleQuote(saveId, playerSaveId);
    if (quote === undefined || !quote.ok) {
      throw new Error(`No sale on offer: ${JSON.stringify(quote)}`);
    }
    expect(await api().sellPlayer({ saveId, playerSaveId })).toMatchObject({ ok: true, fee: quote.fee, budgetChange: quote.fee });
  };

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

  it("refuses a sale while a match waits live, and changes nothing", async () => {
    const [saveId] = saveIds;
    const player = await rankedPlayer(saveId, MANAGED_SLUG, 12);
    const before = await clubState(saveId, MANAGED_SLUG);
    const transfersBefore = await database().transfer.count({ where: { saveId } });
    // Any id: the sale only reads whether a match waits (Save.liveFixtureId has no foreign key).
    await database().save.update({ where: { id: saveId }, data: { liveFixtureId: "test-live-fixture" } });
    try {
      expect(await api().sellPlayer({ saveId, playerSaveId: player.id })).toEqual({
        ok: false,
        reason: "match_in_progress",
        refusals: [],
      });
      expect(await clubState(saveId, MANAGED_SLUG)).toEqual(before);
      expect(await database().transfer.count({ where: { saveId } })).toBe(transfersBefore);
      const after = await database().playerSave.findUniqueOrThrow({ where: { id: player.id }, select: { clubSaveId: true } });
      expect(after.clubSaveId).toBe(player.clubSaveId);
    } finally {
      await database().save.update({ where: { id: saveId }, data: { liveFixtureId: null } });
    }
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

  it("is refused by the club below its price, never for a wage: the player joins for his ask at least", async () => {
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
    expect(lowFee).toEqual({ ok: false, reason: "club_refused", refusals: ["fee_too_low"] });
    expect(await clubState(saveId, MANAGED_SLUG)).toEqual(managedBefore);

    // A wage under his ask was a refusal: he now joins for his ask (docs/design/simplification.md § 1.1).
    const lowWage = await api().makeTransferOffer({
      saveId,
      playerSaveId: player.id,
      fee: quote.askingPrice,
      wage: quote.minimumWage - 1,
      years: 2,
    });
    const moved = await database().playerSave.findUniqueOrThrow({ where: { id: player.id }, select: { wage: true } });
    expect(lowWage).toMatchObject({ ok: true, fee: quote.askingPrice, wage: quote.minimumWage, payrollChange: quote.minimumWage });
    expect(moved.wage).toBe(quote.minimumWage);
  });

  it("releases a player with compensation, signs him back for his signing bonus, and renews another contract", async () => {
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

    // A free agent's price is his signing bonus, a quarter of his value: paid out of the budget, the FREE transfer's fee.
    const freeAgentQuote = await api().quoteTransfer({ saveId, playerSaveId: released.id });
    const bonus = await bonusOf(saveId, released.id);
    expect(freeAgentQuote.askingPrice).toBe(bonus);
    expect(bonus).toBeGreaterThanOrEqual(50_000);
    const signing = await api().signFreeAgent({ saveId, playerSaveId: released.id, years: 1 });
    const afterSigning = await clubState(saveId, MANAGED_SLUG);
    const transfer = await database().transfer.findFirstOrThrow({
      where: { saveId, playerSaveId: released.id, type: "FREE", toClubId: { not: null } },
      select: { fee: true, fromClubId: true },
    });
    expect(signing).toMatchObject({
      ok: true,
      fee: bonus,
      budgetChange: -bonus,
      payrollChange: freeAgentQuote.minimumWage,
      wage: freeAgentQuote.minimumWage,
    });
    expect(afterSigning.budget).toBe(afterRelease.budget - bonus);
    expect(afterSigning.payroll - afterRelease.payroll).toBe(freeAgentQuote.minimumWage);
    expect(transfer).toEqual({ fee: bonus, fromClubId: null });

    // A renewal is never refused for its wage: without one, his floor; under it, his floor; above it, what is offered.
    const renewed = await rankedPlayer(saveId, MANAGED_SLUG, 3);
    const renewalQuote = await api().quoteTransfer({ saveId, playerSaveId: renewed.id });
    expect(renewalQuote.minimumWage).toBeGreaterThanOrEqual(renewed.wage);
    const withoutWage = await api().renewContract({ saveId, playerSaveId: renewed.id, years: 4 });
    const underFloor = await api().renewContract({ saveId, playerSaveId: renewed.id, wage: renewalQuote.minimumWage - 1, years: 4 });
    expect(withoutWage).toMatchObject({ ok: true, budgetChange: 0, wage: renewalQuote.minimumWage });
    expect(underFloor).toMatchObject({ ok: true, wage: renewalQuote.minimumWage, payrollChange: 0 });
    const renewal = await api().renewContract({
      saveId,
      playerSaveId: renewed.id,
      wage: renewalQuote.minimumWage + 100_000,
      years: 4,
    });
    const afterRenewal = await clubState(saveId, MANAGED_SLUG);

    expect(renewal).toMatchObject({ ok: true, budgetChange: 0, payrollChange: 100_000, wage: renewalQuote.minimumWage + 100_000 });
    expect(renewal.ok && renewal.contractUntil?.toISOString()).toBe("2030-06-30T00:00:00.000Z");
    expect(afterRenewal.payroll - afterSigning.payroll).toBe(renewalQuote.minimumWage + 100_000 - renewed.wage);
  });

  it("refuses a free agent whose signing bonus the budget does not pay, and changes nothing", async () => {
    const [saveId] = saveIds;
    const { id: playerSaveId } = await database().playerSave.findFirstOrThrow({
      where: api().freeAgentWhere(saveId),
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      select: { id: true },
    });
    const bonus = await bonusOf(saveId, playerSaveId);
    const { id: clubSaveId, budget } = await clubState(saveId, MANAGED_SLUG);
    await database().clubSave.update({ where: { id: clubSaveId, saveId }, data: { budget: bonus - 1 } });
    try {
      const before = await clubState(saveId, MANAGED_SLUG);
      const transfersBefore = await database().transfer.count({ where: { saveId } });

      expect(await api().signFreeAgent({ saveId, playerSaveId, years: 2 })).toEqual({
        ok: false,
        reason: "insufficient_budget",
        refusals: [],
      });
      expect(await clubState(saveId, MANAGED_SLUG)).toEqual(before);
      expect(await database().transfer.count({ where: { saveId } })).toBe(transfersBefore);
      expect((await database().playerSave.findUniqueOrThrow({ where: { id: playerSaveId }, select: { clubSaveId: true } })).clubSaveId).toBeNull();
    } finally {
      await database().clubSave.update({ where: { id: clubSaveId, saveId }, data: { budget } });
    }
  });

  it("refuses a purchase and a free signing at 30 players, but still sells and releases, then signs again under 30", async () => {
    const [saveId] = saveIds;
    const { id: clubSaveId } = await clubState(saveId, MANAGED_SLUG);
    const target = await rankedPlayer(saveId, SELLER_SLUG, 11);
    const targetQuote = await api().quoteTransfer({ saveId, playerSaveId: target.id });
    const { id: freeAgentId } = await database().playerSave.findFirstOrThrow({
      where: api().freeAgentWhere(saveId),
      orderBy: [{ overall: "asc" }, { playerKey: "asc" }],
      select: { id: true },
    });
    // The club's own players, never moved, the weakest first: neither the fillers nor anyone it signed.
    const ownPlayers = () =>
      database().playerSave.findMany({
        where: { saveId, clubSaveId, playerKey: { startsWith: `${MANAGED_SLUG}#` }, transfers: { none: { saveId } } },
        orderBy: [{ overall: "asc" }, { playerKey: "asc" }],
        select: { id: true },
      });

    await withFullSquad(
      saveId,
      clubSaveId,
      async () => {
        const before = await clubState(saveId, MANAGED_SLUG);
        const purchase = await api().makeTransferOffer({ saveId, playerSaveId: target.id, fee: targetQuote.askingPrice, years: 3 });
        const signing = await api().signFreeAgent({ saveId, playerSaveId: freeAgentId, years: 3 });

        expect(purchase).toEqual({ ok: false, reason: "squad_full", refusals: [] });
        expect(signing).toEqual({ ok: false, reason: "squad_full", refusals: [] });
        expect(await clubState(saveId, MANAGED_SLUG)).toEqual(before);

        // Sales and releases are never refused by it: one sold, the squad has a place, the free agent signs.
        const [sold, released] = await ownPlayers();
        expect(await api().sellPlayer({ saveId, playerSaveId: sold.id })).toMatchObject({ ok: true });
        expect(await api().signFreeAgent({ saveId, playerSaveId: freeAgentId, years: 3 })).toMatchObject({ ok: true });
        expect(await squadSizeOf(saveId, clubSaveId)).toBe(SQUAD_LIMIT);
        expect(await api().releasePlayer({ saveId, playerSaveId: released.id })).toMatchObject({ ok: true });
        expect(await squadSizeOf(saveId, clubSaveId)).toBe(SQUAD_LIMIT - 1);
      },
      [freeAgentId],
    );
  });

  it("passes over a buyer at 30 players: the player goes to another club", async () => {
    const [saveId] = saveIds;
    const quotes = await api().quoteSquad(saveId);
    const [playerSaveId, quote] = [...quotes]
      .flatMap(([id, { sale }]) => (sale.ok ? [[id, sale] as const] : []))
      .sort(([, a], [, b]) => b.fee - a.fee || a.buyerName.localeCompare(b.buyerName))[0];
    const clubs = await database().clubSave.findMany({
      where: { saveId, isManaged: false },
      select: { id: true, club: { select: { slug: true, name: true } } },
    });
    const buyer = clubs.find(({ club }) => displayClubName(club) === quote.buyerName);
    if (buyer === undefined) {
      throw new Error(`No club named ${quote.buyerName}`);
    }

    await withFullSquad(saveId, buyer.id, async () => {
      const requoted = (await api().quoteSquad(saveId)).get(playerSaveId)?.sale;
      expect(requoted?.ok === true ? requoted.buyerName : "no offer").not.toBe(quote.buyerName);
      const sale = await api().sellPlayer({ saveId, playerSaveId });
      if (sale.ok) {
        expect(sale.clubSaveId).not.toBe(buyer.id);
      } else {
        expect(sale).toEqual({ ok: false, reason: "no_offer", refusals: [] });
      }
    });
  });

  // No other test uses the second save after the first one. The last of these moves its date on for good.
  it("refuses to sell a player bought on the same day, and the squad quotes say so", async () => {
    const [, saveId] = saveIds;
    await expectBoughtThisWindow(saveId, await buyPlayer(saveId, 8));
  });

  it("refuses to sell a free agent signed on the same day, and the squad quotes say so", async () => {
    const [, saveId] = saveIds;
    await expectBoughtThisWindow(saveId, await signBestFreeAgent(saveId));
  });

  it("still sells a player who was at the club before the window", async () => {
    const [, saveId] = saveIds;
    await buyPlayer(saveId, 9);
    const settled = await database().playerSave.findFirstOrThrow({
      where: { saveId, clubSave: { club: { slug: MANAGED_SLUG } }, transfers: { none: { saveId } } },
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      skip: 9,
      select: { id: true },
    });

    await expectSold(saveId, settled.id);
  });

  it("keeps new players until their window ends, puts the closed window first, and lets them go at the next one", async () => {
    const [, saveId] = saveIds;
    const bought = await buyPlayer(saveId, 10);
    const signed = await signBestFreeAgent(saveId);

    await setDate(saveId, new Date(Date.UTC(WORLD_START_YEAR, 7, 31)));
    await expectBoughtThisWindow(saveId, bought);
    await expectBoughtThisWindow(saveId, signed);

    await setDate(saveId, new Date(Date.UTC(WORLD_START_YEAR, 9, 1)));
    expect(await api().sellPlayer({ saveId, playerSaveId: bought })).toEqual({ ok: false, reason: "window_closed", refusals: [] });
    expect(await saleQuote(saveId, bought)).toEqual({ ok: false, reason: "window_closed" });

    await setDate(saveId, new Date(Date.UTC(WORLD_START_YEAR + 1, 0, 1)));
    await expectSold(saveId, bought);
    await expectSold(saveId, signed);
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

  it("validates its input with the exported Zod schemas, the wage optional", async () => {
    await expect(
      api().makeTransferOffer({ saveId: saveIds[0], playerSaveId: "x", fee: -1, wage: 1, years: 1 }),
    ).rejects.toThrow();
    expect(api().renewContractSchema.safeParse({ saveId: "s", playerSaveId: "p", wage: 1, years: 6 }).success).toBe(false);
    for (const schema of [api().renewContractSchema, api().signFreeAgentSchema]) {
      expect(schema.safeParse({ saveId: "s", playerSaveId: "p", years: 3 }).success).toBe(true);
      expect(schema.safeParse({ saveId: "s", playerSaveId: "p", wage: 0, years: 3 }).success).toBe(false);
    }
    expect(api().makeTransferOfferSchema.safeParse({ saveId: "s", playerSaveId: "p", fee: 1, years: 3 }).success).toBe(true);
  });
});
