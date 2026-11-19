import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { DAY_ONE_STEPS, TUTORIAL_SINCE, utcDay, type TutorialStepKey } from "../lib/tutorial";
import type { Share } from "./admin-dashboard";

// /admin's « Tutoriel » (docs/design/tutoriel.md § 4): the first-career tutorials started over the period, by UTC day of
// their start; how far their players went, how each step of the first day closed, and who came back the next day and a
// week later, beside the new players of the REFERENCE_DAYS days before its release (TUTORIAL_SINCE). Each figure is one
// aggregate query: the period's tutorials by Tutorial(startedAt), their players by User's key, their steps by
// TutorialStep's, their returns by UserDay's; the reference's players by User(createdAt). Never a table of the game.
// UserDay records every day since 9 October 2026, before the reference: every cohort here is known once its day is over.

const DAY_MS = 24 * 60 * 60 * 1000;

/** A tutorial neither finished nor skipped whose player has not been seen for this many days: a dropout. */
export const DROPOUT_DAYS = 7;

/** The days before the release whose new players are the reference. */
export const REFERENCE_DAYS = 14;

/** The rows of the returns, in the table's order: the tutorial's players by how far they went, then the reference. */
export const RETURN_COHORTS = ["day1Done", "skippedDay1", "noFirstMatch", "reference"] as const;

export type ReturnCohort = (typeof RETURN_COHORTS)[number];

/** A row of the returns: its players, and of those whose return day is over, the ones who came back on it. */
export type TutorialReturns = { cohort: ReturnCohort; players: number; day1: Share; day7: Share };

/** A step of the first day: how it was shown and closed, where the tutorial was skipped, and where its dropouts left. */
export type TutorialStepFigures = {
  step: TutorialStepKey;
  shown: number; // shown at least once (TutorialStep.shownAt)
  done: number; // its move made
  passed: number; // Escape, « Passer l'étape », or shown twice without its move
  adapted: number; // the move made another way, or the step no longer applying (closed unshown for a player who had played live)
  skipped: number; // the tutorials skipped (« Passer le tutoriel ») while it was shown
  lastShown: number; // the dropouts whose last step shown it was
};

export type TutorialFigures = {
  since: string; // the release's UTC day (TUTORIAL_SINCE)
  referenceFirst: string; // the reference's first day: REFERENCE_DAYS before the release
  referenceLast: string; // its last: the release's eve
  started: number;
  firstMatches: number; // their players with a first match played (User.firstMatchAt), the challenge's included
  day1Done: number; // their first match's « À demain » seen (Tutorial.day1At)
  skipped: number; // « Passer le tutoriel », not taken up again since
  skippedDay1: number; // of them, skipped on their first day: before its « À demain », or without one
  finished: number; // every step closed
  dropouts: number; // neither finished nor skipped, their player unseen for DROPOUT_DAYS days
  // From a tutorial's start to the end of its player's first match, in minutes: its median and 3rd quartile; beside them,
  // the reference's median from the first career's creation, as the Journey section's (null without a match).
  minutesToFirstMatch: { median: number | null; q3: number | null; reference: number | null };
  steps: TutorialStepFigures[]; // the first day's, in the scenario's order
  returns: TutorialReturns[]; // RETURN_COHORTS' order
};

/** A row of the returns' queries: a cohort's players of one day, and how many came back one and seven days later. */
export type ReturnRow = { day: string; cohort: string; players: number; day1: number; day7: number };

/** A step's closings, as the steps' query counts them. */
export type StepCounts = { step: string; shown: number; done: number; passed: number; adapted: number };

/** A count of tutorials by step: where they were skipped, or where their dropouts left. */
export type StepTally = { step: string; tutorials: number };

const addDays = (day: string, days: number): string => utcDay(new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS));

/**
 * Each cohort's returns over its days, as the Retention section counts them: every day's players, but their returns
 * only once the return day is over, strictly before `last` (today), « — » until then; a cohort without a row has none.
 */
export function returnsOf(rows: readonly ReturnRow[], last: string): TutorialReturns[] {
  return RETURN_COHORTS.map((cohort) => {
    const days = rows.filter((row) => row.cohort === cohort);
    const after = (offset: number, back: (row: ReturnRow) => number): Share => {
      const known = days.filter((row) => addDays(row.day, offset) < last);
      return { part: known.reduce((sum, row) => sum + back(row), 0), whole: known.reduce((sum, row) => sum + row.players, 0) };
    };
    return {
      cohort,
      players: days.reduce((sum, row) => sum + row.players, 0),
      day1: after(1, (row) => row.day1),
      day7: after(7, (row) => row.day7),
    };
  });
}

/** The first day's steps in the scenario's order, 0 where a query had no row; a step it does not know left out. */
export function stepsOf(counts: readonly StepCounts[], skips: readonly StepTally[], lastShown: readonly StepTally[]): TutorialStepFigures[] {
  return DAY_ONE_STEPS.map((step) => {
    const count = counts.find((row) => row.step === step);
    return {
      step,
      shown: count?.shown ?? 0,
      done: count?.done ?? 0,
      passed: count?.passed ?? 0,
      adapted: count?.adapted ?? 0,
      skipped: skips.find((row) => row.step === step)?.tutorials ?? 0,
      lastShown: lastShown.find((row) => row.step === step)?.tutorials ?? 0,
    };
  });
}

type CountRow = { step: string; shown: bigint; done: bigint; passed: bigint; adapted: bigint };
type TallyRow = { step: string; tutorials: bigint };
type DayRow = { day: Date; players: bigint; day1: bigint; day7: bigint };

const tally = (rows: readonly TallyRow[]): StepTally[] => rows.map(({ step, tutorials }) => ({ step, tutorials: Number(tutorials) }));

/**
 * The tutorials started from `first` to `last` (UTC days, today), `end` the day after, at this time (`now`, real time);
 * the reference from the REFERENCE_DAYS UTC days before `since`'s day (the release; a test's own elsewhere).
 */
export async function tutorialFigures(
  db: PrismaClient,
  { now, first, last, end, since = TUTORIAL_SINCE }: { now: Date; first: string; last: string; end: string; since?: Date },
): Promise<TutorialFigures> {
  const release = utcDay(since);
  const referenceFirst = addDays(release, -REFERENCE_DAYS);
  const unseenSince = new Date(now.getTime() - DROPOUT_DAYS * DAY_MS).toISOString();
  const period = Prisma.sql`t."startedAt" >= ${first}::date AND t."startedAt" < ${end}::date`;
  const dropout = Prisma.sql`t."endedBy" IS NULL AND u."lastSeenAt" < ${unseenSince}::timestamp(3)`;
  const skippedOnDayOne = Prisma.sql`t."endedBy" = 'SKIPPED' AND (t."day1At" IS NULL OR t."skippedAt" < t."day1At")`;
  const toFirstMatch = Prisma.sql`(extract(epoch FROM u."firstMatchAt" - t."startedAt") / 60)::float8`;

  const [[tiles], [reference], counts, skips, lastShown, tutorialDays, referenceDays] = await Promise.all([
    db.$queryRaw<
      {
        started: bigint;
        firstMatches: bigint;
        day1Done: bigint;
        skipped: bigint;
        skippedDay1: bigint;
        finished: bigint;
        dropouts: bigint;
        median: number | null;
        q3: number | null;
      }[]
    >`
      SELECT count(*)::bigint AS started,
             count(u."firstMatchAt")::bigint AS "firstMatches",
             count(t."day1At")::bigint AS "day1Done",
             count(*) FILTER (WHERE t."endedBy" = 'SKIPPED')::bigint AS skipped,
             count(*) FILTER (WHERE ${skippedOnDayOne})::bigint AS "skippedDay1",
             count(*) FILTER (WHERE t."endedBy" = 'FINISHED')::bigint AS finished,
             count(*) FILTER (WHERE ${dropout})::bigint AS dropouts,
             -- A first match before the tutorial (the challenge's) says nothing of it.
             percentile_cont(0.5) WITHIN GROUP (ORDER BY ${toFirstMatch}) FILTER (WHERE u."firstMatchAt" >= t."startedAt") AS median,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY ${toFirstMatch}) FILTER (WHERE u."firstMatchAt" >= t."startedAt") AS q3
      FROM "Tutorial" t
      JOIN "User" u ON u."id" = t."userId"
      WHERE ${period}`,
    // The Journey section's median over the players whose first career was created in the reference's days. Created
    // before the release, as a first career comes after its player: User(createdAt) bounds what is read.
    db.$queryRaw<{ median: number | null }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (extract(epoch FROM u."firstMatchAt" - u."firstSaveAt") / 60)::float8) AS median
      FROM "User" u
      WHERE u."createdAt" < ${release}::date
        AND u."firstSaveAt" >= ${referenceFirst}::date AND u."firstSaveAt" < ${release}::date
        AND u."firstMatchAt" >= u."firstSaveAt"`,
    db.$queryRaw<CountRow[]>`
      SELECT s."step",
             count(s."shownAt")::bigint AS shown,
             count(*) FILTER (WHERE s."outcome" = 'DONE')::bigint AS done,
             count(*) FILTER (WHERE s."outcome" = 'PASSED')::bigint AS passed,
             count(*) FILTER (WHERE s."outcome" = 'ADAPTED')::bigint AS adapted
      FROM "Tutorial" t
      JOIN "TutorialStep" s ON s."userId" = t."userId"
      WHERE ${period}
      GROUP BY 1`,
    db.$queryRaw<TallyRow[]>`
      SELECT t."skippedStep" AS step, count(*)::bigint AS tutorials
      FROM "Tutorial" t
      WHERE ${period} AND t."endedBy" = 'SKIPPED' AND t."skippedStep" IS NOT NULL
      GROUP BY 1`,
    // Each dropout's step first shown the latest; of two shown at once, the later in the scenario.
    db.$queryRaw<TallyRow[]>`
      SELECT l."step", count(*)::bigint AS tutorials
      FROM (
        SELECT DISTINCT ON (t."userId") s."step"
        FROM "Tutorial" t
        JOIN "User" u ON u."id" = t."userId"
        JOIN "TutorialStep" s ON s."userId" = t."userId"
        WHERE ${period} AND ${dropout} AND s."shownAt" IS NOT NULL
        ORDER BY t."userId", s."shownAt" DESC, array_position(${[...DAY_ONE_STEPS]}::text[], s."step") DESC NULLS LAST
      ) l
      GROUP BY 1`,
    // A tutorial in each row it belongs to (the rows overlap), its returns counted from the UTC day it began. The return
    // days bounded by the period's too, as the Retention section's: UserDay's index on them, whichever way it is joined.
    db.$queryRaw<(DayRow & { cohort: string })[]>`
      SELECT t."startedAt"::date AS day, c."cohort",
             count(*)::bigint AS players,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "UserDay" d
               WHERE d."userId" = t."userId" AND d."day" = t."startedAt"::date + 1
                 AND d."day" > ${first}::date AND d."day" <= ${end}::date
             ))::bigint AS day1,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "UserDay" d
               WHERE d."userId" = t."userId" AND d."day" = t."startedAt"::date + 7
                 AND d."day" >= ${first}::date + 7 AND d."day" < ${end}::date + 7
             ))::bigint AS day7
      FROM "Tutorial" t
      JOIN "User" u ON u."id" = t."userId"
      CROSS JOIN LATERAL unnest(ARRAY[
        CASE WHEN t."day1At" IS NOT NULL THEN 'day1Done' END,
        CASE WHEN ${skippedOnDayOne} THEN 'skippedDay1' END,
        CASE WHEN u."firstMatchAt" IS NULL THEN 'noFirstMatch' END
      ]::text[]) AS c("cohort")
      WHERE ${period} AND c."cohort" IS NOT NULL
      GROUP BY 1, 2`,
    // The new players of the reference's days, from the day they were created, as the Retention section counts them.
    db.$queryRaw<DayRow[]>`
      SELECT u."createdAt"::date AS day,
             count(*)::bigint AS players,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "UserDay" d
               WHERE d."userId" = u."id" AND d."day" = u."createdAt"::date + 1
                 AND d."day" > ${referenceFirst}::date AND d."day" <= ${release}::date
             ))::bigint AS day1,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "UserDay" d
               WHERE d."userId" = u."id" AND d."day" = u."createdAt"::date + 7
                 AND d."day" >= ${referenceFirst}::date + 7 AND d."day" < ${release}::date + 7
             ))::bigint AS day7
      FROM "User" u
      WHERE u."createdAt" >= ${referenceFirst}::date AND u."createdAt" < ${release}::date
      GROUP BY 1`,
  ]);

  const dayRow = (row: DayRow, cohort: string): ReturnRow => ({
    day: utcDay(row.day),
    cohort,
    players: Number(row.players),
    day1: Number(row.day1),
    day7: Number(row.day7),
  });

  return {
    since: release,
    referenceFirst,
    referenceLast: addDays(release, -1),
    started: Number(tiles?.started ?? 0),
    firstMatches: Number(tiles?.firstMatches ?? 0),
    day1Done: Number(tiles?.day1Done ?? 0),
    skipped: Number(tiles?.skipped ?? 0),
    skippedDay1: Number(tiles?.skippedDay1 ?? 0),
    finished: Number(tiles?.finished ?? 0),
    dropouts: Number(tiles?.dropouts ?? 0),
    minutesToFirstMatch: { median: tiles?.median ?? null, q3: tiles?.q3 ?? null, reference: reference?.median ?? null },
    steps: stepsOf(
      counts.map((row) => ({
        step: row.step,
        shown: Number(row.shown),
        done: Number(row.done),
        passed: Number(row.passed),
        adapted: Number(row.adapted),
      })),
      tally(skips),
      tally(lastShown),
    ),
    returns: returnsOf([...tutorialDays.map((row) => dayRow(row, row.cohort)), ...referenceDays.map((row) => dayRow(row, "reference"))], last),
  };
}
