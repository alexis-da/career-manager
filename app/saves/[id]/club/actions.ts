"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import {
  AssistantSettingsError,
  closeAssistantNotice,
  setContractsByAssistant,
  setLineupByAssistant,
} from "@/src/db/assistant-settings";
import type { ActionResult } from "../_lib/action-result";

// The assistant's settings of a career (docs/design/simplification.md § 2.3, § 3.3 and § 7): turned from Club → Réglages
// or from the line-up, and the announcement of them closed from the dashboard. Each checks the save's owner first.

const saveIdSchema = z.string().min(1);
const settingInputSchema = z.object({ setting: z.enum(["lineup", "contracts"]), byAssistant: z.boolean() });

export type AssistantSetting = z.infer<typeof settingInputSchema>["setting"];

/** « Composition » or « Contrats »: on, the assistant takes care of it; off, the player does. */
export async function setAssistantSettingAction(saveId: string, setting: AssistantSetting, byAssistant: boolean): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("assistantSettings");
  const parsed = settingInputSchema.safeParse({ setting, byAssistant });
  if (!parsed.success) {
    return { ok: false, message: t("refusals.invalid") };
  }
  try {
    const set = parsed.data.setting === "lineup" ? setLineupByAssistant : setContractsByAssistant;
    await set(id, parsed.data.byAssistant);
  } catch (error) {
    if (error instanceof AssistantSettingsError) {
      return { ok: false, message: t("refusals.live") };
    }
    throw error;
  }
  // The line-up, the dashboard's hero and « À faire », the settings: every screen of the save.
  revalidatePath(`/saves/${id}`, "layout");
  return { ok: true, message: t(`done.${parsed.data.setting}.${parsed.data.byAssistant ? "assistant" : "player"}`) };
}

/** « Compris » on the dashboard's announcement: it never comes back in this career. */
export async function closeAssistantNoticeAction(saveId: string): Promise<void> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  await closeAssistantNotice(id);
  revalidatePath(`/saves/${id}`);
}
