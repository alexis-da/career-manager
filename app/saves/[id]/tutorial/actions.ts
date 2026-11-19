"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import { prisma } from "@/src/db/client";
import { managedMatchesPlayed } from "@/src/db/first-steps";
import { recordTutorialEvents, resumeTutorial, skipTutorial } from "@/src/db/tutorial";
import { TUTORIAL_EVENTS, TUTORIAL_STEPS, type TutorialEvent } from "@/src/lib/tutorial";

// The tutorial's actions (docs/design/tutoriel.md): a bubble shown or closed, the tutorial passed or taken up again. Each
// checks the save's owner first, validates what the browser sends, and writes only the owner's own tutorial, the one
// this save follows (src/db/tutorial.ts). Never a part of the game: a failure costs a count, never a match.

const saveIdSchema = z.string().min(1);
const stepSchema = z.enum(TUTORIAL_STEPS);
const eventsSchema = z.array(z.object({ step: stepSchema, event: z.enum(TUTORIAL_EVENTS) })).max(8);

/** The events of a screen's bubbles and lines: shown, done, passed, made another way; with what the tutorial closes itself. */
export async function tutorialStepAction(saveId: string, events: TutorialEvent[]): Promise<void> {
  const { id, ownerId } = await requireOwnedSave(saveIdSchema.parse(saveId));
  if (ownerId === null) {
    return;
  }
  // Not simulation code: the tutorial's days are real time.
  await recordTutorialEvents(prisma, {
    userId: ownerId,
    saveId: id,
    events: eventsSchema.parse(events),
    now: new Date(),
    matchesPlayed: await managedMatchesPlayed(id, 1),
  });
}

/** « Passer le tutoriel », from the step it was shown at: every screen of the save shows everything at once. */
export async function skipTutorialAction(saveId: string, step: string | null): Promise<void> {
  const { id, ownerId } = await requireOwnedSave(saveIdSchema.parse(saveId));
  if (ownerId === null) {
    return;
  }
  await skipTutorial(prisma, ownerId, id, step === null ? null : stepSchema.parse(step));
  revalidatePath(`/saves/${id}`, "layout");
}

/** « Reprendre le tutoriel », from Club → Réglages: whether there was anything left to show. */
export async function resumeTutorialAction(saveId: string): Promise<boolean> {
  const { id, ownerId } = await requireOwnedSave(saveIdSchema.parse(saveId));
  if (ownerId === null) {
    return false;
  }
  // Not simulation code: the tutorial's days are real time.
  const resumed = await resumeTutorial(prisma, ownerId, id, { now: new Date(), matchesPlayed: await managedMatchesPlayed(id, 1) });
  revalidatePath(`/saves/${id}`, "layout");
  return resumed;
}
