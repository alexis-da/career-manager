import type { AccountStore } from "../auth/google";
import type { Prisma } from "../generated/prisma/client";

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
    createRegisteredUser: (data) => tx.user.create({ data: { ...data, kind: "REGISTERED" }, select: ACCOUNT_SELECT }),
    updateRegisteredUser: async (id, data) => {
      await tx.user.update({ where: { id }, data: { ...data, kind: "REGISTERED" } });
    },
    moveSaves: async (fromUserId, toUserId) =>
      (await tx.save.updateMany({ where: { ownerId: fromUserId }, data: { ownerId: toUserId } })).count,
    deleteUser: async (id) => {
      await tx.user.delete({ where: { id } });
    },
    claimInheritedSaves: async (toUserId) =>
      (await tx.save.updateMany({ where: { ownerId: null }, data: { ownerId: toUserId } })).count,
  };
}
