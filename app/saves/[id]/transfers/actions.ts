"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getOfferFacts } from "@/src/db/market";
import {
  makeTransferOffer,
  makeTransferOfferSchema,
  signFreeAgent,
  signFreeAgentSchema,
  type MakeTransferOfferInput,
  type SignFreeAgentInput,
  type TransferOutcome,
} from "@/src/db/transfers";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatDate, formatMoney } from "@/src/lib/format";
import type { ActionResult } from "../_lib/action-result";
import { refusalMessage } from "../_lib/refusal-message";

type Refused = Extract<TransferOutcome, { ok: false }>;

/** The texts of these actions in the player's language: confirmations, and the reasons of a refusal. */
async function translators() {
  const [t, tRefusals, locale] = await Promise.all([
    getTranslations("actions.market"),
    getTranslations("refusals"),
    getLocale(),
  ]);
  return { t, tRefusals, locale };
}

/** The refusal with the figures behind it: budget, the selling club's price or a free agent's signing bonus. */
async function explainRefusal(
  outcome: Refused,
  offer: { saveId: string; playerSaveId: string; fee?: number },
  t: Translator<"refusals">,
  locale: Locale,
): Promise<ActionResult> {
  const facts = await getOfferFacts(offer.saveId, offer.playerSaveId);
  return {
    ok: false,
    message: refusalMessage(outcome.reason, t, locale, outcome.refusals, {
      target: "market",
      fee: offer.fee,
      // A free agent's price is his signing bonus (TransferQuote.askingPrice).
      bonus: facts.clubName === null ? facts.quote.askingPrice : undefined,
      budget: facts.budget,
      clubName: facts.clubName ?? undefined,
      askingPrice: facts.quote.askingPrice,
      minimumWage: facts.quote.minimumWage,
      nextWindowOpensOn: facts.nextWindowOpensOn,
    }),
  };
}

export async function signFreeAgentAction(input: SignFreeAgentInput): Promise<ActionResult> {
  const { t, tRefusals, locale } = await translators();
  const parsed = signFreeAgentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: t("invalid") };
  }
  await requireOwnedSave(parsed.data.saveId);
  const outcome = await signFreeAgent(parsed.data);
  if (!outcome.ok) {
    return explainRefusal(outcome, parsed.data, tRefusals, locale);
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  const wage = formatMoney(outcome.wage, locale);
  return {
    ok: true,
    message:
      outcome.contractUntil === null
        ? t("signedOpenEnded", { wage })
        : t("signed", { until: formatDate(outcome.contractUntil, locale), wage }),
  };
}

export async function makeTransferOfferAction(input: MakeTransferOfferInput): Promise<ActionResult> {
  const { t, tRefusals, locale } = await translators();
  const parsed = makeTransferOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: t("invalid") };
  }
  await requireOwnedSave(parsed.data.saveId);
  const outcome = await makeTransferOffer(parsed.data);
  if (!outcome.ok) {
    return explainRefusal(outcome, parsed.data, tRefusals, locale);
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  const fee = formatMoney(outcome.fee, locale);
  const wage = formatMoney(outcome.wage, locale);
  return {
    ok: true,
    message:
      outcome.contractUntil === null
        ? t("offerAcceptedOpenEnded", { fee, wage })
        : t("offerAccepted", { fee, until: formatDate(outcome.contractUntil, locale), wage }),
  };
}
