import { Client } from "pg";
import { assertLocalDatabase, pgConnection } from "./database-url";

// Advisory locks of the database tests that must not run at the same time, though Vitest runs their files in parallel.
// Session locks, each on a connection of its own: held from a file's setup to its teardown, released with the connection
// if the process dies. Never imports the Prisma client, which throws without DATABASE_URL: a file imports this lazily.

export const TEST_LOCKS = {
  // The files whose figures start at the first day the tables track, src/db/stats.test.ts (retention) and
  // src/db/admin-dashboard.test.ts: in parallel, the oldest days of one would be the other's first.
  firstTrackedDays: 2_026_110_801,
} as const;

/** Waits for a test lock, then holds it: returns its release. */
export async function holdTestLock(key: number): Promise<() => Promise<void>> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is not set");
  }
  assertLocalDatabase(url, "DATABASE_URL");
  const client = new Client(pgConnection(url));
  await client.connect();
  await client.query("SELECT pg_advisory_lock($1)", [key]);
  return async () => {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    } finally {
      await client.end();
    }
  };
}
