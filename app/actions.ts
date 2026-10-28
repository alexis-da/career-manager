"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { cookies } from "next/headers";
import { signIn, signOut } from "@/src/auth/auth";
import { getCurrentUser, requireCurrentUser, requireOwnedSave } from "@/src/auth/current-user";
import { USER_COOKIE } from "@/src/auth/identity";
import { deleteRegisteredUser } from "@/src/db/accounts";
import { isWakeUpError, retryOnWakeUp } from "@/src/db/retry";
import { createSave, deleteSave } from "@/src/db/saves";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALES } from "@/src/i18n/locale";
import { describeError, phaseTimer } from "@/src/lib/diagnostics";
import { SaveLimitError } from "@/src/lib/limits";
import { SAVE_LIMIT_MESSAGES } from "./_components/save-limit-notice";
import { ACCOUNT_DELETED_PARAM } from "./_lib/account";

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
  const timer = phaseTimer();
  try {
    // An empty seed gets a random one: the seed feeds the simulation, it is never drawn inside it.
    const seed = parsed.data.seed === "" ? randomUUID() : parsed.data.seed;
    // The player gets an anonymous identity, and its cookie, with their first save.
    const owner = await requireCurrentUser();
    // A database waking up (P2028, P1001, P1017) gets one more try: the failed transaction was rolled back.
    ({ id: saveId } = await retryOnWakeUp(() => createSave({ ...parsed.data, seed, ownerId: owner.id }), {
      onRetry: (error) =>
        console.warn(`[createSaveAction] trying again after ${timer.elapsed()} ms: ${describeError(error)}`),
    }));
  } catch (error) {
    if (error instanceof SaveLimitError) {
      // The form is replaced by this message once the page knows; a creation from a page loaded earlier ends here.
      return { values, errors: {}, message: SAVE_LIMIT_MESSAGES[error.kind] };
    }
    // The real error, its code and the time spent, in one line the hosting logs keep; then the whole error.
    console.error(`[createSaveAction] failed after ${timer.elapsed()} ms: ${describeError(error)}`, error);
    const message = isWakeUpError(error)
      ? "Le serveur se réveille : réessaie dans quelques secondes."
      : "La partie n'a pas pu être créée. Réessayez.";
    return { values, errors: {}, message };
  }

  revalidatePath("/");
  redirect(`/saves/${saveId}`);
}

export async function deleteSaveAction(saveId: string): Promise<void> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  await deleteSave(id);
  revalidatePath("/");
}

const localeSchema = z.enum(LOCALES);

/**
 * The language switcher: the language the player chose, kept a year by the lw_lang comfort cookie (app/privacy), then
 * the page again in it. Anything but « fr » or « en » changes nothing.
 */
export async function setLanguageAction(formData: FormData): Promise<void> {
  const parsed = localeSchema.safeParse(formData.get("locale"));
  if (!parsed.success) {
    return;
  }
  (await cookies()).set(LOCALE_COOKIE, parsed.data, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
  });
  // Every page the browser keeps is in the other language now.
  revalidatePath("/", "layout");
}

/** Off to Google, then back to the home page: src/auth/auth.ts makes the account one of our users. */
export async function signInWithGoogleAction(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

/**
 * « Supprimer mon compte »: the signed-in player's user goes, their saves with them (src/db/accounts.ts); then signed
 * out, the lw_uid cookie cleared, back to the home page with a message. Nothing for an anonymous player.
 */
export async function deleteAccountAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user === null || user.kind !== "REGISTERED") {
    redirect("/");
  }
  await deleteRegisteredUser(user.id);
  (await cookies()).delete(USER_COOKIE);
  await signOut({ redirectTo: `/?${ACCOUNT_DELETED_PARAM}=1` });
}
