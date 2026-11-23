import "server-only";
import { cache } from "react";
import { requireOwnedSave } from "@/src/auth/current-user";
import { prisma } from "@/src/db/client";
import type { SaveHeader } from "@/src/db/header";
import { readTutorial } from "@/src/db/tutorial";
import { cupDates } from "@/src/engine/cup";
import { europeDates } from "@/src/engine/europe";
import { breakWindows } from "@/src/engine/schedule";
import type { TutorialMoments, TutorialProgress } from "@/src/lib/tutorial";

/**
 * The tutorial a save follows (src/db/tutorial.ts), once per request: its owner's, read by its key, after the access
 * check; null for any other save, a challenge save among them.
 */
export const getSaveTutorial = cache(async (saveId: string): Promise<TutorialProgress | null> => {
  const { ownerId } = await requireOwnedSave(saveId);
  return readTutorial(prisma, ownerId, saveId);
});

/**
 * The season's moments after which a tab the tutorial hides comes by itself (docs/design/tutoriel.md § 2): its first
 * international break over, its first European matchday, its cup's round of 32 (the first round every club plays); a
 * moment the save does not have is as good as passed. Its season's dates, with its breaks for a save with national teams.
 */
export function tutorialMoments({ currentDate, startYear, hasNations, hasEurope, hasCup }: SaveHeader): TutorialMoments {
  const firstBreak = breakWindows(startYear)[0];
  const firstEurope = europeDates(startYear, hasNations)[0];
  const cupRoundOf32 = cupDates(startYear, hasNations)[1];
  return {
    breakPassed: !hasNations || firstBreak === undefined || currentDate > firstBreak.dates[1],
    europePassed: !hasEurope || firstEurope === undefined || currentDate > firstEurope,
    cupPassed: !hasCup || cupRoundOf32 === undefined || currentDate > cupRoundOf32,
  };
}
