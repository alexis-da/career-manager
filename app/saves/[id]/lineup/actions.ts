"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import { lineupInputSchema, lineupIssueOf, LineupPlayerNotInSquadError, saveManagedLineup } from "@/src/db/lineup";
import type { ActionResult } from "../_lib/action-result";

const saveIdSchema = z.string().min(1);

export async function saveLineupAction(saveId: string, input: unknown): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("actions.lineup");
  const parsed = lineupInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = lineupIssueOf(parsed.error);
    return { ok: false, message: issue === null ? t("invalid") : t(`issues.${issue}`) };
  }
  try {
    await saveManagedLineup(id, parsed.data);
  } catch (error) {
    if (error instanceof LineupPlayerNotInSquadError) {
      return { ok: false, message: t("notInSquad") };
    }
    throw error;
  }
  revalidatePath(`/saves/${id}`, "layout");
  return { ok: true, message: t("saved", { formation: parsed.data.formation }) };
}
