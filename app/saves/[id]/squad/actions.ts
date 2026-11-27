"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { requireOwnedSave } from "@/src/auth/current-user";
import { contractChoiceInputSchema, setContractChoice } from "@/src/db/contracts";
import { setYouthLaunch, youthLaunchInputSchema } from "@/src/db/youth-launches";
import {
  releasePlayer,
  releasePlayerSchema,
  renewContract,
  renewContractSchema,
  sellPlayer,
  sellPlayerSchema,
  type PlayerActionInput,
  type RenewContractInput,
} from "@/src/db/transfers";
import type { ContractChoice } from "@/src/engine/assistant-contracts";
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

/**
 * « Prolonger maintenant », in a transfer window: the length alone, the player extending at his own floor (renewalWage,
 * docs/design/simplification.md § 2.3); no screen sends a wage any more, and one sent is ignored.
 */
export async function renewContractAction(input: RenewContractInput): Promise<ActionResult> {
  const { t, tRefusals, locale } = await translators();
  const parsed = renewContractSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: t("invalid") };
  }
  const { saveId, playerSaveId, years } = parsed.data;
  await requireOwnedSave(saveId);
  const outcome = await renewContract({ saveId, playerSaveId, years });
  if (!outcome.ok) {
    return { ok: false, message: refusalMessage(outcome.reason, tRefusals, locale, outcome.refusals, { target: "squad" }) };
  }
  revalidatePath(`/saves/${saveId}`, "layout");
  return {
    ok: true,
    message: outcome.contractUntil === null ? t("renewedOpenEnded") : t("renewed", { until: formatDate(outcome.contractUntil, locale) }),
  };
}

/**
 * « À la fin de son contrat » on the sheet of a player of the managed club whose contract ends this season (§ 2.3): his
 * assistant decides (null), renew him, or let him go, at the season's turn. At any date, window open or closed; refused
 * for anyone else, a player of another club or a contract running past the season.
 */
export async function setContractChoiceAction(saveId: string, playerSaveId: string, choice: ContractChoice | null): Promise<ActionResult> {
  const { t } = await translators();
  const parsed = contractChoiceInputSchema.safeParse({ saveId, playerSaveId, choice });
  if (!parsed.success) {
    return { ok: false, message: t("choiceInvalid") };
  }
  await requireOwnedSave(parsed.data.saveId);
  const outcome = await setContractChoice(parsed.data);
  if (!outcome.ok) {
    return { ok: false, message: t("choiceRefused") };
  }
  // The squad's sheets and the dashboard's « À faire »: every screen of the save that tells what the turn will do.
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  const chosen = parsed.data.choice;
  return { ok: true, message: t(chosen !== null ? `choice.${chosen}` : outcome.byAssistant ? "choice.ASSISTANT" : "choice.DEFAULT") };
}

/**
 * « Le lancer » / « Ne plus le lancer » (docs/design/effectif-adjoint.md § 9), on the sheet of a young player of the managed
 * club or his line in the squad's « Jeunes » view: « Lancer les jeunes » brings him on when he does not start. At any
 * date; refused for a player who cannot be marked, and beyond three.
 */
export async function setYouthLaunchAction(saveId: string, playerSaveId: string, launch: boolean): Promise<ActionResult> {
  const t = await getTranslations("actions.youthLaunch");
  const parsed = youthLaunchInputSchema.safeParse({ saveId, playerSaveId, launch });
  if (!parsed.success) {
    return { ok: false, message: t("invalid") };
  }
  await requireOwnedSave(parsed.data.saveId);
  const outcome = await setYouthLaunch(parsed.data);
  if (!outcome.ok) {
    return { ok: false, message: t(outcome.reason === "full" ? "full" : "notEligible") };
  }
  // The squad, the sheets, the line-up's bench and Club → Réglages: every screen of the save that shows them.
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  return { ok: true, message: t(parsed.data.launch ? "launched" : "unlaunched") };
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
