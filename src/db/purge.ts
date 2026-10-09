import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { purgeCutoffs } from "../lib/maintenance";

// The purge of anonymous users, the only automatic deletion of users: run daily by .github/workflows/maintenance.yml
// through app/api/maintenance/purge/route.ts. A REGISTERED user is never touched. Deleting a user deletes their saves
// by cascade.

export type PurgeResult = {
  dryRun: boolean;
  inactive: number; // anonymous users not seen for 30 days, with their saves
  empty: number; // anonymous users without a save, not seen for 24 hours (and not already counted as inactive)
  total: number;
};

/**
 * Deletes, or with dryRun only counts, the anonymous users the purge removes at this time. lastSeenAt is refreshed
 * whenever a user is recognised and it is a day old (src/auth/identity.ts), so a user seen in the last 24 hours always
 * has a lastSeenAt within them.
 */
export async function purgeAnonymousUsers(
  db: PrismaClient | Prisma.TransactionClient,
  now: Date,
  { dryRun }: { dryRun: boolean },
): Promise<PurgeResult> {
  const { inactiveBefore, emptyBefore } = purgeCutoffs(now);
  const inactive: Prisma.UserWhereInput = { kind: "ANONYMOUS", lastSeenAt: { lt: inactiveBefore } };
  const empty: Prisma.UserWhereInput = {
    kind: "ANONYMOUS",
    lastSeenAt: { gte: inactiveBefore, lt: emptyBefore },
    saves: { none: {} },
  };
  const [inactiveCount, emptyCount] = dryRun
    ? [await db.user.count({ where: inactive }), await db.user.count({ where: empty })]
    : [(await db.user.deleteMany({ where: inactive })).count, (await db.user.deleteMany({ where: empty })).count];
  return { dryRun, inactive: inactiveCount, empty: emptyCount, total: inactiveCount + emptyCount };
}
