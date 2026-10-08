import { readFileSync } from "node:fs";
import type { BrowserContext } from "@playwright/test";
import { parse } from "dotenv";
import { Client } from "pg";

// Direct access to the end-to-end tests' database (DATABASE_URL_TEST, .env.test), only to delete the users the tests
// create: deleting a user deletes their saves by cascade. Plain pg rather than the Prisma client, an ES module that
// Playwright's CommonJS loader cannot import.

const USER_COOKIE = "lw_uid";

async function withTestDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const url = parse(readFileSync(".env.test")).DATABASE_URL_TEST;
  if (url === undefined || url === "") {
    throw new Error(".env.test has no DATABASE_URL_TEST");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
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
