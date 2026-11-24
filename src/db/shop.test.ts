import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQUAD_LIMIT } from "../engine/balance";
import { budgetTopUp } from "../engine/shop";
import type { prisma as prismaClient } from "./client";

// The shop of missions v2, against DATABASE_URL: a twin of the demo save (worldVersion 1, in the summer window on its
// first day) with a throwaway owner, given tokens through the journal as the game would. Each purchase is a new request
// unless a test sends one twice. Skipped without DATABASE_URL; modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the shop of missions v2, in the database", () => {
  let db: typeof prismaClient | undefined;
  let shop: typeof import("./shop") | undefined;
  let rewards: typeof import("./rewards") | undefined;
  let transfers: typeof import("./transfers") | undefined;
  let saveId = "";
  let ownerId = "";
  let clubSaveId = "";
  let currentDate = new Date(0);
  const MS = 120_000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const loaded = () => {
    if (db === undefined || shop === undefined || rewards === undefined || transfers === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, shop, rewards, transfers };
  };
  // Not simulation code: a request's id, as the browser makes one.
  const request = () => randomUUID();
  const give = async (amount: number) => {
    const { db, rewards } = loaded();
    await db.$transaction(async (tx) => {
      await rewards.lockRewards(tx, ownerId);
      await rewards.writeTokens(tx, { userId: ownerId, key: `test:${request()}`, reason: "WELCOME", amount });
    });
  };
  const tokens = async () => (await loaded().db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { tokens: true } })).tokens;
  const journalSum = async () => (await loaded().db.tokenEntry.aggregate({ where: { userId: ownerId }, _sum: { amount: true } }))._sum.amount ?? 0;
  const squad = async () =>
    loaded().db.playerSave.findMany({
      where: { saveId, clubSaveId },
      orderBy: { overall: "desc" },
      select: { id: true, playerKey: true, fitness: true, injuredUntil: true, wage: true },
    });

  beforeAll(async () => {
    const [{ prisma }, shopModule, rewardsModule, transfersModule, support] = await Promise.all([
      import("./client"),
      import("./shop"),
      import("./rewards"),
      import("./transfers"),
      import("./test-support"),
    ]);
    db = prisma;
    shop = shopModule;
    rewards = rewardsModule;
    transfers = transfersModule;
    saveId = await support.createDemoTwin("Boutique");
    const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { ownerId: true, currentDate: true } });
    ownerId = save.ownerId ?? "";
    currentDate = save.currentDate;
    ({ id: clubSaveId } = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } }));
  }, MS);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: saveId } });
    await db?.$disconnect();
  }, MS);

  it("refuses what the player cannot pay, then holds a fitness camp once a date, once for a request", async () => {
    const { db, shop } = loaded();
    expect(await shop.buyCareerItem(saveId, { requestId: request(), item: "FITNESS_CAMP" })).toMatchObject({ ok: false, reason: "tokens" });
    await give(2_000);
    await db.playerSave.updateMany({ where: { saveId, clubSaveId }, data: { fitness: 60 } });
    const id = request();

    const camp = await shop.buyCareerItem(saveId, { requestId: id, item: "FITNESS_CAMP" });

    const players = await squad();
    expect(camp).toMatchObject({ ok: true, price: 40, tokens: 1_960, repeated: false, effect: { kind: "camp", players: players.length } });
    expect(players.every(({ fitness }) => fitness === 100)).toBe(true);
    // The same request again (a second touch, a retry): its first result, nothing paid.
    expect(await shop.buyCareerItem(saveId, { requestId: id, item: "FITNESS_CAMP" })).toMatchObject({ ok: true, repeated: true, tokens: 1_960 });
    expect(await shop.buyCareerItem(saveId, { requestId: request(), item: "FITNESS_CAMP" })).toMatchObject({ ok: false, reason: "camp_today" });
    expect(await tokens()).toBe(1_960);
  }, MS);

  it("heals an injured player in half his days left, from four days left", async () => {
    const { db, shop } = loaded();
    const [first, second] = await squad();
    await db.playerSave.update({ where: { id: first.id, saveId }, data: { injuredUntil: new Date(currentDate.getTime() + 20 * DAY_MS) } });
    await db.playerSave.update({ where: { id: second.id, saveId }, data: { injuredUntil: new Date(currentDate.getTime() + 3 * DAY_MS) } });

    const care = await shop.buyCareerItem(saveId, { requestId: request(), item: "EXPRESS_CARE", playerSaveId: first.id });

    expect(care).toMatchObject({ ok: true, price: 60 });
    const healed = await db.playerSave.findUniqueOrThrow({ where: { id: first.id }, select: { injuredUntil: true } });
    expect(healed.injuredUntil).toEqual(new Date(currentDate.getTime() + 10 * DAY_MS));
    expect(await shop.buyCareerItem(saveId, { requestId: request(), item: "EXPRESS_CARE", playerSaveId: second.id })).toMatchObject({
      ok: false,
      reason: "not_injured",
    });
    await db.playerSave.updateMany({ where: { saveId, clubSaveId }, data: { injuredUntil: null } });
  }, MS);

  it("tops the budget up by 5 % of the season's dotation, once a season", async () => {
    const { db, shop } = loaded();
    const { dotation } = await db.seasonBudget.findFirstOrThrow({ where: { saveId }, select: { dotation: true } });
    const { budget } = await db.clubSave.findUniqueOrThrow({ where: { id: clubSaveId }, select: { budget: true } });

    expect(await shop.buyCareerItem(saveId, { requestId: request(), item: "BUDGET_TOP_UP" })).toMatchObject({
      ok: true,
      effect: { kind: "topUp", amount: budgetTopUp(dotation) },
    });
    expect((await db.clubSave.findUniqueOrThrow({ where: { id: clubSaveId }, select: { budget: true } })).budget).toBe(budget + budgetTopUp(dotation));
    expect(await shop.buyCareerItem(saveId, { requestId: request(), item: "BUDGET_TOP_UP" })).toMatchObject({ ok: false, reason: "season_limit" });
  }, MS);

  it("brings the promising youth the shop showed, whatever the wage budget, but no one into a full squad", async () => {
    const { db, shop, transfers } = loaded();
    const shown = await shop.getShop(saveId);
    const striker = shown.youth.find(({ line }) => line === "FW");
    if (striker === undefined) {
      throw new Error("No youth shown for the attack");
    }
    expect(striker).toMatchObject({ overall: 63, position: expect.any(String), fits: true });
    expect(striker.potential - striker.overall).toBeGreaterThanOrEqual(25);
    const squadSize = (await squad()).length;
    expect(shown.squadSize).toBe(squadSize);
    expect(shown.items.find(({ item }) => item === "PROMISING_YOUTH")?.refusal).toBeNull();

    // A squad of 30 players: free agents moved in, as they are, then sent back to the market. Refused, the item too.
    const fillers = await db.playerSave.findMany({
      where: transfers.freeAgentWhere(saveId),
      orderBy: { playerKey: "asc" },
      take: SQUAD_LIMIT - squadSize,
      select: { id: true },
    });
    await db.playerSave.updateMany({ where: { saveId, id: { in: fillers.map(({ id }) => id) } }, data: { clubSaveId } });
    try {
      expect(await shop.buyCareerItem(saveId, { requestId: request(), item: "PROMISING_YOUTH", line: "FW" })).toMatchObject({
        ok: false,
        reason: "squad_full",
      });
      const full = await shop.getShop(saveId);
      expect(full.squadSize).toBe(SQUAD_LIMIT);
      expect(full.items.find(({ item }) => item === "PROMISING_YOUTH")?.refusal).toBe("squad_full");
    } finally {
      await db.playerSave.updateMany({ where: { saveId, id: { in: fillers.map(({ id }) => id) } }, data: { clubSaveId: null } });
    }

    // His wage limits nothing any more: a wage budget with no room left does not refuse him.
    const payroll = (await squad()).reduce((sum, { wage }) => sum + wage, 0);
    await db.clubSave.update({ where: { id: clubSaveId }, data: { wageBudget: payroll } });
    const bought = await shop.buyCareerItem(saveId, { requestId: request(), item: "PROMISING_YOUTH", line: "FW" });
    expect(bought).toMatchObject({ ok: true, price: 350, effect: { kind: "youth", playerKey: "shop-youth:1", line: "FW" } });
    const youth = await db.playerSave.findUniqueOrThrow({
      where: { saveId_playerKey: { saveId, playerKey: "shop-youth:1" } },
      select: { id: true, firstName: true, lastName: true, overall: true, potential: true, wage: true, position: true, clubSaveId: true, contractUntil: true },
    });
    expect(youth).toMatchObject({
      firstName: striker.firstName,
      lastName: striker.lastName,
      overall: striker.overall,
      potential: striker.potential,
      wage: striker.wage,
      position: striker.position,
      clubSaveId,
    });

    // Neither sold nor released before his first contract ends.
    const terms = (await transfers.quoteSquad(saveId)).get(youth.id);
    expect(terms?.sale).toEqual({ ok: false, reason: "academy" });
    expect(terms?.academyUntil).toEqual(youth.contractUntil);
    expect(await transfers.sellPlayer({ saveId, playerSaveId: youth.id })).toMatchObject({ ok: false, reason: "academy" });
    expect(await transfers.releasePlayer({ saveId, playerSaveId: youth.id })).toMatchObject({ ok: false, reason: "academy" });
    expect(await shop.buyCareerItem(saveId, { requestId: request(), item: "PROMISING_YOUTH", line: "MF" })).toMatchObject({
      ok: false,
      reason: "season_limit",
    });
  }, MS);

  it("sells nothing of the career's while a match waits live, nor anything in a challenge save", async () => {
    const { db, shop } = loaded();
    await db.save.update({ where: { id: saveId }, data: { liveFixtureId: "waiting" } });
    try {
      expect(await shop.buyCareerItem(saveId, { requestId: request(), item: "EXPRESS_CARE", playerSaveId: "any" })).toMatchObject({
        ok: false,
        reason: "live",
      });
      expect((await shop.getShop(saveId)).items.every(({ refusal }) => refusal === "live")).toBe(true);
    } finally {
      await db.save.update({ where: { id: saveId }, data: { liveFixtureId: null } });
    }
    // A challenge of a far year of its own: another file's weeks are deleted with their saves.
    const weekKey = `2004-W${10 + (Date.now() % 40)}`;
    const club = await db.club.findFirstOrThrow({ select: { id: true } });
    const week = await db.challenge.create({
      data: { weekKey, seed: weekKey, clubId: club.id, horizonMatchdays: 10, startsAt: new Date("2004-05-03T00:00:00.000Z"), endsAt: new Date("2004-05-10T00:00:00.000Z") },
      select: { id: true },
    });
    await db.save.update({ where: { id: saveId }, data: { challengeId: week.id } });
    try {
      expect(await shop.buyCareerItem(saveId, { requestId: request(), item: "FITNESS_CAMP" })).toMatchObject({ ok: false, reason: "challenge" });
      expect(await shop.buyStreakShield(saveId, request())).toMatchObject({ ok: false, reason: "challenge" });
      expect((await shop.getShop(saveId)).challenge).toBe(true);
    } finally {
      await db.save.update({ where: { id: saveId }, data: { challengeId: null } });
      await db.challenge.delete({ where: { id: week.id } });
    }
  }, MS);

  it("keeps one streak shield in reserve, sells a cosmetic once, and the journal adds up to the balance", async () => {
    const { db, shop } = loaded();
    const before = await tokens();
    expect(await shop.buyStreakShield(saveId, request())).toMatchObject({ ok: true, price: 50, tokens: before - 50 });
    expect((await db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { streakShield: true } })).streakShield).toBe(true);
    expect(await shop.buyStreakShield(saveId, request())).toMatchObject({ ok: false, reason: "shield_held" });

    expect(await shop.buyCosmetic(saveId, request(), "title-professor")).toMatchObject({ ok: true, price: 250 });
    expect(await shop.buyCosmetic(saveId, request(), "title-professor")).toMatchObject({ ok: false, reason: "owned" });
    expect(await shop.buyCosmetic(saveId, request(), "frame-gold")).toMatchObject({ ok: false, reason: "not_for_sale" });
    expect(await db.playerCosmetic.findMany({ where: { userId: ownerId }, select: { cosmetic: true, source: true } })).toEqual([
      { cosmetic: "title-professor", source: "SHOP" },
    ]);
    expect(await tokens()).toBe(before - 300);
    expect(await journalSum()).toBe(await tokens());
  }, MS);
});
