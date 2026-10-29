"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { requireOwnedSave } from "@/src/auth/current-user";
import {
  quoteTransfer,
  releasePlayer,
  releasePlayerSchema,
  renewContract,
  renewContractSchema,
  sellPlayer,
  sellPlayerSchema,
  type PlayerActionInput,
  type RenewContractInput,
} from "@/src/db/transfers";
import { formatDate, formatMoney } from "@/src/lib/format";
import type { ActionResult } from "../_lib/action-result";
import { refusalMessage } from "../_lib/refusal-message";

/** The texts of these actions in the player's language: confirmations, and the reasons of a refusal. */
async function translators() {
  const [t, tRefusals, locale] = await Promise.all([
    getTranslations("actions.contracts"),
    getTranslations("refusals"),
    getLocale(),
  ]);
  return { t, tRefusals, locale };
}

export async function renewContractAction(input: RenewContractInput): Promise<ActionResult> {
  const { t, tRefusals, locale } = await translators();
  const parsed = renewContractSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: t("invalid") };
  }
  await requireOwnedSave(parsed.data.saveId);
  const outcome = await renewContract(parsed.data);
  if (!outcome.ok) {
    const minimumWage =
      outcome.reason === "player_refused" ? (await quoteTransfer(parsed.data)).minimumWage : undefined;
    return {
      ok: false,
      message: refusalMessage(outcome.reason, tRefusals, locale, outcome.refusals, { target: "squad", minimumWage }),
    };
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  const wage = formatMoney(parsed.data.wage, locale);
  return {
    ok: true,
    message:
      outcome.contractUntil === null
        ? t("renewedOpenEnded", { wage })
        : t("renewed", { until: formatDate(outcome.contractUntil, locale), wage }),
  };
}

export async function releasePlayerAction(input: PlayerActionInput): Promise<ActionResult> {
  const { t, tRefusals, locale } = await translators();
  const parsed = releasePlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: t("invalid") };
  }
  await requireOwnedSave(parsed.data.saveId);
  const outcome = await releasePlayer(parsed.data);
  if (!outcome.ok) {
    return { ok: false, message: refusalMessage(outcome.reason, tRefusals, locale, outcome.refusals, { target: "squad" }) };
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  return { ok: true, message: t("released", { fee: formatMoney(outcome.fee, locale) }) };
}

export async function sellPlayerAction(input: PlayerActionInput): Promise<ActionResult> {
  const { t, tRefusals, locale } = await translators();
  const parsed = sellPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: t("invalid") };
  }
  await requireOwnedSave(parsed.data.saveId);
  const outcome = await sellPlayer(parsed.data);
  if (!outcome.ok) {
    return { ok: false, message: refusalMessage(outcome.reason, tRefusals, locale, outcome.refusals, { target: "squad" }) };
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  return { ok: true, message: t("sold", { fee: formatMoney(outcome.fee, locale) }) };
}
