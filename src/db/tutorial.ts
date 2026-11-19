import { z } from "zod";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import {
  canResume,
  isClosed,
  LIVE_STEPS,
  pendingWrites,
  scenarioSteps,
  STEP_OUTCOMES,
  stepsToReopen,
  TUTORIAL_ENDINGS,
  TUTORIAL_SINCE,
  TUTORIAL_STEPS,
  TUTORIAL_VERSION,
  tutorialStatus,
  type StepOutcome,
  type TutorialContext,
  type TutorialEnding,
  type TutorialEvent,
  type TutorialEventKind,
  type TutorialProgress,
  type TutorialStepKey,
} from "../lib/tutorial";

// A player's first-career tutorial (docs/design/tutoriel.md, src/lib/tutorial.ts): its row, born with their first career
// outside the challenge, and its steps, each written when a bubble shows and when it closes. One read by the player's key
// a request, never a table of the game; never a write inside a match's transaction. Dates at the database's clock.

type Db = PrismaClient | Prisma.TransactionClient;

const stepSchema = z.enum(TUTORIAL_STEPS);
const outcomeSchema = z.enum(STEP_OUTCOMES);
const endingSchema = z.enum(TUTORIAL_ENDINGS);

const OUTCOME_OF = { done: "DONE", pass: "PASSED", adapt: "ADAPTED" } as const satisfies Record<Exclude<TutorialEventKind, "show">, StepOutcome>;

const TUTORIAL_SELECT = {
  saveId: true,
  version: true,
  startedAt: true,
  day1At: true,
  skippedAt: true,
  resumedAt: true,
  endedBy: true,
  steps: { select: { step: true, shows: true, outcome: true } },
} as const;

type TutorialRow = Prisma.TutorialGetPayload<{ select: typeof TUTORIAL_SELECT }>;

/** A row as the rules read it: a step of a later scenario that this code does not know is left out. */
function progressOf(row: TutorialRow): TutorialProgress {
  const steps: TutorialProgress["steps"] = {};
  for (const { step, shows, outcome } of row.steps) {
    const key = stepSchema.safeParse(step);
    if (key.success) {
      steps[key.data] = { shows, outcome: outcome === null ? null : outcomeSchema.parse(outcome) };
    }
  }
  return {
    version: row.version,
    startedAt: row.startedAt,
    day1At: row.day1At,
    skippedAt: row.skippedAt,
    resumedAt: row.resumedAt,
    endedBy: row.endedBy === null ? null : endingSchema.parse(row.endedBy),
    steps,
  };
}

/**
 * The tutorial a save follows: its owner's, read by its key, when it follows this save; null for any other save, one
 * without an owner, and every challenge save (none ever follows one).
 */
export async function readTutorial(db: Db, ownerId: string | null, saveId: string): Promise<TutorialProgress | null> {
  if (ownerId === null) {
    return null;
  }
  const row = await db.tutorial.findUnique({ where: { userId: ownerId }, select: TUTORIAL_SELECT });
  return row === null || row.saveId !== saveId ? null : progressOf(row);
}

/**
 * In the transaction creating a career outside the challenge (createSave with `tutorial`, from createSaveAction alone), the
 * player's tutorial: a tutorial whose career was deleted before its end follows this one; else a new one, when this is a
 * new player's first career (no other career outside the challenge, and no career at all before, or created since the
 * tutorial: the challenge may have come first). A player who has already played a match live has its steps closed.
 * Before recordFirstSave, which would make every player look like an old one.
 */
export async function startTutorial(tx: Prisma.TransactionClient, userId: string, saveId: string): Promise<void> {
  const taken = await tx.$executeRaw`
    UPDATE "Tutorial" SET "saveId" = ${saveId}
    WHERE "userId" = ${userId} AND "saveId" IS NULL AND "endedBy" IS NULL`;
  if (taken > 0) {
    return;
  }
  const created = await tx.$executeRaw`
    INSERT INTO "Tutorial" ("userId", "saveId", "version")
    SELECT u."id", ${saveId}, ${TUTORIAL_VERSION}
    FROM "User" u
    WHERE u."id" = ${userId}
      AND (u."firstSaveAt" IS NULL OR u."createdAt" >= ${TUTORIAL_SINCE})
      AND NOT EXISTS (SELECT 1 FROM "Save" s WHERE s."ownerId" = u."id" AND s."challengeId" IS NULL AND s."id" <> ${saveId})
    ON CONFLICT ("userId") DO NOTHING`;
  if (created === 0) {
    return;
  }
  await tx.$executeRaw`
    INSERT INTO "TutorialStep" ("userId", "step", "endedAt", "outcome")
    SELECT u."id", step, now(), 'ADAPTED'
    FROM "User" u CROSS JOIN unnest(${[...LIVE_STEPS]}::text[]) AS step
    WHERE u."id" = ${userId} AND u."firstLiveMatchAt" IS NOT NULL
    ON CONFLICT DO NOTHING`;
}

/** A step closed, its outcome kept once: a second close, from another tab, changes nothing. */
async function closeStep(tx: Prisma.TransactionClient, userId: string, step: TutorialStepKey, outcome: StepOutcome): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "TutorialStep" ("userId", "step", "endedAt", "outcome")
    VALUES (${userId}, ${step}, now(), ${outcome})
    ON CONFLICT ("userId", "step") DO UPDATE SET "endedAt" = now(), "outcome" = EXCLUDED."outcome"
    WHERE "TutorialStep"."outcome" IS NULL`;
}

/** The tutorial a save follows, its row locked for the transaction: two tabs write one after the other. */
async function lockedTutorial(tx: Prisma.TransactionClient, userId: string, saveId: string): Promise<TutorialProgress | null> {
  const locked = await tx.$queryRaw<{ userId: string }[]>`
    SELECT "userId" FROM "Tutorial" WHERE "userId" = ${userId} AND "saveId" = ${saveId} FOR UPDATE`;
  return locked.length === 0 ? null : readTutorial(tx, userId, saveId);
}

type RecordInput = TutorialContext & {
  userId: string;
  saveId: string;
  events: readonly TutorialEvent[];
  away?: boolean; // from a page away from the match and its « À demain » (pendingWrites)
};

/**
 * A screen's events on the tutorial its save follows, with what the tutorial closes by itself (pendingWrites), and its
 * end once every step is closed: one small transaction. A step shown counts one more show while it is open; the first
 * day's « À demain » shown is its end (Tutorial.day1At). Nothing on a tutorial over, or one this save does not follow.
 */
export async function recordTutorialEvents(db: PrismaClient, { userId, saveId, events, away, ...context }: RecordInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const progress = await lockedTutorial(tx, userId, saveId);
    if (progress === null || progress.endedBy !== null) {
      return;
    }
    const own = tutorialStatus(progress, context.now) === "running" ? events : [];
    const pending = pendingWrites(progress, context, { excluded: own.map(({ step }) => step), away });
    const closed = new Set<TutorialStepKey>();
    for (const { step, event } of own) {
      if (event === "show") {
        await tx.$executeRaw`
          INSERT INTO "TutorialStep" ("userId", "step", "shownAt", "shows")
          VALUES (${userId}, ${step}, now(), 1)
          ON CONFLICT ("userId", "step") DO UPDATE
          SET "shows" = "TutorialStep"."shows" + 1, "shownAt" = coalesce("TutorialStep"."shownAt", now())
          WHERE "TutorialStep"."outcome" IS NULL`;
        if (step === "full-time") {
          await tx.$executeRaw`UPDATE "Tutorial" SET "day1At" = coalesce("day1At", now()) WHERE "userId" = ${userId}`;
        }
      } else {
        await closeStep(tx, userId, step, OUTCOME_OF[event]);
        closed.add(step);
      }
    }
    for (const { step, outcome } of pending.closures) {
      await closeStep(tx, userId, step, outcome);
      closed.add(step);
    }
    const ending: TutorialEnding | null =
      pending.ending === "EXPIRED"
        ? "EXPIRED"
        : scenarioSteps(progress.version).every((step) => isClosed(progress, step) || closed.has(step))
          ? "FINISHED"
          : null;
    if (ending !== null) {
      await tx.$executeRaw`
        UPDATE "Tutorial" SET "endedAt" = now(), "endedBy" = ${ending} WHERE "userId" = ${userId} AND "endedBy" IS NULL`;
    }
  });
}

/**
 * « Passer le tutoriel », from the step it was shown at: over, everything hidden shown at once and for good (skippedAt).
 * Whether it was running.
 */
export async function skipTutorial(db: Db, userId: string, saveId: string, step: TutorialStepKey | null): Promise<boolean> {
  const skipped = await db.$executeRaw`
    UPDATE "Tutorial"
    SET "skippedAt" = now(), "skippedStep" = ${step}, "endedAt" = now(), "endedBy" = 'SKIPPED'
    WHERE "userId" = ${userId} AND "saveId" = ${saveId} AND "endedBy" IS NULL`;
  return skipped > 0;
}

/**
 * « Reprendre le tutoriel », from Club → Réglages: running again from now (its TUTORIAL_DAYS too), its passed steps whose
 * moment can still come open again, every open one with its shows anew; nothing hidden again. Whether it was taken up:
 * not when nothing would come of it (canResume).
 */
export async function resumeTutorial(db: PrismaClient, userId: string, saveId: string, context: TutorialContext): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const progress = await lockedTutorial(tx, userId, saveId);
    if (progress === null || !canResume(progress, context)) {
      return false;
    }
    const reopened = new Set(stepsToReopen(progress, context));
    const anew = scenarioSteps(progress.version).filter((step) => reopened.has(step) || !isClosed(progress, step));
    await tx.$executeRaw`
      UPDATE "TutorialStep" SET "outcome" = NULL, "endedAt" = NULL, "shows" = 0
      WHERE "userId" = ${userId} AND "step" = ANY(${anew}::text[])`;
    await tx.$executeRaw`
      UPDATE "Tutorial" SET "endedAt" = NULL, "endedBy" = NULL, "resumedAt" = now() WHERE "userId" = ${userId}`;
    return true;
  });
}

/**
 * At a Google sign-in, after the anonymous player's saves have gone to the account (src/db/accounts.ts): an account with
 * a tutorial of its own keeps it, the anonymous one's goes with its user; else the anonymous one's follows, its steps
 * with it, but over (MERGED) when the account already had a career of its own outside the challenge.
 */
export async function moveTutorial(tx: Prisma.TransactionClient, fromUserId: string, toUserId: string): Promise<void> {
  if ((await tx.tutorial.findUnique({ where: { userId: toUserId }, select: { userId: true } })) !== null) {
    return;
  }
  const moved = await tx.tutorial.findUnique({ where: { userId: fromUserId }, select: { saveId: true } });
  if (moved === null) {
    return;
  }
  const ownCareers = await tx.save.count({
    where: { ownerId: toUserId, challengeId: null, ...(moved.saveId === null ? {} : { id: { not: moved.saveId } }) },
  });
  await tx.$executeRaw`UPDATE "Tutorial" SET "userId" = ${toUserId} WHERE "userId" = ${fromUserId}`;
  if (ownCareers > 0) {
    await tx.$executeRaw`
      UPDATE "Tutorial" SET "endedAt" = now(), "endedBy" = 'MERGED' WHERE "userId" = ${toUserId} AND "endedBy" IS NULL`;
  }
}
