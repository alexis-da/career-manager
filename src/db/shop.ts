import * as z from "zod";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { SQUAD_LIMIT } from "../engine/balance";
import { NAME_BANK } from "../engine/names";
import type { Position } from "../engine/positions";
import {
  CAREER_ITEMS,
  CAREER_LIMITS,
  ITEM_PRICES,
  SEASON_LIMITS,
  YOUTH_LINES,
  budgetTopUp,
  campFitness,
  careUntil,
  daysLeft,
  itemsLeft,
  youthPositionIn,
  type CareerItem,
  type PurchaseRefusal,
  type YouthLine,
} from "../engine/shop";
import { competitionTier } from "../engine/tiers";
import { seasonStartYear } from "../engine/world";
import { PROMISING_YOUTH_KEY_PREFIX, generatePromisingYouth, promisingYouthRngSeed, type YouthPlayer } from "../engine/youth";
import { priceOf } from "../lib/cosmetics";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { lockSave } from "./matchday";
import { lockRewards, tokensOf, unlockCosmetics, writeTokens } from "./rewards";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

// The shop of missions v2 (docs/design/missions-v2.md, § 2.3 and § 2.4, CLAUDE.md « Missions du jour »): the career's
// items, bought with the player's tokens in a normal career, never in a challenge one nor while a match waits live; the
// player's streak shield and cosmetics. A purchase is one transaction: the save locked (lockSave), then the player's
// rewards (lockRewards), the limits counted, the conditions checked, then the purchase (its id the request's, from the
// browser: a second sending meets it and gets the first's result), the debit and the effect. ShopPurchase is a table of
// the save: always read by saveId, after requireOwnedSave.

type Db = PrismaClient | Prisma.TransactionClient;

const TRANSACTION_OPTIONS = { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: 30_000 };

/** What a purchase did, kept with it (ShopPurchase.effect), validated when read. */
export const purchaseEffectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("camp"), date: z.string(), players: z.number().int() }),
  z.object({ kind: z.literal("care"), playerKey: z.string(), from: z.string(), to: z.string() }),
  z.object({ kind: z.literal("topUp"), amount: z.number().int() }),
  z.object({
    kind: z.literal("youth"),
    playerKey: z.string(),
    line: z.enum(YOUTH_LINES),
    position: z.string(),
    contractUntil: z.string(), // the end of his first contract: neither sold nor released before
  }),
]);
export type PurchaseEffect = z.infer<typeof purchaseEffectSchema>;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** The save, its managed club and its player, as the shop reads them. */
type ShopContext = {
  ownerId: string | null;
  challenge: boolean;
  live: boolean; // a match waits live: its club's (Save.liveFixtureId) or its national coach's (Save.liveInternationalId)
  seed: string;
  currentDate: Date;
  tokens: number;
  shield: boolean;
  clubSaveId: string;
  budget: number;
  wageBudget: number;
  payroll: number;
  squadSize: number; // the managed club's players under contract: a promising youth needs a place under SQUAD_LIMIT
  reputation: number;
  slug: string;
  country: string;
  tier: number;
  dotation: number | null; // the latest SeasonBudget's; null for a save older than them, until its next season
  startYear: number; // the career's season now, reset by advanceToNextSeason
};

async function shopContext(db: Db, saveId: string): Promise<ShopContext> {
  const [row] = await db.$queryRaw<Omit<ShopContext, "startYear">[]>`
    SELECT s."ownerId", s."challengeId" IS NOT NULL AS challenge, (s."liveFixtureId" IS NOT NULL OR s."liveInternationalId" IS NOT NULL) AS live, s."seed",
           s."currentDate", coalesce(u."tokens", 0) AS tokens, coalesce(u."streakShield", false) AS shield,
           c."id" AS "clubSaveId", c."budget", c."wageBudget", c."reputation", cl."slug", cl."country", co."tier",
           (SELECT coalesce(sum(p."wage"), 0)::int FROM "PlayerSave" p
            WHERE p."saveId" = s."id" AND p."clubSaveId" = c."id") AS payroll,
           (SELECT count(*)::int FROM "PlayerSave" p
            WHERE p."saveId" = s."id" AND p."clubSaveId" = c."id" AND NOT p."retired") AS "squadSize",
           (SELECT b."dotation" FROM "SeasonBudget" b JOIN "Season" se ON se."id" = b."seasonId"
            WHERE b."saveId" = s."id" ORDER BY se."startYear" DESC LIMIT 1) AS dotation
    FROM "Save" s
    LEFT JOIN "User" u ON u."id" = s."ownerId"
    JOIN "ClubSave" c ON c."saveId" = s."id" AND c."isManaged"
    JOIN "Club" cl ON cl."id" = c."clubId"
    JOIN "Competition" co ON co."id" = c."competitionId"
    WHERE s."id" = ${saveId}`;
  if (row === undefined) {
    throw new Error(`Save ${saveId} has no managed club`);
  }
  return { ...row, startYear: seasonStartYear(row.currentDate) };
}

type PurchaseRow = { id: string; item: string; seasonStartYear: number; effect: unknown };

/** A career's purchases, a few a season. */
async function purchasesOf(db: Db, saveId: string): Promise<PurchaseRow[]> {
  return db.shopPurchase.findMany({
    where: { saveId },
    orderBy: { createdAt: "asc" },
    select: { id: true, item: true, seasonStartYear: true, effect: true },
  });
}

function boughtOf(purchases: readonly PurchaseRow[], item: CareerItem, startYear: number): { season: number; career: number } {
  const all = purchases.filter((purchase) => purchase.item === item);
  return { season: all.filter((purchase) => purchase.seasonStartYear === startYear).length, career: all.length };
}

/** Whether a fitness camp was bought on the save's date already: one a date. */
function campedOn(purchases: readonly PurchaseRow[], day: string): boolean {
  return purchases.some((purchase) => {
    const effect = purchaseEffectSchema.safeParse(purchase.effect);
    return effect.success && effect.data.kind === "camp" && effect.data.date === day;
  });
}

type SquadRow = { id: string; firstName: string; lastName: string; position: Position; fitness: number; injuredUntil: Date | null; overall: number };

async function squadOf(db: Db, saveId: string, clubSaveId: string): Promise<SquadRow[]> {
  return db.playerSave.findMany({
    where: { saveId, clubSaveId },
    select: { id: true, firstName: true, lastName: true, position: true, fitness: true, injuredUntil: true, overall: true },
  });
}

/** The promising youth a purchase of rank `index` would bring in a line: the same for the same purchases. */
function youthFor(context: ShopContext, squad: readonly SquadRow[], line: YouthLine, index: number): YouthPlayer {
  return generatePromisingYouth(
    {
      club: { slug: context.slug, country: context.country, reputation: context.reputation, tier: competitionTier(context.tier) },
      position: youthPositionIn(
        line,
        squad.map((player) => player.position),
      ),
      date: context.currentDate,
      index,
      takenNames: new Set(squad.map((player) => `${player.firstName} ${player.lastName}`)),
    },
    NAME_BANK,
    makeRng(promisingYouthRngSeed(context.seed, index)),
  );
}

/** A career item as the Rewards screen offers it. */
export type CareerItemView = {
  item: CareerItem;
  price: number;
  season: { bought: number; limit: number };
  career: { bought: number; limit: number } | null;
  refusal: PurchaseRefusal | null; // why it cannot be bought now, null when it can (tokens apart: the screen compares)
};

/** A player of the managed club express care can heal sooner. */
export type CareCandidate = { id: string; name: string; position: Position; overall: number; daysLeft: number; daysAfter: number };

/** The promising youth a line would bring. */
export type YouthCandidate = {
  line: YouthLine;
  firstName: string;
  lastName: string;
  position: Position;
  overall: number;
  potential: number;
  wage: number; // euros per season, written with his contract
  // Always true: no wage budget refuses him since the simplification (docs/design/simplification.md § 1.1), only a full
  // squad, which refuses the item itself (squad_full). Kept until the Rewards screen drops its wage lines.
  fits: boolean;
};

export type ShopView = {
  challenge: boolean; // no shop: nothing below is filled
  live: boolean; // a match waits live: nothing of the career's can be bought
  startYear: number;
  tokens: number;
  shield: boolean;
  items: CareerItemView[];
  budget: number; // euros: the managed club's transfer budget now
  topUp: number; // euros the budget top-up adds
  wageRoom: number; // euros per season left under the wage budget: no limit any more, kept until the screen drops it
  squadSize: number; // the managed club's players under contract: a promising youth takes a place, SQUAD_LIMIT at most
  belowFull: number; // players under full fitness, whom a camp would help
  care: CareCandidate[];
  youth: YouthCandidate[];
};

/**
 * The shop of a career now, read only. withYouth: the promising youth each line would bring, drawn for the Rewards tab;
 * the shortcuts of the squad and the line-up go without.
 */
export async function getShop(saveId: string, db: PrismaClient = prisma, withYouth = true): Promise<ShopView> {
  const context = await shopContext(db, saveId);
  const empty: ShopView = {
    challenge: context.challenge || context.ownerId === null,
    live: context.live,
    startYear: context.startYear,
    tokens: context.tokens,
    shield: context.shield,
    items: [],
    budget: context.budget,
    topUp: 0,
    wageRoom: context.wageBudget - context.payroll,
    squadSize: context.squadSize,
    belowFull: 0,
    care: [],
    youth: [],
  };
  if (empty.challenge) {
    return empty;
  }
  const purchases = await purchasesOf(db, saveId);
  const squad = await squadOf(db, saveId, context.clubSaveId);
  const day = isoDay(context.currentDate);
  const care = squad
    .map((player) => ({ player, until: careUntil(player.injuredUntil, context.currentDate) }))
    .filter(({ until }) => until !== null)
    .map(({ player, until }) => ({
      id: player.id,
      name: `${player.firstName} ${player.lastName}`,
      position: player.position,
      overall: player.overall,
      daysLeft: daysLeft(player.injuredUntil, context.currentDate),
      daysAfter: until === null ? 0 : daysLeft(until, context.currentDate),
    }))
    .sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
  const belowFull = squad.filter((player) => player.fitness < campFitness()).length;
  const youthIndex = boughtOf(purchases, "PROMISING_YOUTH", context.startYear).career + 1;
  const youth = (withYouth ? YOUTH_LINES : []).map((line): YouthCandidate => {
    const player = youthFor(context, squad, line, youthIndex);
    return {
      line,
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      overall: player.overall,
      potential: player.potential,
      wage: player.wage,
      fits: true,
    };
  });
  const items = CAREER_ITEMS.map((item): CareerItemView => {
    const bought = boughtOf(purchases, item, context.startYear);
    const left = itemsLeft(item, bought.season, bought.career);
    const careerLimit = CAREER_LIMITS[item];
    const refusal: PurchaseRefusal | null = context.live
      ? "live"
      : left.season <= 0
        ? "season_limit"
        : left.career !== null && left.career <= 0
          ? "career_limit"
          : item === "FITNESS_CAMP" && campedOn(purchases, day)
            ? "camp_today"
            : item === "FITNESS_CAMP" && belowFull === 0
              ? "full_fitness"
              : item === "EXPRESS_CARE" && care.length === 0
                ? "not_injured"
                : item === "PROMISING_YOUTH" && context.squadSize >= SQUAD_LIMIT
                  ? "squad_full"
                  : null;
    return {
      item,
      price: ITEM_PRICES[item],
      season: { bought: bought.season, limit: SEASON_LIMITS[item] },
      career: careerLimit === undefined ? null : { bought: bought.career, limit: careerLimit },
      refusal,
    };
  });
  return { ...empty, items, topUp: budgetTopUp(context.dotation ?? 0), belowFull, care, youth };
}

/** What the screens offer from the shop elsewhere: express care on an injured player's sheet, a camp in the line-up. */
export type ShopShortcuts = {
  care: { price: number; left: number } | null; // null: not now (challenge, live, limit reached)
  camp: { price: number; left: number } | null;
};

export async function getShopShortcuts(saveId: string, db: PrismaClient = prisma): Promise<ShopShortcuts> {
  const shop = await getShop(saveId, db, false);
  const shortcut = (item: CareerItem, ignored: readonly PurchaseRefusal[]) => {
    const view = shop.items.find((candidate) => candidate.item === item);
    return view === undefined || (view.refusal !== null && !ignored.includes(view.refusal))
      ? null
      : { price: view.price, left: view.season.limit - view.season.bought };
  };
  return { care: shortcut("EXPRESS_CARE", ["not_injured"]), camp: shortcut("FITNESS_CAMP", []) };
}

/** A purchase of a career item, its id made by the browser for the request. */
export type CareerPurchase =
  | { requestId: string; item: "FITNESS_CAMP" | "BUDGET_TOP_UP" }
  | { requestId: string; item: "EXPRESS_CARE"; playerSaveId: string }
  | { requestId: string; item: "PROMISING_YOUTH"; line: YouthLine };

export type PurchaseOutcome =
  | { ok: true; price: number; tokens: number; effect: PurchaseEffect | null; repeated: boolean }
  | { ok: false; reason: PurchaseRefusal; price: number; tokens: number };

/** Buys a career item, once for a request: the same request again gets the first's result, nothing more paid. */
export async function buyCareerItem(saveId: string, purchase: CareerPurchase, db: PrismaClient = prisma): Promise<PurchaseOutcome> {
  const price = ITEM_PRICES[purchase.item];
  return db.$transaction(async (tx) => {
    await lockSave(tx, saveId);
    const context = await shopContext(tx, saveId);
    const refuse = (reason: PurchaseRefusal): PurchaseOutcome => ({ ok: false, reason, price, tokens: context.tokens });
    if (context.ownerId === null || context.challenge) {
      return refuse("challenge");
    }
    const userId = context.ownerId;
    await lockRewards(tx, userId);
    const previous = await tx.shopPurchase.findUnique({ where: { id: purchase.requestId }, select: { saveId: true, item: true, effect: true } });
    if (previous !== null) {
      if (previous.saveId !== saveId || previous.item !== purchase.item) {
        return refuse("not_for_sale");
      }
      const effect = purchaseEffectSchema.safeParse(previous.effect);
      return { ok: true, price, tokens: await tokensOf(tx, userId), effect: effect.success ? effect.data : null, repeated: true };
    }
    if (context.live) {
      return refuse("live");
    }
    const purchases = await purchasesOf(tx, saveId);
    const bought = boughtOf(purchases, purchase.item, context.startYear);
    const left = itemsLeft(purchase.item, bought.season, bought.career);
    if (left.season <= 0) {
      return refuse("season_limit");
    }
    if (left.career !== null && left.career <= 0) {
      return refuse("career_limit");
    }
    const tokens = await tokensOf(tx, userId);
    if (tokens < price) {
      return refuse("tokens");
    }

    let effect: PurchaseEffect;
    switch (purchase.item) {
      case "FITNESS_CAMP": {
        const day = isoDay(context.currentDate);
        if (campedOn(purchases, day)) {
          return refuse("camp_today");
        }
        const players = await tx.$executeRaw`
          UPDATE "PlayerSave" SET "fitness" = ${campFitness()}
          WHERE "saveId" = ${saveId} AND "clubSaveId" = ${context.clubSaveId} AND "fitness" < ${campFitness()}`;
        if (players === 0) {
          return refuse("full_fitness");
        }
        effect = { kind: "camp", date: day, players };
        break;
      }
      case "EXPRESS_CARE": {
        const player = await tx.playerSave.findFirst({
          where: { id: purchase.playerSaveId, saveId, clubSaveId: context.clubSaveId },
          select: { id: true, playerKey: true, injuredUntil: true },
        });
        const until = player === null ? null : careUntil(player.injuredUntil, context.currentDate);
        if (player === null || player.injuredUntil === null || until === null) {
          return refuse("not_injured");
        }
        await tx.playerSave.update({ where: { id: player.id, saveId }, data: { injuredUntil: until } });
        effect = { kind: "care", playerKey: player.playerKey, from: player.injuredUntil.toISOString(), to: until.toISOString() };
        break;
      }
      case "BUDGET_TOP_UP": {
        const amount = budgetTopUp(context.dotation ?? 0);
        await tx.clubSave.update({ where: { id: context.clubSaveId, saveId }, data: { budget: { increment: amount } } });
        effect = { kind: "topUp", amount };
        break;
      }
      case "PROMISING_YOUTH": {
        // He takes a place: none at SQUAD_LIMIT (docs/design/simplification.md § 1.4). His wage limits nothing.
        if (context.squadSize >= SQUAD_LIMIT) {
          return refuse("squad_full");
        }
        const squad = await squadOf(tx, saveId, context.clubSaveId);
        const { key, ...youth } = youthFor(context, squad, purchase.line, bought.career + 1);
        await tx.playerSave.create({ data: { ...youth, saveId, playerKey: key, clubSaveId: context.clubSaveId } });
        effect = { kind: "youth", playerKey: key, line: purchase.line, position: youth.position, contractUntil: youth.contractUntil.toISOString() };
        break;
      }
    }
    await tx.shopPurchase.create({
      data: { id: purchase.requestId, saveId, item: purchase.item, seasonStartYear: context.startYear, price, effect },
    });
    await writeTokens(tx, { userId, key: `purchase:${purchase.requestId}`, reason: "PURCHASE", amount: -price, saveId, item: purchase.item });
    return { ok: true, price, tokens: tokens - price, effect, repeated: false };
  }, TRANSACTION_OPTIONS);
}

/** The player's purchases away from a career's items: from a normal career, never a challenge one. */
async function playerPurchase(
  saveId: string,
  requestId: string,
  price: number,
  buy: (tx: Prisma.TransactionClient, userId: string, tokens: number) => Promise<PurchaseRefusal | null>,
  db: PrismaClient,
): Promise<PurchaseOutcome> {
  const save = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { ownerId: true, challengeId: true } });
  if (save.ownerId === null || save.challengeId !== null) {
    return { ok: false, reason: "challenge", price, tokens: 0 };
  }
  const userId = save.ownerId;
  return db.$transaction(async (tx) => {
    await lockRewards(tx, userId);
    const key = `purchase:${requestId}`;
    const previous = await tx.tokenEntry.findUnique({ where: { userId_key: { userId, key } }, select: { id: true } });
    const tokens = await tokensOf(tx, userId);
    if (previous !== null) {
      return { ok: true as const, price, tokens, effect: null, repeated: true };
    }
    const refusal = tokens < price ? "tokens" : await buy(tx, userId, tokens);
    if (refusal !== null) {
      return { ok: false as const, reason: refusal, price, tokens };
    }
    return { ok: true as const, price, tokens: tokens - price, effect: null, repeated: false };
  }, TRANSACTION_OPTIONS);
}

/** Buys a streak shield, one in reserve at most, from a normal career. */
export async function buyStreakShield(saveId: string, requestId: string, db: PrismaClient = prisma): Promise<PurchaseOutcome> {
  const price = ITEM_PRICES.STREAK_SHIELD;
  return playerPurchase(
    saveId,
    requestId,
    price,
    async (tx, userId) => {
      const [{ shield }] = await tx.$queryRaw<{ shield: boolean }[]>`SELECT "streakShield" AS shield FROM "User" WHERE "id" = ${userId}`;
      if (shield) {
        return "shield_held";
      }
      await tx.$executeRaw`UPDATE "User" SET "streakShield" = true WHERE "id" = ${userId}`;
      await writeTokens(tx, { userId, key: `purchase:${requestId}`, reason: "PURCHASE", amount: -price, saveId, item: "STREAK_SHIELD" });
      return null;
    },
    db,
  );
}

/** Buys a cosmetic on sale, once, from a normal career. */
export async function buyCosmetic(saveId: string, requestId: string, cosmetic: string, db: PrismaClient = prisma): Promise<PurchaseOutcome> {
  const price = priceOf(cosmetic);
  if (price === null) {
    return { ok: false, reason: "not_for_sale", price: 0, tokens: 0 };
  }
  return playerPurchase(
    saveId,
    requestId,
    price,
    async (tx, userId) => {
      const unlocked = await unlockCosmetics(tx, userId, [cosmetic], "SHOP");
      if (unlocked.length === 0) {
        return "owned";
      }
      await writeTokens(tx, { userId, key: `purchase:${requestId}`, reason: "PURCHASE", amount: -price, saveId, item: "COSMETIC", cosmetic });
      return null;
    },
    db,
  );
}

/**
 * The promising youths of a career still on their first contract, by player key, with its end: neither sold nor released
 * before (docs/design/missions-v2.md, § 2.4). No query unless a key given is a promising youth's.
 */
export async function academyLocks(db: Db, saveId: string, date: Date, playerKeys: readonly string[]): Promise<Map<string, Date>> {
  const locks = new Map<string, Date>();
  if (!playerKeys.some((key) => key.startsWith(PROMISING_YOUTH_KEY_PREFIX))) {
    return locks;
  }
  const rows = await db.shopPurchase.findMany({ where: { saveId, item: "PROMISING_YOUTH" }, select: { effect: true } });
  for (const { effect } of rows) {
    const parsed = purchaseEffectSchema.safeParse(effect);
    if (parsed.success && parsed.data.kind === "youth") {
      const until = new Date(parsed.data.contractUntil);
      if (date < until) {
        locks.set(parsed.data.playerKey, until);
      }
    }
  }
  return locks;
}
