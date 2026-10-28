"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import * as z from "zod";
import {
  appPassword,
  createSessionValue,
  passwordMatches,
  safeNextPath,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/src/lib/auth";

export type LoginState = { error: string | null };

const loginSchema = z.object({
  password: z.string().max(500),
  next: z.string().max(2_000).nullable(),
});

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const password = appPassword();
  if (password === null) {
    redirect("/");
  }
  const parsed = loginSchema.safeParse({ password: formData.get("password"), next: formData.get("next") });
  if (!parsed.success || !passwordMatches(parsed.data.password, password)) {
    return { error: (await getTranslations("login"))("wrongPassword") };
  }
  (await cookies()).set(SESSION_COOKIE, createSessionValue(password, Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect(safeNextPath(parsed.data.next));
}
