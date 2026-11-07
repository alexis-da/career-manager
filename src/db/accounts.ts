import type { AccountStore } from "../auth/google";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./client";
import { recordUserDay } from "./user-days";

const ACCOUNT_SELECT = { id: true, kind: true } as const;

/**
 * The users and saves a Google sign-in touches (src/auth/google.ts), on a transaction's client: the sign-in either
 * happens whole or not at all. Moving saves between owners is the one cross-save write: by owner, never by saveId.
 */
export function prismaAccountStore(tx: Prisma.TransactionClient): AccountStore {
  return {
    findUserById: (id) => tx.user.findUnique({ where: { id }, select: ACCOUNT_SELECT }),
    findUserByGoogleSub: (googleSub) => tx.user.findUnique({ where: { googleSub }, select: ACCOUNT_SELECT }),
    findUserByEmail: (email) => tx.user.findUnique({ where: { email }, select: ACCOUNT_SELECT }),
    // Both write lastSeenAt, so the day's UserDay too.
    createRegisteredUser: async (data, acquisition) => {
      const user = await tx.user.create({ data: { ...data, ...acquisition, kind: "REGISTERED" }, select: ACCOUNT_SELECT });
      await recordUserDay(tx, user.id, data.lastSeenAt);
      return user;
    },
    updateRegisteredUser: async (id, data) => {
      await tx.user.update({ where: { id }, data: { ...data, kind: "REGISTERED" } });
      await recordUserDay(tx, id, data.lastSeenAt);
    },
    moveSaves: async (fromUserId, toUserId) =>
      (await tx.save.updateMany({ where: { ownerId: fromUserId }, data: { ownerId: toUserId } })).count,
    // The other user's entry of a week first, or moving would break the one entry a user a week.
    moveChallengeEntries: async (fromUserId, toUserId) => {
      const dropped = await tx.challengeEntry.deleteMany({
        where: { userId: fromUserId, challenge: { entries: { some: { userId: toUserId } } } },
      });
      const moved = await tx.challengeEntry.updateMany({ where: { userId: fromUserId }, data: { userId: toUserId } });
      return { moved: moved.count, dropped: dropped.count };
    },
    // The account's own days stay: a day both came is one day. Of each first step, the earliest of both (LEAST leaves
    // out a null).
    moveHistory: async (fromUserId, toUserId, { arrival }) => {
      await tx.$executeRaw`
        INSERT INTO "UserDay" ("userId", "day")
        SELECT ${toUserId}, "day" FROM "UserDay" WHERE "userId" = ${fromUserId}
        ON CONFLICT DO NOTHING`;
      await tx.$executeRaw`
        UPDATE "User" AS account
        SET "firstSaveAt" = LEAST(account."firstSaveAt", anonymous."firstSaveAt"),
            "firstMatchAt" = LEAST(account."firstMatchAt", anonymous."firstMatchAt"),
            "firstSeasonEndAt" = LEAST(account."firstSeasonEndAt", anonymous."firstSeasonEndAt")
        FROM "User" AS anonymous
        WHERE account."id" = ${toUserId} AND anonymous."id" = ${fromUserId}`;
      if (arrival) {
        await tx.$executeRaw`
          UPDATE "User" AS account
          SET "createdAt" = LEAST(account."createdAt", anonymous."createdAt"),
              "source" = anonymous."source",
              "referrerDomain" = anonymous."referrerDomain",
              "landingPage" = anonymous."landingPage",
              "locale" = anonymous."locale",
              "device" = anonymous."device"
          FROM "User" AS anonymous
          WHERE account."id" = ${toUserId} AND anonymous."id" = ${fromUserId}`;
      }
    },
    deleteUser: async (id) => {
      await tx.user.delete({ where: { id } });
    },
    claimInheritedSaves: async (toUserId) =>
      (await tx.save.updateMany({ where: { ownerId: null }, data: { ownerId: toUserId } })).count,
  };
}

/**
 * A player's deletion of their own Google account: the user goes, and their saves with them by cascade. Only a
 * REGISTERED user: an anonymous player deletes their save instead, and the purge does the rest. Whether a user was
 * deleted.
 */
export async function deleteRegisteredUser(userId: string): Promise<boolean> {
  const { count } = await prisma.user.deleteMany({ where: { id: userId, kind: "REGISTERED" } });
  return count === 1;
}
