import type { Prisma, PrismaClient } from "../generated/prisma/client";

// A player's first steps, on their user: the first career they create (User.firstSaveAt), the first match a club they
// manage plays, live or simulated (firstMatchAt), the first one it plays live to its end (firstLiveMatchAt), the first
// season they play to its last match (firstSeasonEndAt). Each written once, in the transaction that takes the step, at the
// database's clock: never the simulation's, and a later step changes nothing. Kept on the user rather than deduced from
// their saves: a save goes (deleted by its player, a challenge's purged every week), and no table of a save dates a match
// in real time, nor says it was played live. One statement each.

type Db = PrismaClient | Prisma.TransactionClient;

/** The creation of a career, the owner's first one or not. */
export async function recordFirstSave(db: Db, ownerId: string): Promise<void> {
  await db.$executeRaw`UPDATE "User" SET "firstSaveAt" = now() WHERE "id" = ${ownerId} AND "firstSaveAt" IS NULL`;
}

/** A match of the save's managed club played to its end, live (advanceLiveMatch) or simulated: the first live one too. */
export async function recordFirstMatch(db: Db, saveId: string, { live }: { live: boolean }): Promise<void> {
  if (live) {
    await db.$executeRaw`
      UPDATE "User" u
      SET "firstMatchAt" = coalesce(u."firstMatchAt", now()), "firstLiveMatchAt" = coalesce(u."firstLiveMatchAt", now())
      FROM "Save" s
      WHERE s."id" = ${saveId} AND u."id" = s."ownerId" AND (u."firstMatchAt" IS NULL OR u."firstLiveMatchAt" IS NULL)`;
    return;
  }
  await db.$executeRaw`
    UPDATE "User" u SET "firstMatchAt" = now()
    FROM "Save" s
    WHERE s."id" = ${saveId} AND u."id" = s."ownerId" AND u."firstMatchAt" IS NULL`;
}

/**
 * After matches of the save are played: its season over once no fixture is left to play, every competition's (the
 * next season's fixtures only come with advanceToNextSeason, a cup's next round in the transaction that ends the last).
 */
export async function recordFirstSeasonEnd(db: Db, saveId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "User" u SET "firstSeasonEndAt" = now()
    FROM "Save" s
    WHERE s."id" = ${saveId} AND u."id" = s."ownerId" AND u."firstSeasonEndAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "Fixture" f WHERE f."saveId" = ${saveId} AND NOT f."played")`;
}
