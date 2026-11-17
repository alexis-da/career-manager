import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { nextStreakLot, streakLotOf } from "../lib/cosmetics";
import { describeError } from "../lib/diagnostics";
import {
  ALL_THREE_TOKENS,
  MISSION_KINDS,
  MISSION_TIERS,
  MISSION_TOKENS,
  YOUTH_MAX_AGE,
  changedMissionKind,
  dailyMissionKind,
  missionSteps,
  missionTarget,
  streakAfter,
  streakOn,
  welcomeTokens,
  type MatchFacts,
  type MissionKind,
  type MissionMove,
  type MissionTier,
  type StreakMark,
  type StreakView,
} from "../lib/missions";
import { prisma } from "./client";
import { lockRewards, unlockCosmetics, unlockMissionAchievements, writeTokens } from "./rewards";
import { utcDayOf } from "./user-days";

// The missions of the day, v2 (docs/design/missions-v2.md, CLAUDE.md « Missions du jour »): three a player a UTC day
// (MissionTask), their day and its streak (MissionDay), and the tokens they earn (src/db/rewards.ts). Written when shown,
// or when a move of the player takes one on, at that move: never by playing anything again. A move's queries run once
// its transaction is committed, never inside it, and a failure costs a step of a mission, never the move: logged, not
// thrown. A challenge save has none, and its moves count for none. DailyMission (v1) stays, read for the streak's first
// v2 day and the welcome tokens.

type Db = PrismaClient | Prisma.TransactionClient;

/** A mission of the day as the screens show it. */
export type MissionTaskView = {
  tier: MissionTier;
  kind: MissionKind;
  target: number;
  progress: number;
  completed: boolean;
  tokens: number; // what it earns
  changedFrom: MissionKind | null; // the mission « Changer de mission » replaced
};

/** The day's missions of a player, their tokens, their streak, and what the day still offers. */
export type DailyMissionsView = {
  day: string; // UTC, « YYYY-MM-DD »
  tasks: MissionTaskView[]; // easy, medium, hard
  done: number;
  balance: number;
  earnedToday: number; // tokens of the day's missions and bonuses
  streak: StreakView;
  shield: boolean; // a streak shield in reserve
  changeUsed: boolean; // « Changer de mission » used today
  nextLot: { cycle: number; cosmetics: string[] } | null; // the streak's next exclusive lot
  welcome: number; // tokens of the v1 missions credited at this very view, 0 otherwise
};

/**
 * A player's step in a save: a match of the managed club played to its end; at a pause of a live match, a substitution,
 * an instruction or a choice event's decision of theirs; a line-up saved.
 */
export type PlayedMoves = {
  match?: { facts: MatchFacts; date: Date } | null;
  substitution?: boolean;
  instruction?: boolean;
  decision?: boolean;
  lineup?: boolean;
};

const isKind = (value: string): value is MissionKind => (MISSION_KINDS as readonly string[]).includes(value);
const isTier = (value: string): value is MissionTier => (MISSION_TIERS as readonly string[]).includes(value);

type TaskRow = { tier: string; kind: string; target: number; progress: number; completed: boolean; changedFrom: string | null };

/** The day's three missions: those written, else the day's draw. */
function tasksOf(userId: string, day: string, rows: readonly TaskRow[]): MissionTaskView[] {
  return MISSION_TIERS.map((tier) => {
    const row = rows.find((candidate) => candidate.tier === tier);
    if (row !== undefined && isKind(row.kind)) {
      return {
        tier,
        kind: row.kind,
        target: row.target,
        progress: row.progress,
        completed: row.completed,
        tokens: MISSION_TOKENS[tier],
        changedFrom: row.changedFrom !== null && isKind(row.changedFrom) ? row.changedFrom : null,
      };
    }
    const kind = dailyMissionKind(userId, day, tier);
    return { tier, kind, target: missionTarget(kind), progress: 0, completed: false, tokens: MISSION_TOKENS[tier], changedFrom: null };
  });
}

/** Writes the day's missions not written yet, as drawn: shown, they are proposed. Two requests at once write them once. */
async function proposeTasks(db: Db, userId: string, day: string, tasks: readonly MissionTaskView[], written: ReadonlySet<string>): Promise<void> {
  const missing = tasks.filter(({ tier }) => !written.has(tier));
  if (missing.length === 0) {
    return;
  }
  await db.$executeRaw`
    INSERT INTO "MissionTask" ("userId", "day", "tier", "kind", "target")
    VALUES ${Prisma.join(missing.map((task) => Prisma.sql`(${userId}, ${day}::date, ${task.tier}::"MissionTier", ${task.kind}::"MissionKind", ${task.target})`))}
    ON CONFLICT DO NOTHING`;
}

/** The player's latest counted day before `day` (a v2 day, else a v1 mission done), with the cycles done in all. */
async function latestCountedBefore(db: Db, userId: string, day: string): Promise<StreakMark | null> {
  const [v2] = await db.$queryRaw<{ day: string; streak: number; best: number; cycles: number | null }[]>`
    SELECT to_char("day", 'YYYY-MM-DD') AS day, "streak", "best", "cycles" FROM "MissionDay"
    WHERE "userId" = ${userId} AND "day" < ${day}::date AND ("countedAt" IS NOT NULL OR "shieldedAt" IS NOT NULL)
      AND "streak" IS NOT NULL AND "best" IS NOT NULL
    ORDER BY "day" DESC
    LIMIT 1`;
  const [v1] = await db.$queryRaw<{ day: string; streak: number; best: number }[]>`
    SELECT to_char("day", 'YYYY-MM-DD') AS day, "streak", "best" FROM "DailyMission"
    WHERE "userId" = ${userId} AND "day" < ${day}::date AND "completedAt" IS NOT NULL AND "streak" IS NOT NULL AND "best" IS NOT NULL
    ORDER BY "day" DESC
    LIMIT 1`;
  const cycles = v2?.cycles ?? 0;
  if (v1 !== undefined && (v2 === undefined || v1.day > v2.day)) {
    return { day: v1.day, streak: v1.streak, best: Math.max(v1.best, v2?.best ?? 0), cycles };
  }
  return v2 === undefined ? null : { day: v2.day, streak: v2.streak, best: v2.best, cycles };
}

/**
 * The day's missions of the save's player, as the dashboard and the « À demain » card show them, written the first time
 * they are (proposed). At the player's first view of v2, the welcome tokens of their v1 missions, once. null for a
 * challenge save, and one without an owner. `now` is real time.
 */
export async function getDailyMissions(saveId: string, now: Date, db: PrismaClient = prisma): Promise<DailyMissionsView | null> {
  const day = utcDayOf(now);
  const [context] = await db.$queryRaw<
    { ownerId: string | null; challenge: boolean; tokens: number | null; shield: boolean | null; welcomed: boolean; earned: number }[]
  >`
    SELECT s."ownerId", s."challengeId" IS NOT NULL AS challenge, u."tokens", u."streakShield" AS shield,
           EXISTS (SELECT 1 FROM "TokenEntry" w WHERE w."userId" = s."ownerId" AND w."key" = 'welcome-v1') AS welcomed,
           coalesce((SELECT sum(e."amount") FROM "TokenEntry" e
                     WHERE e."userId" = s."ownerId" AND e."day" = ${day}::date AND e."amount" > 0), 0)::int AS earned
    FROM "Save" s
    LEFT JOIN "User" u ON u."id" = s."ownerId"
    WHERE s."id" = ${saveId}`;
  if (context === undefined || context.ownerId === null || context.challenge) {
    return null;
  }
  const userId = context.ownerId;
  const rows = await db.$queryRaw<TaskRow[]>`
    SELECT "tier"::text AS tier, "kind"::text AS kind, "target", "progress", "completedAt" IS NOT NULL AS completed,
           "changedFrom"::text AS "changedFrom"
    FROM "MissionTask" WHERE "userId" = ${userId} AND "day" = ${day}::date`;
  const days = await db.$queryRaw<{ counted: boolean; changed: boolean; streak: number | null; best: number | null; cycles: number | null }[]>`
    SELECT "countedAt" IS NOT NULL AS counted, "changedAt" IS NOT NULL AS changed, "streak", "best", "cycles"
    FROM "MissionDay" WHERE "userId" = ${userId} AND "day" = ${day}::date`;
  const tasks = tasksOf(userId, day, rows);
  await proposeTasks(db, userId, day, tasks, new Set(rows.map(({ tier }) => tier)));

  let balance = context.tokens ?? 0;
  let welcome = 0;
  if (!context.welcomed) {
    welcome = await creditWelcome(db, userId);
    balance += welcome;
  }

  const today = days[0];
  const latest: StreakMark | null =
    today !== undefined && today.counted && today.streak !== null && today.best !== null
      ? { day, streak: today.streak, best: today.best, cycles: today.cycles ?? 0 }
      : await latestCountedBefore(db, userId, day);
  const shield = context.shield === true;
  const streak = streakOn(latest, day, shield);
  const lot = nextStreakLot(streak.cycles);
  return {
    day,
    tasks,
    done: tasks.filter(({ completed }) => completed).length,
    balance,
    earnedToday: context.earned + welcome,
    streak,
    shield,
    changeUsed: today?.changed === true,
    nextLot: lot === null ? null : { cycle: lot.cycle, cosmetics: lot.cosmetics.map(({ id }) => id) },
    welcome,
  };
}

/**
 * The welcome of a v1 player: 10 tokens a v1 mission done, at most 100, once (written even at 0, never counted again).
 * After a Google sign-in, the anonymous player's welcome came with their missions (« merge:…:welcome-v1 »): only the
 * rest is credited, never the same missions twice.
 */
async function creditWelcome(db: PrismaClient, userId: string): Promise<number> {
  return db.$transaction(async (tx) => {
    await lockRewards(tx, userId);
    const [{ done, welcomed }] = await tx.$queryRaw<{ done: bigint; welcomed: bigint }[]>`
      SELECT (SELECT count(*) FROM "DailyMission" WHERE "userId" = ${userId} AND "completedAt" IS NOT NULL)::bigint AS done,
             (SELECT coalesce(sum("amount"), 0) FROM "TokenEntry"
              WHERE "userId" = ${userId} AND "key" LIKE 'merge:%:welcome-v1')::bigint AS welcomed`;
    const amount = Math.max(0, welcomeTokens(Number(done)) - Number(welcomed));
    const written = await writeTokens(tx, { userId, key: "welcome-v1", reason: "WELCOME", amount });
    return written ? amount : 0;
  });
}

/**
 * The player's streak on `now`'s day, with the cycles done and a shield in reserve, without proposing a mission: the
 * club's settings and the Rewards screen. null for a challenge save, and one without an owner.
 */
export async function getMissionStreak(saveId: string, now: Date, db: PrismaClient = prisma): Promise<(StreakView & { shield: boolean }) | null> {
  const save = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { ownerId: true, challengeId: true, owner: { select: { streakShield: true } } } });
  if (save.ownerId === null || save.challengeId !== null) {
    return null;
  }
  const day = utcDayOf(now);
  const [today] = await db.$queryRaw<{ streak: number | null; best: number | null; cycles: number | null }[]>`
    SELECT "streak", "best", "cycles" FROM "MissionDay"
    WHERE "userId" = ${save.ownerId} AND "day" = ${day}::date AND "countedAt" IS NOT NULL`;
  const latest =
    today !== undefined && today.streak !== null && today.best !== null
      ? { day, streak: today.streak, best: today.best, cycles: today.cycles ?? 0 }
      : await latestCountedBefore(db, save.ownerId, day);
  const shield = save.owner?.streakShield === true;
  return { ...streakOn(latest, day, shield), shield };
}

/** The moves as the missions read them: a match's starters of YOUTH_MAX_AGE or younger looked up only when asked. */
async function movesOf(db: Db, saveId: string, moves: PlayedMoves, youth: boolean): Promise<MissionMove[]> {
  const result: MissionMove[] = [];
  if (moves.match !== null && moves.match !== undefined) {
    const { facts, date } = moves.match;
    let youthStarted: boolean | null = null;
    if (youth && facts.starters.length > 0) {
      const [{ started }] = await db.$queryRaw<{ started: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM "PlayerSave"
          WHERE "saveId" = ${saveId} AND "playerKey" IN (${Prisma.join(facts.starters)})
            AND "birthDate" > ${date}::timestamp - make_interval(years => ${YOUTH_MAX_AGE + 1}::int)
        ) AS started`;
      youthStarted = started;
    }
    result.push({ kind: "match", facts, youthStarted });
  }
  if (moves.substitution === true) {
    result.push({ kind: "substitution" });
  }
  if (moves.instruction === true) {
    result.push({ kind: "instruction" });
  }
  if (moves.decision === true) {
    result.push({ kind: "decision" });
  }
  if (moves.lineup === true) {
    result.push({ kind: "lineup" });
  }
  return result;
}

/**
 * Takes the day's missions of the save's player on by what they just did in it, once its transaction is committed: the
 * day (the database's clock) and the missions read in one query, nothing written unless the moves bring one a step, the
 * day, the streak and the tokens once one is done; a live match played to its end counts for the live achievements.
 * Nothing for a challenge save. A failure is logged, never thrown.
 */
export async function recordMissionMoves(db: PrismaClient, saveId: string, moves: PlayedMoves): Promise<void> {
  const live = moves.match?.facts.live === true;
  if ((moves.match === null || moves.match === undefined) && moves.substitution !== true && moves.instruction !== true && moves.decision !== true && moves.lineup !== true) {
    return;
  }
  try {
    const [context] = await db.$queryRaw<{ ownerId: string | null; challenge: boolean; day: string; tasks: TaskRow[] }[]>`
      SELECT s."ownerId", s."challengeId" IS NOT NULL AS challenge, d.day,
             coalesce(json_agg(json_build_object('tier', t."tier", 'kind', t."kind", 'target', t."target", 'progress', t."progress",
                                                 'completed', t."completedAt" IS NOT NULL, 'changedFrom', t."changedFrom"))
                      FILTER (WHERE t."tier" IS NOT NULL), '[]') AS tasks
      FROM "Save" s
      CROSS JOIN (SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day) d
      LEFT JOIN "MissionTask" t ON t."userId" = s."ownerId" AND t."day" = d.day::date
      WHERE s."id" = ${saveId}
      GROUP BY s."ownerId", s."challengeId", d.day`;
    if (context === undefined || context.ownerId === null || context.challenge) {
      return;
    }
    const userId = context.ownerId;
    const { day } = context;
    const tasks = tasksOf(userId, day, context.tasks);
    const open = tasks.filter(({ completed }) => !completed);
    const youth = open.some(({ kind }) => kind === "START_YOUTH");
    const played = await movesOf(db, saveId, moves, youth);
    const steps = open
      .map((task) => ({ task, steps: missionSteps(task.kind, played, task.target - task.progress) }))
      .filter(({ steps }) => steps > 0);
    if (steps.length === 0 && !live) {
      return;
    }
    await db.$transaction(async (tx) => {
      await lockRewards(tx, userId);
      for (const { task, steps: count } of steps) {
        // Shown or not before, the day's mission takes the steps: one another deploy drew differently keeps its own.
        await tx.$executeRaw`
          INSERT INTO "MissionTask" ("userId", "day", "tier", "kind", "target", "progress")
          VALUES (${userId}, ${day}::date, ${task.tier}::"MissionTier", ${task.kind}::"MissionKind", ${task.target}, ${count})
          ON CONFLICT ("userId", "day", "tier") DO UPDATE
          SET "progress" = LEAST("MissionTask"."target", "MissionTask"."progress" + EXCLUDED."progress")
          WHERE "MissionTask"."completedAt" IS NULL AND "MissionTask"."kind" = EXCLUDED."kind"`;
        await completeTask(tx, userId, day, task.tier);
      }
      if (live && moves.match !== null && moves.match !== undefined) {
        const [counts] = await tx.$queryRaw<{ liveMatches: number; liveWins: number }[]>`
          UPDATE "User" SET "liveMatches" = "liveMatches" + 1, "liveWins" = "liveWins" + ${moves.match.facts.won ? 1 : 0}
          WHERE "id" = ${userId}
          RETURNING "liveMatches", "liveWins"`;
        if (counts !== undefined) {
          await unlockMissionAchievements(tx, userId, { perfectDay: false, liveMatches: counts.liveMatches, liveWins: counts.liveWins });
        }
      }
    });
  } catch (error) {
    console.error(`[recordMissionMoves] ${saveId}: ${describeError(error)}`);
  }
}

/**
 * A mission of the day done, if its steps reached its target: its time at the database's clock, once, and its tokens;
 * the day's count, the streak if it is the day's first (countDay), the three's bonus if it is the third; the
 * achievements of the missions done.
 */
async function completeTask(tx: Prisma.TransactionClient, userId: string, day: string, tier: MissionTier): Promise<void> {
  const done = await tx.$queryRaw<{ kind: string }[]>`
    UPDATE "MissionTask" SET "completedAt" = now()
    WHERE "userId" = ${userId} AND "day" = ${day}::date AND "tier" = ${tier}::"MissionTier"
      AND "completedAt" IS NULL AND "progress" >= "target"
    RETURNING "kind"::text AS kind`;
  if (done.length === 0) {
    return;
  }
  await writeTokens(tx, { userId, key: `mission:${day}:${tier}`, reason: "MISSION", amount: MISSION_TOKENS[tier], day });
  const [row] = await tx.$queryRaw<{ done: number; first: boolean }[]>`
    INSERT INTO "MissionDay" ("userId", "day", "done") VALUES (${userId}, ${day}::date, 1)
    ON CONFLICT ("userId", "day") DO UPDATE SET "done" = "MissionDay"."done" + 1
    RETURNING "done", "countedAt" IS NULL AS first`;
  if (row.first) {
    await countDay(tx, userId, day);
  }
  const perfectDay = row.done >= MISSION_TIERS.length;
  if (perfectDay) {
    await tx.$executeRaw`UPDATE "MissionDay" SET "allDoneAt" = now() WHERE "userId" = ${userId} AND "day" = ${day}::date AND "allDoneAt" IS NULL`;
    await writeTokens(tx, { userId, key: `all-three:${day}`, reason: "ALL_THREE", amount: ALL_THREE_TOKENS, day });
  }
  await unlockMissionAchievements(tx, userId, { perfectDay });
}

/**
 * The day counts (its first mission done): the streak it makes after the latest counted day, the shield used on a single
 * day missed (that day kept as forgiven), the bonus of the cycle's third or seventh day and the seventh's exclusive lot.
 */
async function countDay(tx: Prisma.TransactionClient, userId: string, day: string): Promise<void> {
  const previous = await latestCountedBefore(tx, userId, day);
  const [{ shield }] = await tx.$queryRaw<{ shield: boolean }[]>`SELECT "streakShield" AS shield FROM "User" WHERE "id" = ${userId}`;
  const step = streakAfter(previous, day, shield);
  if (step.forgiven !== null && previous !== null) {
    await tx.$executeRaw`UPDATE "User" SET "streakShield" = false WHERE "id" = ${userId}`;
    await tx.$executeRaw`
      INSERT INTO "MissionDay" ("userId", "day", "shieldedAt", "streak", "best", "cycles")
      VALUES (${userId}, ${step.forgiven}::date, now(), ${previous.streak}, ${previous.best}, ${previous.cycles})
      ON CONFLICT ("userId", "day") DO UPDATE
      SET "shieldedAt" = now(), "streak" = EXCLUDED."streak", "best" = EXCLUDED."best", "cycles" = EXCLUDED."cycles"
      WHERE "MissionDay"."countedAt" IS NULL`;
  }
  await tx.$executeRaw`
    UPDATE "MissionDay" SET "countedAt" = now(), "streak" = ${step.streak}, "best" = ${step.best}, "cycles" = ${step.cycles}
    WHERE "userId" = ${userId} AND "day" = ${day}::date`;
  if (step.tokens > 0) {
    await writeTokens(tx, { userId, key: `streak:${day}`, reason: "STREAK", amount: step.tokens, day });
  }
  if (step.lot !== null) {
    await unlockCosmetics(tx, userId, streakLotOf(step.lot).map(({ id }) => id), "STREAK");
  }
}

export type ChangeRefusal = "challenge" | "used" | "started";

/**
 * « Changer de mission »: the day's mission of a tier replaced by its change's draw, once a day for the player, never one
 * started (progress above 0) or done. `now` is real time.
 */
export async function changeMission(
  saveId: string,
  tier: MissionTier,
  now: Date,
): Promise<{ ok: true; kind: MissionKind } | { ok: false; reason: ChangeRefusal }> {
  if (!isTier(tier)) {
    throw new Error(`Unknown tier ${String(tier)}`);
  }
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { ownerId: true, challengeId: true } });
  if (save.ownerId === null || save.challengeId !== null) {
    return { ok: false, reason: "challenge" };
  }
  const userId = save.ownerId;
  const day = utcDayOf(now);
  return prisma.$transaction(async (tx) => {
    await lockRewards(tx, userId);
    const [today] = await tx.$queryRaw<{ changed: boolean }[]>`
      SELECT "changedAt" IS NOT NULL AS changed FROM "MissionDay" WHERE "userId" = ${userId} AND "day" = ${day}::date`;
    if (today?.changed === true) {
      return { ok: false as const, reason: "used" as const };
    }
    const rows = await tx.$queryRaw<TaskRow[]>`
      SELECT "tier"::text AS tier, "kind"::text AS kind, "target", "progress", "completedAt" IS NOT NULL AS completed,
             "changedFrom"::text AS "changedFrom"
      FROM "MissionTask" WHERE "userId" = ${userId} AND "day" = ${day}::date`;
    const tasks = tasksOf(userId, day, rows);
    await proposeTasks(tx, userId, day, tasks, new Set(rows.map((row) => row.tier)));
    const task = tasks.find((candidate) => candidate.tier === tier);
    if (task === undefined || task.completed || task.progress > 0) {
      return { ok: false as const, reason: "started" as const };
    }
    const kind = changedMissionKind(userId, day, tier, task.kind);
    const changed = await tx.$executeRaw`
      UPDATE "MissionTask" SET "kind" = ${kind}::"MissionKind", "target" = ${missionTarget(kind)}, "changedFrom" = ${task.kind}::"MissionKind"
      WHERE "userId" = ${userId} AND "day" = ${day}::date AND "tier" = ${tier}::"MissionTier"
        AND "progress" = 0 AND "completedAt" IS NULL`;
    if (changed !== 1) {
      return { ok: false as const, reason: "started" as const };
    }
    await tx.$executeRaw`
      INSERT INTO "MissionDay" ("userId", "day", "changedAt") VALUES (${userId}, ${day}::date, now())
      ON CONFLICT ("userId", "day") DO UPDATE SET "changedAt" = now()`;
    return { ok: true as const, kind };
  });
}

/**
 * At a Google sign-in (moveHistory, src/db/accounts.ts), the anonymous player's missions of v1 (DailyMission) go to the
 * account: a day both have keeps the account's, unless the anonymous player's alone was done; then the account's
 * streaks and records are made again day after day. Before moveMissionDays, whose first v2 day carries the v1 streak on.
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
    const { streak, best } = streakAfter(previous, row.day, false);
    if (row.streak !== streak || row.best !== best) {
      await tx.$executeRaw`UPDATE "DailyMission" SET "streak" = ${streak}, "best" = ${best} WHERE "userId" = ${toUserId} AND "day" = ${row.day}::date`;
    }
    previous = { day: row.day, streak, best, cycles: 0 };
  }
}

/**
 * At a Google sign-in, after moveMissions, the anonymous player's missions of v2 go to the account: a day both have keeps
 * the account's missions, the anonymous player's added for a tier the account lacks, and counts the missions done of both;
 * then the account's streaks, records and cycles are made again day after day, from its last v1 day before, a day the
 * shield forgave bridging the two around it; no bonus again, but every streak lot of the cycles done (never lost).
 */
export async function moveMissionDays(tx: Prisma.TransactionClient, fromUserId: string, toUserId: string): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "MissionTask" ("userId", "day", "tier", "kind", "target", "progress", "changedFrom", "createdAt", "completedAt")
    SELECT ${toUserId}, "day", "tier", "kind", "target", "progress", "changedFrom", "createdAt", "completedAt"
    FROM "MissionTask" WHERE "userId" = ${fromUserId}
    ON CONFLICT DO NOTHING`;
  await tx.$executeRaw`
    INSERT INTO "MissionDay" ("userId", "day", "done", "countedAt", "allDoneAt", "streak", "best", "cycles", "changedAt", "shieldedAt")
    SELECT ${toUserId}, "day", "done", "countedAt", "allDoneAt", "streak", "best", "cycles", "changedAt", "shieldedAt"
    FROM "MissionDay" WHERE "userId" = ${fromUserId}
    ON CONFLICT ("userId", "day") DO UPDATE
    SET "countedAt" = coalesce("MissionDay"."countedAt", EXCLUDED."countedAt"),
        "allDoneAt" = coalesce("MissionDay"."allDoneAt", EXCLUDED."allDoneAt"),
        "changedAt" = coalesce("MissionDay"."changedAt", EXCLUDED."changedAt"),
        "shieldedAt" = CASE WHEN coalesce("MissionDay"."countedAt", EXCLUDED."countedAt") IS NULL
                            THEN coalesce("MissionDay"."shieldedAt", EXCLUDED."shieldedAt") END`;
  await tx.$executeRaw`
    UPDATE "MissionDay" AS d SET "done" = t.done
    FROM (SELECT "day", (count(*) FILTER (WHERE "completedAt" IS NOT NULL))::int AS done
          FROM "MissionTask" WHERE "userId" = ${toUserId} GROUP BY "day") AS t
    WHERE d."userId" = ${toUserId} AND d."day" = t."day" AND d."done" <> t.done`;
  const days = await tx.$queryRaw<{ day: string; counted: boolean }[]>`
    SELECT to_char("day", 'YYYY-MM-DD') AS day, "countedAt" IS NOT NULL AS counted FROM "MissionDay"
    WHERE "userId" = ${toUserId} AND ("countedAt" IS NOT NULL OR "shieldedAt" IS NOT NULL)
    ORDER BY "day"`;
  if (days.length === 0) {
    return;
  }
  let previous: StreakMark | null = await latestCountedBefore(tx, toUserId, days[0].day);
  for (const { day, counted } of days) {
    let mark: StreakMark;
    if (counted || previous === null) {
      const step = streakAfter(previous, day, false);
      mark = { day, streak: step.streak, best: step.best, cycles: step.cycles };
    } else {
      mark = { ...previous, day };
    }
    await tx.$executeRaw`
      UPDATE "MissionDay" SET "streak" = ${mark.streak}, "best" = ${mark.best}, "cycles" = ${mark.cycles}
      WHERE "userId" = ${toUserId} AND "day" = ${day}::date`;
    previous = mark;
  }
  const cycles = previous?.cycles ?? 0;
  const lots = Array.from({ length: cycles }, (_, index) => streakLotOf(index + 1).map(({ id }) => id)).flat();
  await unlockCosmetics(tx, toUserId, lots, "STREAK");
}
