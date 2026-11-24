"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import { prisma } from "@/src/db/client";
import { CosmeticNotOwnedError, wearCosmetic } from "@/src/db/rewards";
import { buyCareerItem, buyCosmetic, buyStreakShield, type PurchaseEffect, type PurchaseOutcome } from "@/src/db/shop";
import { YOUTH_LINES } from "@/src/engine/shop";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { COSMETIC_KINDS, isCosmeticId, type CosmeticId } from "@/src/lib/cosmetics";
import { formatDate, formatMoney } from "@/src/lib/format";

// The Rewards tab's actions (missions v2): a purchase in the shop, a cosmetic worn. Each checks the save's owner first,
// validates what the browser sends, and answers with a message ready to show and the balance after.

const saveIdSchema = z.string().min(1);
const requestIdSchema = z.uuid();
const cosmeticIdSchema = z.string().refine((id): id is CosmeticId => isCosmeticId(id));

const purchaseSchema = z.discriminatedUnion("item", [
  z.object({ requestId: requestIdSchema, item: z.enum(["FITNESS_CAMP", "BUDGET_TOP_UP"]) }),
  z.object({ requestId: requestIdSchema, item: z.literal("EXPRESS_CARE"), playerSaveId: z.string().min(1) }),
  z.object({ requestId: requestIdSchema, item: z.literal("PROMISING_YOUTH"), line: z.enum(YOUTH_LINES) }),
  z.object({ requestId: requestIdSchema, item: z.literal("STREAK_SHIELD") }),
  z.object({ requestId: requestIdSchema, item: z.literal("COSMETIC"), cosmetic: cosmeticIdSchema }),
]);
export type PurchaseInput = z.input<typeof purchaseSchema>;

const wearSchema = z.object({ kind: z.enum(COSMETIC_KINDS), cosmetic: cosmeticIdSchema.nullable() });
export type WearInput = z.input<typeof wearSchema>;

/** An action's answer: its message, and the player's balance after, null when unknown. */
export type RewardsActionResult = { ok: boolean; message: string; tokens: number | null };

/** A refusal as the player reads it, its figures included. */
function refusalOf(outcome: Extract<PurchaseOutcome, { ok: false }>, t: Translator<"rewards">): string {
  switch (outcome.reason) {
    case "tokens":
      return t("shop.refusals.tokens", { missing: Math.max(1, outcome.price - outcome.tokens) });
    default:
      return t(`shop.refusals.${outcome.reason}`);
  }
}

/** A player of the save by his key, named. */
async function playerNamed(saveId: string, playerKey: string): Promise<string> {
  const player = await prisma.playerSave.findUnique({
    where: { saveId_playerKey: { saveId, playerKey } },
    select: { firstName: true, lastName: true },
  });
  return player === null ? "" : `${player.firstName} ${player.lastName}`;
}

/** What a purchase did, in words. */
async function doneMessage(
  saveId: string,
  purchase: z.output<typeof purchaseSchema>,
  effect: PurchaseEffect | null,
  t: Translator<"rewards">,
  locale: Locale,
): Promise<string> {
  if (purchase.item === "STREAK_SHIELD") {
    return t("shop.done.STREAK_SHIELD");
  }
  if (purchase.item === "COSMETIC") {
    return t("shop.done.COSMETIC", { name: t(`cosmetics.${purchase.cosmetic}.name`) });
  }
  switch (effect?.kind) {
    case "camp":
      return t("shop.done.FITNESS_CAMP", { count: effect.players });
    case "care":
      return t("shop.done.EXPRESS_CARE", { name: await playerNamed(saveId, effect.playerKey), date: formatDate(new Date(effect.to), locale) });
    case "topUp":
      return t("shop.done.BUDGET_TOP_UP", { amount: formatMoney(effect.amount, locale) });
    case "youth":
      return t("shop.done.PROMISING_YOUTH", { name: await playerNamed(saveId, effect.playerKey) });
    default:
      return t(`shop.items.${purchase.item}.name`);
  }
}

/**
 * Buys an item of the shop for the save's player: a career's item in this career, a streak shield or a cosmetic for
 * them. The request's id comes from the browser: sent twice, it is bought once.
 */
export async function buyAction(saveId: string, input: PurchaseInput): Promise<RewardsActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("rewards");
  const locale = await getLocale();
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: t("shop.refusals.failed"), tokens: null };
  }
  const purchase = parsed.data;
  const outcome =
    purchase.item === "STREAK_SHIELD"
      ? await buyStreakShield(id, purchase.requestId)
      : purchase.item === "COSMETIC"
        ? await buyCosmetic(id, purchase.requestId, purchase.cosmetic)
        : await buyCareerItem(id, purchase);
  if (!outcome.ok) {
    return { ok: false, message: refusalOf(outcome, t), tokens: outcome.tokens };
  }
  // The squad, the budget, the fitness and the header change with a career's item; the tokens everywhere they show.
  revalidatePath(`/saves/${id}`, "layout");
  return { ok: true, message: await doneMessage(id, purchase, outcome.effect, t, locale), tokens: outcome.tokens };
}

/** Wears a cosmetic of the player's collection, or takes the badge off (null). */
export async function wearAction(saveId: string, input: WearInput): Promise<RewardsActionResult> {
  const { id, ownerId } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("rewards");
  const parsed = wearSchema.safeParse(input);
  if (!parsed.success || ownerId === null) {
    return { ok: false, message: t("collection.wearRefused"), tokens: null };
  }
  const { kind, cosmetic } = parsed.data;
  try {
    await wearCosmetic(ownerId, kind, cosmetic);
  } catch (error) {
    if (error instanceof CosmeticNotOwnedError) {
      return { ok: false, message: t("collection.wearRefused"), tokens: null };
    }
    throw error;
  }
  revalidatePath(`/saves/${id}`, "layout");
  return {
    ok: true,
    message: cosmetic === null ? t("collection.takenOff") : t("collection.wornDone", { name: t(`cosmetics.${cosmetic}.name`) }),
    tokens: null,
  };
}
