import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { describeError } from "../lib/diagnostics";
import {
  MISSION_KINDS,
  MISSION_TARGETS,
  YOUTH_MAX_AGE,
  dailyMissionKind,
  missionSteps,
  streakAfter,
  streakOn,
  type MatchFacts,
  type MissionKind,
  type MissionMove,
  type StreakMark,
  type StreakView,
} from "../lib/missions";
import { prisma } from "./client";
import { utcDayOf } from "./user-days";

// The mission of the day's rows (DailyMission, CLAUDE.md « Mission du jour »): written when it is shown, or when a move of
// the player takes it on, at that move: never by playing anything again. A move's queries run once its transaction is
// committed, never inside it, and a failure costs a step of the mission, never the move: logged, not thrown. A challenge
// save has none, and its moves count for none. Only the player's own rows, by the save's owner: nothing of the game reads
// them.

type Db = PrismaClient | Prisma.TransactionClient;

/** A mission as the screens show it: its day's, its progress, and the player's streak and record. */
export type DailyMissionView = {
  day: string; // UTC, « YYYY-MM-DD »
  kind: MissionKind;
  target: number;
  progress: number;
  completed: boolean;
  streak: StreakView; // with today's mission, once completed
};

/**
 * What a player's step in a save brings to the day's mission: a match of the managed club played to its end, and at a
 * pause of a live match, a substitution or an instruction of theirs.
 */
export type PlayedMoves = {
  match: { facts: MatchFacts; date: Date } | null;
  substitution: boolean;
  instruction: boolean;
};

const isMissionKind = (value: string): value is MissionKind => (MISSION_KINDS as readonly string[]).includes(value);

/** A day's row as the queries read it: the kind as text, the day as « YYYY-MM-DD ». */
type MissionRow = {
  day: string;
  kind: string;
  target: number;
  progress: number;
  completed: boolean;
  streak: number | null;
  best: number | null;
};

const markOf = (row: MissionRow | undefined): StreakMark | null =>
  row === undefined || !row.completed || row.streak === null || row.best === null ? null : { day: row.day, streak: row.streak, best: row.best };

/**
 * The day's mission of the save's player, as the dashboard and the « À demain » card show it, written the first time it
 * is (its row: a mission proposed). null for a challenge save, and one without an owner. `now` is real time.
 */
export async function getDailyMission(saveId: string, now: Date, db: Db = prisma): Promise<DailyMissionView | null> {
  const today = utcDayOf(now);
  const rows = await db.$queryRaw<({ ownerId: string | null; challenge: boolean } & Partial<MissionRow>)[]>`
    SELECT s."ownerId", s."challengeId" IS NOT NULL AS challenge,
           to_char(m."day", 'YYYY-MM-DD') AS day, m."kind"::text AS kind, m."target", m."progress",
           m."completedAt" IS NOT NULL AS completed, m."streak", m."best"
    FROM "Save" s
    LEFT JOIN LATERAL (
      SELECT * FROM "DailyMission" d
      WHERE d."userId" = s."ownerId" AND (d."day" = ${today}::date OR (d."day" < ${today}::date AND d."completedAt" IS NOT NULL))
      ORDER BY d."day" DESC
      LIMIT 2
    ) m ON true
    WHERE s."id" = ${saveId}`;
  const [first] = rows;
  if (first === undefined || first.ownerId === null || first.challenge) {
    return null;
  }
  const missions = rows.filter((row): row is typeof row & MissionRow => row.day !== null && row.day !== undefined);
  const todays = missions.find((row) => row.day === today);
  const latest = markOf(missions.find((row) => row.completed));
  if (todays !== undefined && isMissionKind(todays.kind)) {
    return { day: today, kind: todays.kind, target: todays.target, progress: todays.progress, completed: todays.completed, streak: streakOn(latest, today) };
  }
  // Shown for the first time today: proposed. Two requests at once write it once, the same draw.
  const kind = dailyMissionKind(first.ownerId, today);
  const target = MISSION_TARGETS[kind];
  await db.$executeRaw`
    INSERT INTO "DailyMission" ("userId", "day", "kind", "target")
    VALUES (${first.ownerId}, ${today}::date, ${kind}::"MissionKind", ${target})
    ON CONFLICT DO NOTHING`;
  return { day: today, kind, target, progress: 0, completed: false, streak: streakOn(latest, today) };
}

/**
 * The player's streak and record on `now`'s day, from their latest completed mission, without proposing one: the club's
 * settings. null for a challenge save, and one without an owner.
 */
export async function getMissionStreak(saveId: string, now: Date, db: Db = prisma): Promise<StreakView | null> {
  const today = utcDayOf(now);
  const rows = await db.$queryRaw<({ ownerId: string | null; challenge: boolean } & Partial<MissionRow>)[]>`
    SELECT s."ownerId", s."challengeId" IS NOT NULL AS challenge,
           to_char(m."day", 'YYYY-MM-DD') AS day, true AS completed, m."streak", m."best"
    FROM "Save" s
    LEFT JOIN LATERAL (
      SELECT * FROM "DailyMission" d
      WHERE d."userId" = s."ownerId" AND d."day" <= ${today}::date AND d."completedAt" IS NOT NULL
      ORDER BY d."day" DESC
      LIMIT 1
    ) m ON true
    WHERE s."id" = ${saveId}`;
  const [row] = rows;
  if (row === undefined || row.ownerId === null || row.challenge) {
    return null;
  }
  const latest = row.day === null || row.day === undefined || row.streak == null || row.best == null ? null : { day: row.day, streak: row.streak, best: row.best };
  return streakOn(latest, today);
}

/**
 * Takes the day's mission of the save's player on by what they just did in it, once its transaction is committed: the
 * day and the mission read in one query, nothing written unless the moves bring it a step, the streak once it is done.
 * The day is the database's, as every real-time figure. Nothing for a challenge save. A failure is logged, never thrown.
 */
export async function recordMissionMoves(db: Db, saveId: string, moves: PlayedMoves): Promise<void> {
  if (moves.match === null && !moves.substitution && !moves.instruction) {
    return;
  }
  try {
    const [context] = await db.$queryRaw<
      { ownerId: string | null; challenge: boolean; day: string; kind: string | null; target: number | null; progress: number | null; completed: boolean | null }[]
    >`
      SELECT s."ownerId", s."challengeId" IS NOT NULL AS challenge,
             to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
             m."kind"::text AS kind, m."target", m."progress", m."completedAt" IS NOT NULL AS completed
      FROM "Save" s
      LEFT JOIN "DailyMission" m ON m."userId" = s."ownerId" AND m."day" = (now() AT TIME ZONE 'UTC')::date
      WHERE s."id" = ${saveId}`;
    if (context === undefined || context.ownerId === null || context.challenge || context.completed === true) {
      return;
    }
    const ownerId = context.ownerId;
    const kind = context.kind !== null && isMissionKind(context.kind) ? context.kind : dailyMissionKind(ownerId, context.day);
    const target = context.target ?? MISSION_TARGETS[kind];
    const steps = missionSteps(kind, await movesOf(db, saveId, kind, moves), target - (context.progress ?? 0));
    if (steps <= 0) {
      return;
    }
    // Shown or not before, the day's row takes the steps: a mission another deploy drew differently keeps its own.
    const [taken] = await db.$queryRaw<{ progress: number; target: number }[]>`
      INSERT INTO "DailyMission" ("userId", "day", "kind", "target", "progress")
      VALUES (${ownerId}, ${context.day}::date, ${kind}::"MissionKind", ${target}, ${steps})
      ON CONFLICT ("userId", "day") DO UPDATE
      SET "progress" = LEAST("DailyMission"."target", "DailyMission"."progress" + EXCLUDED."progress")
      WHERE "DailyMission"."completedAt" IS NULL AND "DailyMission"."kind" = EXCLUDED."kind"
      RETURNING "progress", "target"`;
    if (taken === undefined || taken.progress < taken.target) {
      return;
    }
    await completeMission(db, ownerId, context.day);
  } catch (error) {
    console.error(`[recordMissionMoves] ${saveId}: ${describeError(error)}`);
  }
}

/**
 * The moves as the mission reads them: a match's starters of YOUTH_MAX_AGE or younger at its date looked up only for
 * START_YOUTH, the save's players by their key.
 */
async function movesOf(db: Db, saveId: string, kind: MissionKind, moves: PlayedMoves): Promise<MissionMove[]> {
  const result: MissionMove[] = [];
  if (moves.match !== null) {
    const { facts, date } = moves.match;
    let youthStarted: boolean | null = null;
    if (kind === "START_YOUTH" && facts.starters.length > 0) {
      const [{ youth }] = await db.$queryRaw<{ youth: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM "PlayerSave"
          WHERE "saveId" = ${saveId} AND "playerKey" IN (${Prisma.join(facts.starters)})
            AND "birthDate" > ${date}::timestamp - make_interval(years => ${YOUTH_MAX_AGE + 1}::int)
        ) AS youth`;
      youthStarted = youth;
    }
    result.push({ kind: "match", facts, youthStarted });
  }
  if (moves.substitution) {
    result.push({ kind: "substitution" });
  }
  if (moves.instruction) {
    result.push({ kind: "instruction" });
  }
  return result;
}

/**
 * At a Google sign-in, the anonymous player's missions go to the account (moveHistory, src/db/accounts.ts), in its
 * transaction: a day the account has keeps its own mission, unless only the anonymous player's was done. Then the
 * account's streaks are made again, day after day, over both histories.
 */
export async function moveMissions(tx: Prisma.TransactionClient, fromUserId: string, toUserId: string): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "DailyMission" ("userId", "day", "kind", "target", "progress", "createdAt", "completedAt")
    SELECT ${toUserId}, "day", "kind", "target", "progress", "createdAt", "completedAt" FROM "DailyMission" WHERE "userId" = ${fromUserId}
    ON CONFLICT ("userId", "day") DO UPDATE
    SET "kind" = EXCLUDED."kind", "target" = EXCLUDED."target", "progress" = EXCLUDED."progress", "completedAt" = EXCLUDED."completedAt"
    WHERE "DailyMission"."completedAt" IS NULL AND EXCLUDED."completedAt" IS NOT NULL`;
  const completed = await tx.$queryRaw<{ day: string; streak: number | null; best: number | null }[]>`
    SELECT to_char("day", 'YYYY-MM-DD') AS day, "streak", "best" FROM "DailyMission"
    WHERE "userId" = ${toUserId} AND "completedAt" IS NOT NULL
    ORDER BY "day"`;
  let previous: StreakMark | null = null;
  for (const row of completed) {
    const { streak, best } = streakAfter(previous, row.day);
    if (row.streak !== streak || row.best !== best) {
      await tx.$executeRaw`UPDATE "DailyMission" SET "streak" = ${streak}, "best" = ${best} WHERE "userId" = ${toUserId} AND "day" = ${row.day}::date`;
    }
    previous = { day: row.day, streak, best };
  }
}

/**
 * The day's mission done: its time at the database's clock, and the streak it makes after the player's latest completed
 * one before it. Of two moves completing it at once, the first only.
 */
async function completeMission(db: Db, userId: string, day: string): Promise<void> {
  const [previous] = await db.$queryRaw<{ day: string; streak: number | null; best: number | null }[]>`
    SELECT to_char("day", 'YYYY-MM-DD') AS day, "streak", "best" FROM "DailyMission"
    WHERE "userId" = ${userId} AND "day" < ${day}::date AND "completedAt" IS NOT NULL
    ORDER BY "day" DESC
    LIMIT 1`;
  const mark = previous === undefined || previous.streak === null || previous.best === null ? null : { day: previous.day, streak: previous.streak, best: previous.best };
  const { streak, best } = streakAfter(mark, day);
  await db.$executeRaw`
    UPDATE "DailyMission" SET "completedAt" = now(), "streak" = ${streak}, "best" = ${best}
    WHERE "userId" = ${userId} AND "day" = ${day}::date AND "completedAt" IS NULL AND "progress" >= "target"`;
}
