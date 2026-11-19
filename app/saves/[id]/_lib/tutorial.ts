import "server-only";
import { cache } from "react";
import { requireOwnedSave } from "@/src/auth/current-user";
import { prisma } from "@/src/db/client";
import { readTutorial } from "@/src/db/tutorial";
import type { TutorialProgress } from "@/src/lib/tutorial";

/**
 * The tutorial a save follows (src/db/tutorial.ts), once per request: its owner's, read by its key, after the access
 * check; null for any other save, a challenge save among them.
 */
export const getSaveTutorial = cache(async (saveId: string): Promise<TutorialProgress | null> => {
  const { ownerId } = await requireOwnedSave(saveId);
  return readTutorial(prisma, ownerId, saveId);
});
