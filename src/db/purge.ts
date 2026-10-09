import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { purgeCutoffs } from "../lib/maintenance";

// The purge of anonymous users, the only automatic deletion of users: run daily by .github/workflows/maintenance.yml
// through app/api/maintenance/purge/route.ts. A REGISTERED user is never touched. Deleting a user deletes their saves
// by cascade. By batches: a user's saves may hold tens of thousands of rows, and a call must end within its time.

/** The most users one call deletes: the workflow calls again while some remain. */
export const PURGE_BATCH_SIZE = 25;

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
  const [batch, purgeableCount] = await Promise.all([
    db.user.findMany({
      where: purgeable,
      orderBy: [{ lastSeenAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: { id: true, lastSeenAt: true },
    }),
    db.user.count({ where: purgeable }),
  ]);
  if (!dryRun && batch.length > 0) {
    // The same conditions again: a user seen since the read is not deleted.
    await db.user.deleteMany({ where: { AND: [purgeable, { id: { in: batch.map((user) => user.id) } }] } });
  }
  const inactive = batch.filter((user) => user.lastSeenAt < inactiveBefore).length;
  return { dryRun, inactive, empty: batch.length - inactive, total: batch.length, remaining: purgeableCount - batch.length };
}
