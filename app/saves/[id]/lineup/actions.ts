"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { lineupInputSchema, LineupPlayerNotInSquadError, saveManagedLineup } from "@/src/db/lineup";
import type { ActionResult } from "../_lib/action-result";

const saveIdSchema = z.string().min(1);

export async function saveLineupAction(saveId: string, input: unknown): Promise<ActionResult> {
  const id = saveIdSchema.parse(saveId);
  const parsed = lineupInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Composition invalide." };
  }
  try {
    await saveManagedLineup(id, parsed.data);
  } catch (error) {
    if (error instanceof LineupPlayerNotInSquadError) {
      return { ok: false, message: "Un joueur de la composition ne fait plus partie de l'effectif. Rechargez la page." };
    }
    throw error;
  }
  revalidatePath(`/saves/${id}`, "layout");
  return { ok: true, message: `Composition en ${parsed.data.formation} enregistrée.` };
}
