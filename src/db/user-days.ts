import type { Prisma, PrismaClient } from "../generated/prisma/client";

/** The UTC day of a time, as YYYY-MM-DD: the day a UserDay records. */
export const utcDayOf = (time: Date): string => time.toISOString().slice(0, 10);

/**
 * Records that a user came on the day of this time: written where lastSeenAt is, so at most once a day per user.
 * INSERT … ON CONFLICT DO NOTHING: a second call the same day, or two requests at once, change nothing.
 */
export async function recordUserDay(db: PrismaClient | Prisma.TransactionClient, userId: string, now: Date): Promise<void> {
  await db.$executeRaw`INSERT INTO "UserDay" ("userId", "day") VALUES (${userId}, ${utcDayOf(now)}::date) ON CONFLICT DO NOTHING`;
}
