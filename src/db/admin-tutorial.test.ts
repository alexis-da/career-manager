import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The figures of /admin's « Tutoriel » (src/db/admin-tutorial.ts), against DATABASE_URL: players of its own in April and
// May 2005, far from any other test's and from any real one, with their tutorials, steps and days, and a release of their
// own on 20 April 2005, its reference the 14 days before; deleted before and after. Accounts, which the purge test's
// rolled-back purges never lock. Skipped without DATABASE_URL; modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the tutorial's figures of /admin, in the database", () => {
  let db: typeof prismaClient | undefined;
  let figures: typeof import("./admin-tutorial") | undefined;
  // Real time, not simulation code: a unique suffix keeps parallel runs apart.
  const run = `${Date.now()}`;
  const id = (name: string) => `test-admin-tutorial-${name}-${run}`;
  const at = (time: string) => new Date(`2005-${time}Z`);
  const day = (date: string) => new Date(`2005-${date}T00:00:00.000Z`);
  // Released on 20 April 2005: the reference's players were created from 6 to 19 April. Today is 20 May at noon.
  const SINCE = at("04-20T00:00:00.000");
  const NOW = at("05-20T12:00:00.000");
  const WEEK = { now: NOW, first: "2005-05-14", last: "2005-05-20", end: "2005-05-21", since: SINCE };
  const MONTH = { ...WEEK, first: "2005-04-21" };
  // Each test reads the figures once or twice: a fraction of a second alone, more beside the other database tests.
  const READING_MS = 30_000;

  type Step = { step: string; shownAt?: string; outcome?: "DONE" | "PASSED" | "ADAPTED" | "EXPIRED" };
  type Player = {
    name: string;
    createdAt: string;
    lastSeenAt: string;
    firstSaveAt?: string;
    firstMatchAt?: string;
    days: string[]; // UserDay
    tutorial?: {
      startedAt: string;
      day1At?: string;
      skippedAt?: string;
      skippedStep?: string;
      endedBy?: "FINISHED" | "SKIPPED" | "EXPIRED";
      steps: Step[];
    };
  };

  const players: Player[] = [
    // Over the week, from 14 May. Finished: its first match 4 minutes after its start, back the next day.
    {
      name: "finished",
      createdAt: "05-14T10:00:00.000",
      lastSeenAt: "05-20T09:00:00.000",
      firstSaveAt: "05-14T10:00:30.000",
      firstMatchAt: "05-14T10:04:30.000",
      days: ["05-14", "05-15", "05-20"],
      tutorial: {
        startedAt: "05-14T10:00:30.000",
        day1At: "05-14T10:04:40.000",
        endedBy: "FINISHED",
        steps: [
          { step: "welcome", shownAt: "05-14T10:01:00.000", outcome: "DONE" },
          { step: "speed", shownAt: "05-14T10:02:00.000", outcome: "DONE" },
          { step: "choice", shownAt: "05-14T10:03:00.000", outcome: "DONE" },
          { step: "half-time", shownAt: "05-14T10:03:30.000", outcome: "DONE" },
          { step: "full-time", shownAt: "05-14T10:04:40.000", outcome: "DONE" },
        ],
      },
    },
    // Skipped from its welcome, on its first day; its first match 10 minutes after its start all the same; not back.
    {
      name: "skipped",
      createdAt: "05-14T11:00:00.000",
      lastSeenAt: "05-14T11:20:00.000",
      firstSaveAt: "05-14T11:00:30.000",
      firstMatchAt: "05-14T11:10:30.000",
      days: ["05-14"],
      tutorial: {
        startedAt: "05-14T11:00:30.000",
        skippedAt: "05-14T11:01:30.000",
        skippedStep: "welcome",
        endedBy: "SKIPPED",
        steps: [{ step: "welcome", shownAt: "05-14T11:01:00.000" }],
      },
    },
    // Skipped from its « À demain », once its first day was over: 5 minutes 30 to its first match; back the next day.
    {
      name: "skipped-late",
      createdAt: "05-15T08:00:00.000",
      lastSeenAt: "05-16T08:00:00.000",
      firstSaveAt: "05-15T08:00:00.000",
      firstMatchAt: "05-15T08:05:30.000",
      days: ["05-15", "05-16"],
      tutorial: {
        startedAt: "05-15T08:00:00.000",
        day1At: "05-15T08:06:00.000",
        skippedAt: "05-15T08:07:00.000",
        skippedStep: "full-time",
        endedBy: "SKIPPED",
        steps: [
          { step: "welcome", shownAt: "05-15T08:01:00.000", outcome: "DONE" },
          { step: "speed", shownAt: "05-15T08:02:00.000", outcome: "ADAPTED" },
          { step: "choice", shownAt: "05-15T08:03:00.000", outcome: "PASSED" },
          { step: "half-time", shownAt: "05-15T08:04:00.000", outcome: "DONE" },
          { step: "full-time", shownAt: "05-15T08:06:00.000" },
        ],
      },
    },
    // Come by the challenge, its first match before its tutorial: its live steps closed unshown, its time left out.
    {
      name: "challenger",
      createdAt: "05-16T07:00:00.000",
      lastSeenAt: "05-16T09:30:00.000",
      firstSaveAt: "05-16T07:00:00.000",
      firstMatchAt: "05-16T07:20:00.000",
      days: ["05-16"],
      tutorial: {
        startedAt: "05-16T09:00:00.000",
        steps: [
          { step: "welcome", shownAt: "05-16T09:01:00.000", outcome: "DONE" },
          { step: "speed", outcome: "ADAPTED" },
          { step: "choice", outcome: "ADAPTED" },
          { step: "half-time", outcome: "ADAPTED" },
        ],
      },
    },
    // Started yesterday, no match yet, back today: a return day not over.
    {
      name: "newcomer",
      createdAt: "05-19T18:00:00.000",
      lastSeenAt: "05-20T08:00:00.000",
      firstSaveAt: "05-19T18:00:00.000",
      days: ["05-19", "05-20"],
      tutorial: { startedAt: "05-19T18:00:00.000", steps: [{ step: "welcome", shownAt: "05-19T18:01:00.000" }] },
    },
    // Over the month only, from 21 April. Dropouts, unseen since before 13 May at noon: one left at its first match live,
    // one shown two steps at once, one shown nothing but back the next day.
    {
      name: "dropout",
      createdAt: "05-01T09:00:00.000",
      lastSeenAt: "05-01T09:30:00.000",
      firstSaveAt: "05-01T09:00:30.000",
      days: ["05-01"],
      tutorial: {
        startedAt: "05-01T09:00:30.000",
        steps: [
          { step: "welcome", shownAt: "05-01T09:01:00.000", outcome: "DONE" },
          { step: "speed", shownAt: "05-01T09:05:00.000" },
        ],
      },
    },
    {
      name: "dropout-at-once",
      createdAt: "05-02T10:00:00.000",
      lastSeenAt: "05-02T10:30:00.000",
      firstSaveAt: "05-02T10:00:00.000",
      days: ["05-02"],
      tutorial: {
        startedAt: "05-02T10:00:00.000",
        steps: [
          { step: "welcome", shownAt: "05-02T10:01:00.000", outcome: "DONE" },
          { step: "speed", shownAt: "05-02T10:01:00.000" },
        ],
      },
    },
    {
      name: "dropout-silent",
      createdAt: "05-03T10:00:00.000",
      lastSeenAt: "05-04T10:00:00.000",
      firstSaveAt: "05-03T10:00:00.000",
      days: ["05-03", "05-04"],
      tutorial: { startedAt: "05-03T10:00:00.000", steps: [] },
    },
    // Out of time after its first day, back on its 16th: not a dropout. 8 minutes to its first match, back a week later.
    {
      name: "expired",
      createdAt: "04-22T12:00:00.000",
      lastSeenAt: "05-08T10:00:00.000",
      firstSaveAt: "04-22T12:00:00.000",
      firstMatchAt: "04-22T12:08:00.000",
      days: ["04-22", "04-23", "04-29", "05-08"],
      tutorial: {
        startedAt: "04-22T12:00:00.000",
        day1At: "04-22T12:09:00.000",
        endedBy: "EXPIRED",
        steps: [
          { step: "welcome", shownAt: "04-22T12:01:00.000", outcome: "DONE" },
          { step: "full-time", shownAt: "04-22T12:09:00.000", outcome: "EXPIRED" },
        ],
      },
    },
    // The reference: new players from 6 to 19 April, 6 and 12 minutes to their first match, back the next day and a week
    // later; one without a career, never back.
    {
      name: "reference-a",
      createdAt: "04-08T10:00:00.000",
      lastSeenAt: "04-15T10:00:00.000",
      firstSaveAt: "04-08T10:00:00.000",
      firstMatchAt: "04-08T10:06:00.000",
      days: ["04-08", "04-09", "04-15"],
    },
    {
      name: "reference-b",
      createdAt: "04-19T20:00:00.000",
      lastSeenAt: "04-26T10:00:00.000",
      firstSaveAt: "04-19T20:00:00.000",
      firstMatchAt: "04-19T20:12:00.000",
      days: ["04-19", "04-20", "04-26"],
    },
    { name: "reference-c", createdAt: "04-12T10:00:00.000", lastSeenAt: "04-12T10:00:00.000", days: ["04-12"] },
    // Created before the reference's days, its first career in them: in its median (30 minutes), not in its returns.
    {
      name: "older",
      createdAt: "04-04T10:00:00.000",
      lastSeenAt: "04-08T10:00:00.000",
      firstSaveAt: "04-08T09:00:00.000",
      firstMatchAt: "04-08T09:30:00.000",
      days: ["04-04", "04-08"],
    },
    // Created on the release's day, without a tutorial: in neither.
    {
      name: "release-day",
      createdAt: "04-20T01:00:00.000",
      lastSeenAt: "04-20T01:00:00.000",
      firstSaveAt: "04-20T01:00:00.000",
      firstMatchAt: "04-20T01:05:00.000",
      days: ["04-20"],
    },
  ];

  const loaded = () => {
    if (db === undefined || figures === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, figures };
  };
  const clean = (client: typeof prismaClient) => client.user.deleteMany({ where: { id: { in: players.map(({ name }) => id(name)) } } });

  beforeAll(async () => {
    const [{ prisma }, figuresModule] = await Promise.all([import("./client"), import("./admin-tutorial")]);
    db = prisma;
    figures = figuresModule;
    await clean(prisma);
    await prisma.user.createMany({
      data: players.map((player) => ({
        id: id(player.name),
        kind: "REGISTERED" as const,
        createdAt: at(player.createdAt),
        lastSeenAt: at(player.lastSeenAt),
        firstSaveAt: player.firstSaveAt === undefined ? null : at(player.firstSaveAt),
        firstMatchAt: player.firstMatchAt === undefined ? null : at(player.firstMatchAt),
      })),
    });
    await prisma.userDay.createMany({
      data: players.flatMap((player) => player.days.map((date) => ({ userId: id(player.name), day: day(date) }))),
    });
    const tutorials = players.flatMap(({ name, tutorial }) => (tutorial === undefined ? [] : [{ userId: id(name), ...tutorial }]));
    await prisma.tutorial.createMany({
      data: tutorials.map(({ userId, startedAt, day1At, skippedAt, skippedStep, endedBy }) => ({
        userId,
        version: 1,
        startedAt: at(startedAt),
        day1At: day1At === undefined ? null : at(day1At),
        skippedAt: skippedAt === undefined ? null : at(skippedAt),
        skippedStep: skippedStep ?? null,
        endedAt: endedBy === undefined ? null : at(skippedAt ?? day1At ?? startedAt),
        endedBy: endedBy ?? null,
      })),
    });
    await prisma.tutorialStep.createMany({
      data: tutorials.flatMap(({ userId, startedAt, steps }) =>
        steps.map(({ step, shownAt, outcome }) => ({
          userId,
          step,
          shownAt: shownAt === undefined ? null : at(shownAt),
          shows: shownAt === undefined ? 0 : 1,
          endedAt: outcome === undefined ? null : at(shownAt ?? startedAt),
          outcome: outcome ?? null,
        })),
      ),
    });
  }, 60_000);

  afterAll(async () => {
    if (db !== undefined) {
      await clean(db);
    }
    await db?.$disconnect();
  }, 60_000);

  it("counts the week's tutorials: started, first matches, first days, skipped and when, finished, no dropout yet", async () => {
    const { db, figures } = loaded();

    const week = await figures.tutorialFigures(db, WEEK);
    const released = await figures.tutorialFigures(db, { now: NOW, first: WEEK.first, last: WEEK.last, end: WEEK.end });

    expect(week).toMatchObject({
      since: "2005-04-20",
      referenceFirst: "2005-04-06",
      referenceLast: "2005-04-19",
      started: 5,
      // The challenger's first match, before its tutorial, counts: a first match played.
      firstMatches: 4,
      day1Done: 2,
      skipped: 2,
      skippedDay1: 1,
      finished: 1,
      // Started over the last seven days: none unseen for seven.
      dropouts: 0,
    });
    // The game's own release, its reference the 14 days before.
    expect(released).toMatchObject({ since: "2026-11-23", referenceFirst: "2026-11-09", referenceLast: "2026-11-22", started: 5 });
  }, READING_MS);

  it("measures from a tutorial's start to its first match, beside the reference's from its first career", async () => {
    const { db, figures } = loaded();

    const week = await figures.tutorialFigures(db, WEEK);
    const month = await figures.tutorialFigures(db, MONTH);

    // 4, 5.5 and 10 minutes: the challenger's first match, before its tutorial, left out.
    expect(week.minutesToFirstMatch.median).toBeCloseTo(5.5);
    expect(week.minutesToFirstMatch.q3).toBeCloseTo(7.75);
    // And the expired one's 8 over the month.
    expect(month.minutesToFirstMatch.median).toBeCloseTo(6.75);
    expect(month.minutesToFirstMatch.q3).toBeCloseTo(8.5);
    // 6, 12 and 30 minutes: the first careers of the reference's days, their player created then or before.
    expect(week.minutesToFirstMatch.reference).toBeCloseTo(12);
    expect(month.minutesToFirstMatch.reference).toBeCloseTo(12);
  }, READING_MS);

  it("counts how each step of the first day closed and where the tutorial was skipped, in the scenario's order", async () => {
    const { db, figures } = loaded();

    const { steps } = await figures.tutorialFigures(db, WEEK);

    expect(steps).toEqual([
      { step: "welcome", shown: 5, done: 3, passed: 0, adapted: 0, skipped: 1, lastShown: 0 },
      // The challenger's live steps adapted without being shown.
      { step: "speed", shown: 2, done: 1, passed: 0, adapted: 2, skipped: 0, lastShown: 0 },
      { step: "choice", shown: 2, done: 1, passed: 1, adapted: 1, skipped: 0, lastShown: 0 },
      { step: "half-time", shown: 2, done: 2, passed: 0, adapted: 1, skipped: 0, lastShown: 0 },
      { step: "full-time", shown: 2, done: 1, passed: 0, adapted: 0, skipped: 1, lastShown: 0 },
      // The following days' steps, none shown here.
      { step: "missions", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "market", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "objectives", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "lineup", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "squad", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "simulate", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "break", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "europe", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "cup", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "fitness", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "judged", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
    ]);
  }, READING_MS);

  it("counts the month's dropouts and the last step each was shown, the later in the scenario of two shown at once", async () => {
    const { db, figures } = loaded();

    const month = await figures.tutorialFigures(db, MONTH);

    // Three neither finished nor skipped, unseen for seven days; not the expired one, back on its 16th day.
    expect(month).toMatchObject({ started: 9, firstMatches: 5, day1Done: 3, skipped: 2, skippedDay1: 1, finished: 1, dropouts: 3 });
    // The one left at its first match live, and the one shown the welcome and the speed at once; the silent one, nowhere.
    expect(month.steps.map(({ step, lastShown }) => [step, lastShown])).toEqual([
      ["welcome", 0],
      ["speed", 2],
      ["choice", 0],
      ["half-time", 0],
      ["full-time", 0],
      ["missions", 0],
      ["market", 0],
      ["objectives", 0],
      ["lineup", 0],
      ["squad", 0],
      ["simulate", 0],
      ["break", 0],
      ["europe", 0],
      ["cup", 0],
      ["fitness", 0],
      ["judged", 0],
    ]);
    // A step expired is shown, never done, passed nor adapted.
    expect(month.steps[4]).toEqual({ step: "full-time", shown: 3, done: 1, passed: 0, adapted: 0, skipped: 1, lastShown: 0 });
  }, READING_MS);

  it("counts who came back at D+1 and D+7 once the return day is over, beside the new players before the release", async () => {
    const { db, figures } = loaded();

    const week = await figures.tutorialFigures(db, WEEK);
    const month = await figures.tutorialFigures(db, MONTH);

    // The reference: a, b and c, created in its days; a and b back the next day and a week later.
    const reference = { cohort: "reference", players: 3, day1: { part: 2, whole: 3 }, day7: { part: 2, whole: 3 } };
    expect(week.returns).toEqual([
      // Back the next day; their seventh day not over.
      { cohort: "day1Done", players: 2, day1: { part: 2, whole: 2 }, day7: { part: 0, whole: 0 } },
      { cohort: "skippedDay1", players: 1, day1: { part: 0, whole: 1 }, day7: { part: 0, whole: 0 } },
      // The newcomer's next day is today.
      { cohort: "noFirstMatch", players: 1, day1: { part: 0, whole: 0 }, day7: { part: 0, whole: 0 } },
      reference,
    ]);
    expect(month.returns).toEqual([
      // The expired one, back the next day and a week later.
      { cohort: "day1Done", players: 3, day1: { part: 3, whole: 3 }, day7: { part: 1, whole: 1 } },
      { cohort: "skippedDay1", players: 1, day1: { part: 0, whole: 1 }, day7: { part: 0, whole: 0 } },
      // The dropouts, the silent one back the next day.
      { cohort: "noFirstMatch", players: 4, day1: { part: 1, whole: 3 }, day7: { part: 0, whole: 3 } },
      reference,
    ]);
  }, READING_MS);
});
