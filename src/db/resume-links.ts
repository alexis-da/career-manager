import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client";
import { RESUME_LINK_DAYS, RESUME_TOKEN_PATTERN, type ResumeLinkState } from "../lib/resume-link";

// Resume links: a player without a Google account who began a career in an app's browser (Instagram…), where Google does
// not sign in, takes their careers to the phone's browser. The link carries a token, 32 random bytes; the database keeps
// its SHA-256 only, with the user (ResumeLink), and the link opens that user's careers once, within RESUME_LINK_DAYS.
// Opening it reads (readResumeLink); only its page's button spends it (consumeResumeLink), so that a link's preview in a
// conversation never does. Never an account's: the lw_uid cookie names anonymous users only. Real time throughout: a
// link is the player's, not the game's.

/** Links a player may ask for in an hour: an in-app page asks for one as it opens, kept 30 minutes in the tab. */
export const RESUME_LINKS_PER_HOUR = 20;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** What the database keeps of a token: its SHA-256, in hexadecimal. */
export const resumeTokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

export type NewResumeLink =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; reason: "not-anonymous" | "no-career" | "limit" };

/**
 * A new link to a player's careers: an anonymous player's only, with a career at least, RESUME_LINKS_PER_HOUR an hour.
 * The others stay good: one copied a minute ago still opens.
 */
export async function createResumeLink(db: PrismaClient, userId: string, now: Date): Promise<NewResumeLink> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { kind: true, _count: { select: { saves: true } } } });
  if (user === null || user.kind !== "ANONYMOUS") {
    return { ok: false, reason: "not-anonymous" };
  }
  if (user._count.saves === 0) {
    return { ok: false, reason: "no-career" };
  }
  const recent = await db.resumeLink.count({ where: { userId, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } } });
  if (recent >= RESUME_LINKS_PER_HOUR) {
    return { ok: false, reason: "limit" };
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + RESUME_LINK_DAYS * DAY_MS);
  await db.resumeLink.create({ data: { userId, tokenHash: resumeTokenHash(token), createdAt: now, expiresAt }, select: { id: true } });
  return { ok: true, token, expiresAt };
}

/** Where a link stands, read only: opening its page spends nothing. A token of another shape is no link. */
export async function readResumeLink(db: PrismaClient, token: string, now: Date): Promise<ResumeLinkState> {
  if (!RESUME_TOKEN_PATTERN.test(token)) {
    return { status: "unknown" };
  }
  const link = await db.resumeLink.findUnique({
    where: { tokenHash: resumeTokenHash(token) },
    select: { userId: true, expiresAt: true, usedAt: true },
  });
  if (link === null) {
    return { status: "unknown" };
  }
  if (link.usedAt !== null) {
    return { status: "used", userId: link.userId };
  }
  return link.expiresAt <= now ? { status: "expired", userId: link.userId } : { status: "valid", userId: link.userId, expiresAt: link.expiresAt };
}

/**
 * Spends a link, once: the user whose careers it opens, or null when it is unknown, spent or out of date, or no longer an
 * anonymous player's. One UPDATE … WHERE "usedAt" IS NULL: of two browsers at once, only one gets the user.
 */
export async function consumeResumeLink(db: PrismaClient, token: string, now: Date): Promise<string | null> {
  if (!RESUME_TOKEN_PATTERN.test(token)) {
    return null;
  }
  const tokenHash = resumeTokenHash(token);
  const { count } = await db.resumeLink.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count === 0) {
    return null;
  }
  const { user } = await db.resumeLink.findUniqueOrThrow({ where: { tokenHash }, select: { user: { select: { id: true, kind: true } } } });
  return user.kind === "ANONYMOUS" ? user.id : null;
}

/** The career a link leads to: the player's last played, or null without one (the home page lists them then). */
export async function lastCareerOf(db: PrismaClient, userId: string): Promise<string | null> {
  const save = await db.save.findFirst({ where: { ownerId: userId }, orderBy: { updatedAt: "desc" }, select: { id: true } });
  return save?.id ?? null;
}
