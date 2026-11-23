import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { BrowserContext } from "@playwright/test";
import { parse } from "dotenv";
import { Client } from "pg";
import { assertLocalDatabase, pgConnection } from "../src/db/database-url";
import { isoWeekKey } from "../src/lib/iso-week";
import { ADMIN_EMAIL_TEST } from "./constants";

// Direct access to the end-to-end tests' database (DATABASE_URL_TEST, .env.test), only for the users the tests
// create or delete, and the bare saves that fill the week's challenge: deleting a user deletes their saves (and their
// challenge entries) by cascade. Plain pg rather than the Prisma client, an ES module that Playwright's CommonJS loader
// cannot import.

export const USER_COOKIE = "lw_uid";

async function withTestDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const url = parse(readFileSync(".env.test")).DATABASE_URL_TEST;
  if (url === undefined || url === "") {
    throw new Error(".env.test has no DATABASE_URL_TEST");
  }
  assertLocalDatabase(url, "DATABASE_URL_TEST");
  const client = new Client(pgConnection(url));
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** The real names of the world's clubs, as the reference table keeps them: what no public page's HTML may hold. */
export async function realClubNames(): Promise<string[]> {
  return withTestDatabase(async (client) => {
    const { rows } = await client.query<{ name: string }>('SELECT name FROM "Club" ORDER BY name');
    return rows.map(({ name }) => name);
  });
}

/** The first visits counted on a day (YYYY-MM-DD, UTC) from a source, by page of arrival (VisitDay). */
export async function visitsOf(day: string, source: string): Promise<{ page: string; visits: number }[]> {
  return withTestDatabase(async (client) => {
    const { rows } = await client.query<{ page: string; visits: number }>(
      `SELECT "page", "visits" FROM "VisitDay" WHERE "day" = $1::date AND "source" = $2 ORDER BY "page"`,
      [day, source],
    );
    return rows;
  });
}

/** Today's launches of the installed app (DailyStat), at the database's clock; 0 before the first. */
export async function appLaunchesToday(): Promise<number> {
  const result = await withTestDatabase((client) =>
    client.query<{ launches: number }>(
      `SELECT "appLaunches" AS launches FROM "DailyStat" WHERE "day" = (now() AT TIME ZONE 'UTC')::date`,
    ),
  );
  return result.rows[0]?.launches ?? 0;
}

/** Deletes the errors a test provoked: those whose message holds this word. */
export async function deleteErrors(word: string): Promise<void> {
  await withTestDatabase((client) => client.query(`DELETE FROM "ErrorDay" WHERE strpos("message", $1) > 0`, [word]));
}

/** Deletes the event cleanup's passes recorded from this time on, at the database's clock: a test's own. */
export async function deleteCleanupPassesSince(since: Date): Promise<void> {
  await withTestDatabase((client) => client.query(`DELETE FROM "CleanupPass" WHERE "at" >= $1`, [since]));
}

/**
 * Deletes the « archive » task's passes recorded since then: a test's own counts. Their time is kept in UTC (now() AT TIME
 * ZONE 'UTC'), whatever the server's zone: the instant is converted the same way.
 */
export async function deleteArchivePassesSince(since: Date): Promise<void> {
  await withTestDatabase((client) => client.query(`DELETE FROM "ArchivePass" WHERE "at" >= ($1::timestamptz AT TIME ZONE 'UTC')`, [since]));
}

/**
 * Sets a player's missions of today (missions v2): those of each tier given, not started; with a streak of
 * `streakYesterday` days counted yesterday. Everything of their missions and tokens before goes.
 */
export async function setTodaysMissions(
  userId: string,
  tasks: Partial<Record<"EASY" | "MEDIUM" | "HARD", { kind: string; target?: number }>>,
  streakYesterday = 0,
): Promise<void> {
  await withTestDatabase(async (client) => {
    await client.query(`DELETE FROM "MissionTask" WHERE "userId" = $1`, [userId]);
    await client.query(`DELETE FROM "MissionDay" WHERE "userId" = $1`, [userId]);
    await client.query(`DELETE FROM "DailyMission" WHERE "userId" = $1`, [userId]);
    for (const [tier, { kind, target = 1 }] of Object.entries(tasks)) {
      await client.query(
        `INSERT INTO "MissionTask" ("userId", "day", "tier", "kind", "target")
         VALUES ($1, (now() AT TIME ZONE 'UTC')::date, $2::"MissionTier", $3::"MissionKind", $4)`,
        [userId, tier, kind, target],
      );
    }
    if (streakYesterday > 0) {
      await client.query(
        `INSERT INTO "MissionDay" ("userId", "day", "done", "countedAt", "streak", "best", "cycles")
         VALUES ($1, (now() AT TIME ZONE 'UTC')::date - 1, 1, (now() AT TIME ZONE 'UTC') - interval '1 day', $2, $2, 0)`,
        [userId, streakYesterday],
      );
    }
  });
}

/** Gives a player tokens, through their journal as the game would: the balance and its entry together. */
export async function giveTokens(userId: string, amount: number): Promise<void> {
  await withTestDatabase(async (client) => {
    await client.query(
      `INSERT INTO "TokenEntry" ("id", "userId", "key", "reason", "amount") VALUES (gen_random_uuid()::text, $1, $2, 'WELCOME', $3)`,
      [userId, `e2e:${Date.now()}:${amount}`, amount],
    );
    await client.query(`UPDATE "User" SET "tokens" = "tokens" + $2 WHERE "id" = $1`, [userId, amount]);
  });
}

/** The database's clock now: what a test's rows are dated from. */
export async function databaseNow(): Promise<Date> {
  return withTestDatabase(async (client) => (await client.query<{ now: Date }>(`SELECT now() AS now`)).rows[0].now);
}

/** Deletes the counts of the sources a test made up: those starting with this prefix. */
export async function deleteVisits(sourcePrefix: string): Promise<void> {
  await withTestDatabase((client) => client.query(`DELETE FROM "VisitDay" WHERE starts_with("source", $1)`, [sourcePrefix]));
}

/** What a user's creation kept of their arrival (User.source…). */
export async function arrivalOfUser(id: string): Promise<Record<string, string | null>> {
  return withTestDatabase(async (client) => {
    const { rows } = await client.query<Record<string, string | null>>(
      `SELECT "source", "referrerDomain", "landingPage", "locale", "device"::text AS "device" FROM "User" WHERE "id" = $1`,
      [id],
    );
    return rows[0] ?? {};
  });
}

/**
 * An anonymous user made directly in the database, without a save, last seen at this time (an old one to purge, a
 * fresh one to sign a cookie for). Not simulation code: a random id.
 */
export async function createAnonymousUser(lastSeenAt: Date, { withSave = false }: { withSave?: boolean } = {}): Promise<string> {
  const id = `e2e-anon-${randomUUID()}`;
  await withTestDatabase(async (client) => {
    await client.query(
      `INSERT INTO "User" ("id", "kind", "createdAt", "lastSeenAt") VALUES ($1, 'ANONYMOUS', $2::timestamp(3), $2::timestamp(3))`,
      // An ISO string: a Date parameter would be sent in the local time zone, and the columns hold UTC.
      [id, lastSeenAt.toISOString()],
    );
    if (withSave) {
      // A bare save, enough for the purge to count it: one without a save would go after 24 hours whatever its days.
      await client.query(
        `INSERT INTO "Save" ("id", "ownerId", "name", "managerName", "seed", "worldVersion", "currentDate", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'E2E purge', 'Test', 'e2e-purge', 2, '2026-07-01T00:00:00.000Z'::timestamp(3),
                 now() AT TIME ZONE 'UTC')`,
        [id],
      );
    }
  });
  return id;
}

/**
 * A user with a Google account made directly in the database: nothing here goes through Google, and the lw_uid cookie
 * resolves any user. Its e-mail is unique, as the column wants it. Not simulation code: a random id.
 */
export async function createRegisteredUser(name: string): Promise<{ id: string; email: string }> {
  const id = `e2e-google-${randomUUID()}`;
  const email = `${id}@e2e.test`;
  await withTestDatabase((client) =>
    client.query(
      `INSERT INTO "User" ("id", "kind", "name", "email", "createdAt", "lastSeenAt")
       VALUES ($1, 'REGISTERED', $2, $3, $4::timestamp(3), $4::timestamp(3))`,
      // An ISO string: a Date parameter would be sent in the local time zone, and the columns hold UTC.
      [id, name, email, new Date().toISOString()],
    ),
  );
  return { id, email };
}

/**
 * The administrator of the test server (ADMIN_EMAIL_TEST, playwright.config.ts): a Google account made in the database
 * once, then kept from run to run.
 */
export async function ensureAdminUser(): Promise<string> {
  const id = "e2e-admin";
  await withTestDatabase((client) =>
    client.query(
      `INSERT INTO "User" ("id", "kind", "name", "email", "createdAt", "lastSeenAt")
       VALUES ($1, 'REGISTERED', 'Admin E2E', $2, $3::timestamp(3), $3::timestamp(3))
       ON CONFLICT ("id") DO NOTHING`,
      // An ISO string: a Date parameter would be sent in the local time zone, and the columns hold UTC.
      [id, ADMIN_EMAIL_TEST, new Date().toISOString()],
    ),
  );
  return id;
}

/** Whether a user is still in the database. */
export async function userExists(id: string): Promise<boolean> {
  const result = await withTestDatabase((client) => client.query(`SELECT 1 FROM "User" WHERE "id" = $1`, [id]));
  return (result.rowCount ?? 0) > 0;
}

/** The lw_uid cookie value of a user, signed as the test server signs it (src/auth/identity.ts, AUTH_SECRET of .env.test). */
export function signedUserCookie(userId: string): string {
  const secret = parse(readFileSync(".env.test")).AUTH_SECRET?.trim();
  if (secret === undefined || secret === "") {
    throw new Error(".env.test has no AUTH_SECRET");
  }
  return `${userId}.${createHmac("sha256", secret).update(`lw_uid:${userId}`).digest("base64url")}`;
}

/** The user id in a browser context's lw_uid cookie (its signature is the server's business), or null. */
export async function userIdOf(context: BrowserContext): Promise<string | null> {
  const cookie = (await context.cookies()).find((candidate) => candidate.name === USER_COOKIE);
  const dot = cookie?.value.lastIndexOf(".") ?? -1;
  return cookie === undefined || dot <= 0 ? null : cookie.value.slice(0, dot);
}

/** Deletes users, and their saves with them. */
export async function deleteUsers(ids: readonly (string | null)[]): Promise<void> {
  const known = ids.filter((id): id is string => id !== null);
  if (known.length > 0) {
    await withTestDatabase((client) => client.query(`DELETE FROM "User" WHERE "id" = ANY($1::text[])`, [known]));
  }
}

/**
 * Deletes the anonymous users created since a date that no longer own any save: the ones the specs left behind once
 * they deleted their saves through the page. A user with a save is never touched.
 */
export async function deleteUsersLeftSince(since: Date): Promise<number> {
  const result = await withTestDatabase((client) =>
    client.query(
      `DELETE FROM "User" u
       WHERE u."kind" = 'ANONYMOUS' AND u."createdAt" >= $1::timestamp(3)
         AND NOT EXISTS (SELECT 1 FROM "Save" s WHERE s."ownerId" = u."id")`,
      // An ISO string: a Date parameter would be sent in the local time zone, and createdAt is stored in UTC.
      [since.toISOString()],
    ),
  );
  return result.rowCount ?? 0;
}

/**
 * Passes the tutorial of a save created from the home page (docs/design/tutoriel.md), as its « Passer le tutoriel » does:
 * the specs that do not test it see the whole game. Whether there was one running.
 */
export async function skipTutorialOf(saveId: string): Promise<boolean> {
  const result = await withTestDatabase((client) =>
    client.query(
      `UPDATE "Tutorial" SET "skippedAt" = now(), "endedAt" = now(), "endedBy" = 'SKIPPED'
       WHERE "saveId" = $1 AND "endedBy" IS NULL`,
      [saveId],
    ),
  );
  return (result.rowCount ?? 0) > 0;
}

export type TutorialRow = {
  day1At: Date | null;
  endedBy: string | null;
  skippedStep: string | null;
  steps: Record<string, { shows: number; outcome: string | null }>;
};

/** The tutorial a save follows, as the database keeps it, its steps by key; null without one. */
export async function tutorialOf(saveId: string): Promise<TutorialRow | null> {
  return withTestDatabase(async (client) => {
    const tutorial = await client.query<{ userId: string; day1At: Date | null; endedBy: string | null; skippedStep: string | null }>(
      `SELECT "userId", "day1At", "endedBy", "skippedStep" FROM "Tutorial" WHERE "saveId" = $1`,
      [saveId],
    );
    const [row] = tutorial.rows;
    if (row === undefined) {
      return null;
    }
    const steps = await client.query<{ step: string; shows: number; outcome: string | null }>(
      `SELECT "step", "shows", "outcome" FROM "TutorialStep" WHERE "userId" = $1`,
      [row.userId],
    );
    return {
      day1At: row.day1At,
      endedBy: row.endedBy,
      skippedStep: row.skippedStep,
      steps: Object.fromEntries(steps.rows.map(({ step, shows, outcome }) => [step, { shows, outcome }])),
    };
  });
}

/**
 * Moves the tutorial a save follows back by whole days, as if they had gone by since its first day: its start, its first
 * day's end and when each step was first shown. The following days' steps come by the UTC day (docs/design/tutoriel.md).
 */
export async function shiftTutorialDays(saveId: string, days: number): Promise<void> {
  await withTestDatabase(async (client) => {
    const shift = `${days} days`;
    const tutorial = await client.query<{ userId: string }>(
      `UPDATE "Tutorial" SET "startedAt" = "startedAt" - $2::interval, "day1At" = "day1At" - $2::interval
       WHERE "saveId" = $1 RETURNING "userId"`,
      [saveId, shift],
    );
    const [row] = tutorial.rows;
    if (row !== undefined) {
      await client.query(`UPDATE "TutorialStep" SET "shownAt" = "shownAt" - $2::interval WHERE "userId" = $1`, [row.userId, shift]);
    }
  });
}

/**
 * Moves a save to another day without playing the days in between, for a screen that reads no more than the date: the
 * market once its window has closed. Their fixtures stay unplayed: a test that does this plays nothing afterwards.
 */
export async function setSaveDate(saveId: string, date: Date): Promise<void> {
  await withTestDatabase((client) =>
    client.query(
      `UPDATE "Save" SET "currentDate" = $1::timestamp(3) WHERE "id" = $2`,
      // An ISO string: a Date parameter would be sent in the local time zone, and the columns hold UTC.
      [date.toISOString(), saveId],
    ),
  );
}

/**
 * Sets the wage room of a save's managed club, its wage budget less its payroll, without signing anyone: the market of a
 * club whose wage room pays little, or nothing (a negative room: its payroll over its wage budget).
 */
export async function setManagedWageRoom(saveId: string, room: number): Promise<void> {
  await withTestDatabase((client) =>
    client.query(
      `UPDATE "ClubSave" AS c
       SET "wageBudget" = $2::int + COALESCE((SELECT sum(p."wage") FROM "PlayerSave" p WHERE p."saveId" = $1 AND p."clubSaveId" = c."id"), 0)
       WHERE c."saveId" = $1 AND c."isManaged"`,
      [saveId, room],
    ),
  );
}

/**
 * The managed club's line of a save's first season, as the page of a season reads it, the season itself left in progress:
 * a test that does this plays nothing afterwards. Returns the season's id.
 */
export async function insertSeasonResult(saveId: string): Promise<string> {
  const result = await withTestDatabase((client) =>
    client.query<{ seasonId: string }>(
      `INSERT INTO "SeasonResult" ("id", "saveId", "seasonId", "competitionId", "rank", "points", "played", "won", "drawn", "lost",
                                   "goalsFor", "goalsAgainst", "trophies", "formation")
       SELECT gen_random_uuid()::text, c."saveId", s."id", s."competitionId", 9, 50, 34, 14, 8, 12, 45, 44, '{}', c."formation"
       FROM "ClubSave" c JOIN "Season" s ON s."saveId" = c."saveId" AND s."competitionId" = c."competitionId"
       WHERE c."saveId" = $1 AND c."isManaged"
       RETURNING "seasonId"`,
      [saveId],
    ),
  );
  const seasonId = result.rows[0]?.seasonId;
  if (seasonId === undefined) {
    throw new Error(`No season of the managed club in save ${saveId}`);
  }
  return seasonId;
}

/** The demo user's id and the demo save's seed: src/db/test-support.ts, which Playwright's loader cannot import. */
export const DEMO_USER_ID = "demo-user";
const DEMO_SEED = "demo-2026-27";

/**
 * The demo save's id. The database tests create it (ensureDemoSave, npm run test); the end-to-end tests only read it,
 * and refuse to start without it.
 */
export async function demoSaveId(): Promise<string> {
  const result = await withTestDatabase((client) =>
    client.query<{ id: string }>(
      `SELECT "id" FROM "Save" WHERE "seed" = $1 AND "ownerId" = $2 ORDER BY "createdAt" LIMIT 1`,
      [DEMO_SEED, DEMO_USER_ID],
    ),
  );
  const id = result.rows[0]?.id;
  if (id === undefined) {
    throw new Error("No demo save in the test database: run npm run test first, which creates it.");
  }
  return id;
}

/**
 * A user's score in the real week's challenge (created by the page /challenge beforehand), without a save: a line of its
 * ranking, which deleting the user takes away.
 */
export async function submitWeekScore(userId: string, score: { points: number; goalDiff: number; goalsFor: number }): Promise<void> {
  // Not simulation code: the week the test server serves.
  const weekKey = isoWeekKey(new Date());
  const result = await withTestDatabase((client) =>
    client.query(
      `INSERT INTO "ChallengeEntry" ("id", "challengeId", "userId", "matchdaysPlayed", "points", "goalDiff", "goalsFor", "submittedAt")
       SELECT gen_random_uuid()::text, c."id", $1, c."horizonMatchdays", $2, $3, $4, now() AT TIME ZONE 'UTC'
       FROM "Challenge" c WHERE c."weekKey" = $5`,
      [userId, score.points, score.goalDiff, score.goalsFor, weekKey],
    ),
  );
  if (result.rowCount === 0) {
    throw new Error(`No challenge for ${weekKey}: open /challenge first, which creates it`);
  }
}

/**
 * Fills the real week's challenge (created by the page /challenge beforehand) with bare saves of a user up to `total`,
 * so that the page finds it full: rows without a world, which deleting the user takes away. How many were added.
 */
export async function fillWeekChallenge(ownerId: string, total: number): Promise<number> {
  // Not simulation code: the week the test server serves.
  const weekKey = isoWeekKey(new Date());
  return withTestDatabase(async (client) => {
    const challenge = await client.query<{ id: string; saves: string }>(
      `SELECT c."id", (SELECT count(*) FROM "Save" s WHERE s."challengeId" = c."id")::text AS "saves"
       FROM "Challenge" c WHERE c."weekKey" = $1`,
      [weekKey],
    );
    const row = challenge.rows[0];
    if (row === undefined) {
      throw new Error(`No challenge for ${weekKey}: open /challenge first, which creates it`);
    }
    const missing = Math.max(0, total - Number(row.saves));
    await client.query(
      `INSERT INTO "Save" ("id", "ownerId", "name", "managerName", "seed", "worldVersion", "currentDate", "challengeId", "updatedAt")
       SELECT gen_random_uuid()::text, $1, 'E2E défi complet', 'Test', 'e2e-challenge-full', 2,
              '2026-07-01T00:00:00.000Z'::timestamp(3), $2, now() AT TIME ZONE 'UTC'
       FROM generate_series(1, $3::int)`,
      [ownerId, row.id, missing],
    );
    return missing;
  });
}

/**
 * A save of the real week's challenge (created by the page /challenge beforehand) for a user, as bare as those of
 * fillWeekChallenge but for its managed club, the only row of a world the home page's list reads. Without an entry: nothing
 * of it reaches the ranking. Deleting the user takes it away.
 */
export async function insertWeekChallengeSave(ownerId: string): Promise<void> {
  // Not simulation code: the week the test server serves.
  const weekKey = isoWeekKey(new Date());
  const result = await withTestDatabase((client) =>
    client.query(
      `WITH week AS (
         SELECT c."id", c."clubId", club."competitionId"
         FROM "Challenge" c JOIN "Club" club ON club."id" = c."clubId"
         WHERE c."weekKey" = $2
       ), save AS (
         INSERT INTO "Save" ("id", "ownerId", "name", "managerName", "seed", "worldVersion", "currentDate", "challengeId", "updatedAt")
         SELECT gen_random_uuid()::text, $1, '', 'Test', 'e2e-challenge-listed', 2,
                '2026-07-01T00:00:00.000Z'::timestamp(3), week."id", now() AT TIME ZONE 'UTC'
         FROM week
         RETURNING "id"
       )
       INSERT INTO "ClubSave" ("id", "saveId", "clubId", "competitionId", "isManaged")
       SELECT gen_random_uuid()::text, save."id", week."clubId", week."competitionId", true
       FROM save CROSS JOIN week`,
      [ownerId, weekKey],
    ),
  );
  if (result.rowCount === 0) {
    throw new Error(`No challenge for ${weekKey}: open /challenge first, which creates it`);
  }
}
