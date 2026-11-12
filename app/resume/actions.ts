"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import * as z from "zod";
import { adoptAnonymousUser } from "@/src/auth/current-user";
import { prisma } from "@/src/db/client";
import { consumeResumeLink, lastCareerOf, readResumeLink } from "@/src/db/resume-links";
import { publicPath } from "@/src/i18n/public-pages";
import { RESUME_TOKEN_PATTERN, resumeViewOf, type ResumeView } from "@/src/lib/resume-link";
import { currentResumeViewer } from "./_lib/viewer";

/** Why the button did not open the careers: the page then says it, as it would have on opening. */
export type ResumeActionState = { refused: Exclude<ResumeView, "ready"> | null };

const tokenSchema = z.string().regex(RESUME_TOKEN_PATTERN);

/** Where a player's careers open: their last played, else the home page that lists them. */
async function careersPath(userId: string): Promise<string> {
  const saveId = await lastCareerOf(prisma, userId);
  return saveId === null ? publicPath("home", await getLocale()) : `/saves/${saveId}`;
}

/**
 * « Reprendre ma carrière », the only way a resume link is spent (src/db/resume-links.ts): this browser becomes the
 * link's anonymous player (their lw_uid cookie), then opens their last career. Nothing is spent or replaced when the
 * browser is signed in with Google or has a career of its own, or when the link is no longer good; a browser that already
 * has the careers opens them, the link unspent.
 */
export async function resumeCareerAction(_previous: ResumeActionState, formData: FormData): Promise<ResumeActionState> {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) {
    return { refused: "unknown" };
  }
  // Not simulation code: a link's time is real time.
  const now = new Date();
  const [link, viewer] = await Promise.all([readResumeLink(prisma, token.data, now), currentResumeViewer()]);
  const view = resumeViewOf(link, viewer);
  if (view === "here" && viewer !== null) {
    redirect(await careersPath(viewer.id));
  }
  if (view !== "ready") {
    return { refused: view };
  }
  const userId = await consumeResumeLink(prisma, token.data, now);
  if (userId === null) {
    // Spent or out of date since the page was read: by another browser, or a second press.
    return { refused: "used" };
  }
  await adoptAnonymousUser(userId);
  redirect(await careersPath(userId));
}
