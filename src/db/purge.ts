import { Prisma, type PrismaClient } from "../generated/prisma/client";
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

/** What each rule of the anonymous users' purge removes: users, and the saves that go with them. */
export type PurgeRuleCounts = {
  inactive: { users: number; saves: number }; // not seen for 30 days
  oneDay: { users: number; saves: number }; // seen only on the day they were created, not seen for 14 days
  empty: { users: number }; // without a save, not seen for 24 hours
};

export type PurgeResult = {
  dryRun: boolean;
  oneDayRule: boolean; // whether the one-day users go after 14 days, not 30 (?oneDay=1)
  inactive: number; // of this batch: anonymous users not seen for 30 days, with their saves
  oneDay: number; // of this batch: anonymous users seen only on the day they were created, not seen for 14 days
  empty: number; // of this batch: anonymous users without a save, not seen for 24 hours
  total: number; // this batch: deleted, or in dry run what would be
  saves: number; // the saves of this batch's users, which go with them
  oneDaySaves: number; // of them, the one-day users'
  remaining: number; // still to purge after this batch
  byRule: PurgeRuleCounts; // everything each rule removes at this time, before this batch; the 14-day one even when off
};

/** A user of a batch, with the rule that removes them. */
type BatchRow = { id: string; inactive: boolean; oneDay: boolean; saves: number };

/**
 * Deletes, or with dryRun only counts, one batch of the anonymous users the purge removes at this time, those seen
 * longest ago first: not seen for 30 days; with oneDayRule, seen only on the day they were created (a career never
 * resumed) and not seen for 14 days; without a save and not seen for 24 hours. Each user is counted under the first of
 * those rules they meet. lastSeenAt is refreshed on a user's first request of each UTC day (src/auth/identity.ts): a user
 * seen in the last 24 hours always has a lastSeenAt within them, and one who came back another day has a lastSeenAt on
 * a later day than their creation. In SQL, the one-day rule comparing two days of a row, which Prisma's filters cannot;
 * the times as UTC wall-clock text, as the columns hold them.
 */
export async function purgeAnonymousUsers(
  db: PrismaClient | Prisma.TransactionClient,
  now: Date,
  { dryRun, oneDayRule = false, batchSize = PURGE_BATCH_SIZE }: { dryRun: boolean; oneDayRule?: boolean; batchSize?: number },
): Promise<PurgeResult> {
  const { inactiveBefore, oneDayBefore, emptyBefore } = purgeCutoffs(now);
  const at = (time: Date) => Prisma.sql`${time.toISOString()}::timestamp(3)`;
  const inactive = Prisma.sql`u."lastSeenAt" < ${at(inactiveBefore)}`;
  const oneDay = Prisma.sql`(u."lastSeenAt" < ${at(oneDayBefore)} AND u."lastSeenAt"::date = u."createdAt"::date)`;
  const empty = Prisma.sql`(u."lastSeenAt" < ${at(emptyBefore)} AND NOT EXISTS (SELECT 1 FROM "Save" s WHERE s."ownerId" = u."id"))`;
  const purgeable = Prisma.sql`u."kind" = 'ANONYMOUS' AND (${inactive} OR ${oneDayRule ? oneDay : Prisma.sql`false`} OR ${empty})`;
  const savesOf = Prisma.sql`(SELECT count(*) FROM "Save" s WHERE s."ownerId" = u."id")::int`;

  // One after the other: db may be a transaction (the tests' rolled-back ones), whose queries share its connection.
  // The saves read before they go, with their users: what /admin shows of the purge.
  const batch = await db.$queryRaw<BatchRow[]>`
    SELECT u."id", (${inactive}) AS "inactive", (${oneDay}) AS "oneDay", ${savesOf} AS "saves"
    FROM "User" u
    WHERE ${purgeable}
    ORDER BY u."lastSeenAt" ASC, u."id" ASC
    LIMIT ${batchSize}`;
  const [{ purgeableCount }] = await db.$queryRaw<{ purgeableCount: number }[]>`
    SELECT count(*)::int AS "purgeableCount" FROM "User" u WHERE ${purgeable}`;
  const [byRule] = await db.$queryRaw<
    { inactiveUsers: number; inactiveSaves: number; oneDayUsers: number; oneDaySaves: number; emptyUsers: number }[]
  >`
    SELECT count(*) FILTER (WHERE ${inactive})::int AS "inactiveUsers",
           coalesce(sum(u."saves") FILTER (WHERE ${inactive}), 0)::int AS "inactiveSaves",
           count(*) FILTER (WHERE NOT ${inactive} AND ${oneDay})::int AS "oneDayUsers",
           coalesce(sum(u."saves") FILTER (WHERE NOT ${inactive} AND ${oneDay}), 0)::int AS "oneDaySaves",
           count(*) FILTER (WHERE NOT ${inactive} AND NOT ${oneDay} AND ${empty})::int AS "emptyUsers"
    FROM (SELECT u.*, ${savesOf} AS "saves" FROM "User" u WHERE u."kind" = 'ANONYMOUS') u`;
  if (!dryRun && batch.length > 0) {
    // The same conditions again: a user seen since the read is not deleted.
    await db.$executeRaw`DELETE FROM "User" u WHERE u."id" = ANY(${batch.map((user) => user.id)}::text[]) AND ${purgeable}`;
  }

  const ruleOf = (user: BatchRow) => (user.inactive ? "inactive" : oneDayRule && user.oneDay ? "oneDay" : "empty");
  const oneDayUsers = batch.filter((user) => ruleOf(user) === "oneDay");
  return {
    dryRun,
    oneDayRule,
    inactive: batch.filter((user) => ruleOf(user) === "inactive").length,
    oneDay: oneDayUsers.length,
    empty: batch.filter((user) => ruleOf(user) === "empty").length,
    total: batch.length,
    saves: batch.reduce((sum, user) => sum + user.saves, 0),
    oneDaySaves: oneDayUsers.reduce((sum, user) => sum + user.saves, 0),
    remaining: purgeableCount - batch.length,
    byRule: {
      inactive: { users: byRule.inactiveUsers, saves: byRule.inactiveSaves },
      oneDay: { users: byRule.oneDayUsers, saves: byRule.oneDaySaves },
      empty: { users: byRule.emptyUsers },
    },
  };
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
