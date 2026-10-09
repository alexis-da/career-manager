"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { signIn, signOut } from "@/src/auth/auth";
import { requireCurrentUser, requireOwnedSave } from "@/src/auth/current-user";
import { createSave, deleteSave } from "@/src/db/saves";
import { SaveLimitError } from "@/src/lib/limits";
import { SAVE_LIMIT_MESSAGES } from "./_components/save-limit-notice";

export type CreateSaveField = "name" | "managerName" | "clubId" | "seed";

export type CreateSaveFormState = {
  values: Record<CreateSaveField, string>; // what was submitted, shown again after a refusal
  errors: Partial<Record<CreateSaveField, string[]>>;
  message: string | null;
};

const createSaveFormSchema = z.object({
  name: z.string().trim().min(1, "Donnez un nom à la partie.").max(100, "100 caractères au plus."),
  managerName: z.string().trim().min(1, "Indiquez le nom du manager.").max(100, "100 caractères au plus."),
  clubId: z.string().min(1, "Choisissez un club."),
  seed: z.string().trim().max(200, "200 caractères au plus."),
});

const saveIdSchema = z.string().min(1);

const field = (formData: FormData, name: CreateSaveField): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function createSaveAction(_previous: CreateSaveFormState, formData: FormData): Promise<CreateSaveFormState> {
  const values = {
    name: field(formData, "name"),
    managerName: field(formData, "managerName"),
    clubId: field(formData, "clubId"),
    seed: field(formData, "seed"),
  };
  const parsed = createSaveFormSchema.safeParse(values);
  if (!parsed.success) {
    return { values, errors: z.flattenError(parsed.error).fieldErrors, message: null };
  }

  let saveId: string;
  try {
    // An empty seed gets a random one: the seed feeds the simulation, it is never drawn inside it.
    const seed = parsed.data.seed === "" ? randomUUID() : parsed.data.seed;
    // The player gets an anonymous identity, and its cookie, with their first save.
    const owner = await requireCurrentUser();
    ({ id: saveId } = await createSave({ ...parsed.data, seed, ownerId: owner.id }));
  } catch (error) {
    if (error instanceof SaveLimitError) {
      // The form is replaced by this message once the page knows; a creation from a page loaded earlier ends here.
      return { values, errors: {}, message: SAVE_LIMIT_MESSAGES[error.kind] };
    }
    console.error(error);
    return { values, errors: {}, message: "La partie n'a pas pu être créée. Réessayez." };
  }

  revalidatePath("/");
  redirect(`/saves/${saveId}`);
}

export async function deleteSaveAction(saveId: string): Promise<void> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  await deleteSave(id);
  revalidatePath("/");
}

/** Off to Google, then back to the home page: src/auth/auth.ts makes the account one of our users. */
export async function signInWithGoogleAction(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
