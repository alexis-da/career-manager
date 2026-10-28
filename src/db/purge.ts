import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { purgeCutoffs } from "../lib/maintenance";

// The daily purge, run by .github/workflows/maintenance.yml through app/api/maintenance/purge/route.ts. The anonymous
// users first, the only automatic deletion of users: a REGISTERED user is never touched, and deleting a user deletes
// their saves by cascade. Then the weekly challenge's saves once their challenge is over, whoever owns them: the only
// automatic deletion of a Google account's saves. By batches: a save may hold tens of thousands of rows, and a call
// must end within its time.

/** The most users one call deletes: the workflow calls again while some remain. */
export const PURGE_BATCH_SIZE = 25;

/** The most challenge saves one call deletes, after its users: each is a whole worldVersion 2 save. */
export const CHALLENGE_SAVE_PURGE_BATCH_SIZE = 10;

export type PurgeResult = {
  dryRun: boolean;
  inactive: number; // of this batch: anonymous users not seen for 30 days, with their saves
  empty: number; // of this batch: anonymous users without a save, not seen for 24 hours
  total: number; // this batch: deleted, or in dry run what would be
  remaining: number; // still to purge after this batch
};

/**
 * Deletes, or with dryRun only counts, one batch of the anonymous users the purge removes at this time, those seen
 * longest ago first. lastSeenAt is refreshed on a user's first request of each UTC day (src/auth/identity.ts), so a
 * user seen in the last 24 hours always has a lastSeenAt within them.
 */
export async function purgeAnonymousUsers(
  db: PrismaClient | Prisma.TransactionClient,
  now: Date,
  { dryRun, batchSize = PURGE_BATCH_SIZE }: { dryRun: boolean; batchSize?: number },
): Promise<PurgeResult> {
  const { inactiveBefore, emptyBefore } = purgeCutoffs(now);
  const purgeable: Prisma.UserWhereInput = {
    kind: "ANONYMOUS",
    OR: [{ lastSeenAt: { lt: inactiveBefore } }, { lastSeenAt: { lt: emptyBefore }, saves: { none: {} } }],
  };
  // One after the other: db may be a transaction (the tests' rolled-back ones), whose queries share its connection.
  const batch = await db.user.findMany({
    where: purgeable,
    orderBy: [{ lastSeenAt: "asc" }, { id: "asc" }],
    take: batchSize,
    select: { id: true, lastSeenAt: true },
  });
  const purgeableCount = await db.user.count({ where: purgeable });
  if (!dryRun && batch.length > 0) {
    // The same conditions again: a user seen since the read is not deleted.
    await db.user.deleteMany({ where: { AND: [purgeable, { id: { in: batch.map((user) => user.id) } }] } });
  }
  const inactive = batch.filter((user) => user.lastSeenAt < inactiveBefore).length;
  return { dryRun, inactive, empty: batch.length - inactive, total: batch.length, remaining: purgeableCount - batch.length };
}

export type ChallengeSavePurgeResult = {
  dryRun: boolean;
  total: number; // this batch: deleted, or in dry run what would be
  remaining: number; // still to purge after this batch
};

/**
 * Deletes, or with dryRun only counts, one batch of the weekly challenge's saves whose challenge ended more than
 * CHALLENGE_SAVE_RETENTION_HOURS ago (from the Tuesday after the challenge's week), whoever owns them, a Google account
 * included; the oldest challenges first. Their entries stay, without their save: the rankings outlive them.
 */
export async function purgeChallengeSaves(
  db: PrismaClient | Prisma.TransactionClient,
  now: Date,
  { dryRun, batchSize = CHALLENGE_SAVE_PURGE_BATCH_SIZE }: { dryRun: boolean; batchSize?: number },
): Promise<ChallengeSavePurgeResult> {
  const purgeable: Prisma.SaveWhereInput = { challenge: { is: { endsAt: { lt: purgeCutoffs(now).challengeEndedBefore } } } };
  // One after the other, as for the users.
  const batch = await db.save.findMany({
    where: purgeable,
    orderBy: [{ challenge: { endsAt: "asc" } }, { id: "asc" }],
    take: batchSize,
    select: { id: true },
  });
  const purgeableCount = await db.save.count({ where: purgeable });
  if (!dryRun && batch.length > 0) {
    await db.save.deleteMany({ where: { AND: [purgeable, { id: { in: batch.map((save) => save.id) } }] } });
  }
  return { dryRun, total: batch.length, remaining: purgeableCount - batch.length };
}
