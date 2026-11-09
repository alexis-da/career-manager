import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { describeError } from "../lib/diagnostics";

// The figures of a day that no other table keeps (DailyStat, one row a UTC day, read by /admin): the matches players
// play, live or simulated, the installed app's launches, and, at the day's maintenance, the database's size and what
// the purge deleted. Each one
// statement on the day's row, at the database's clock: never the simulation's.

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Counts a match of a managed club played to its end, live or simulated. Called once the match's transaction is
 * committed, never inside it: the day's row would stay locked for the whole of every player's matchday. A failure costs
 * a count, never the match: logged, not thrown.
 */
export async function countManagedMatch(db: Db, mode: "live" | "simulated"): Promise<void> {
  try {
    if (mode === "live") {
      await db.$executeRaw`
        INSERT INTO "DailyStat" ("day", "liveMatches") VALUES ((now() AT TIME ZONE 'UTC')::date, 1)
        ON CONFLICT ("day") DO UPDATE SET "liveMatches" = "DailyStat"."liveMatches" + 1`;
    } else {
      await db.$executeRaw`
        INSERT INTO "DailyStat" ("day", "simulatedMatches") VALUES ((now() AT TIME ZONE 'UTC')::date, 1)
        ON CONFLICT ("day") DO UPDATE SET "simulatedMatches" = "DailyStat"."simulatedMatches" + 1`;
    }
  } catch (error) {
    console.error(`[countManagedMatch] ${mode}: ${describeError(error)}`);
  }
}

/**
 * Counts a launch of the installed game (displayed standalone, once a session: app/_components/app-shell.tsx). Nothing
 * of the player is kept: one more on the day's row. A failure costs a count: logged, not thrown.
 */
export async function countAppLaunch(db: Db): Promise<void> {
  try {
    await db.$executeRaw`
      INSERT INTO "DailyStat" ("day", "appLaunches") VALUES ((now() AT TIME ZONE 'UTC')::date, 1)
      ON CONFLICT ("day") DO UPDATE SET "appLaunches" = "DailyStat"."appLaunches" + 1`;
  } catch (error) {
    console.error(`[countAppLaunch] ${describeError(error)}`);
  }
}

/** What one call of the purge deleted (src/db/purge.ts). */
export type PurgedToday = { users: number; saves: number; challengeSaves: number };

/**
 * One call of the day's maintenance (app/api/maintenance/purge): what it deleted, added to the day's, and the database's
 * size now, which replaces the day's (the last call of a run leaves the size after the purge).
 */
export async function recordMaintenance(db: Db, purged: PurgedToday): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "DailyStat" ("day", "databaseBytes", "purgedUsers", "purgedSaves", "purgedChallengeSaves")
    VALUES ((now() AT TIME ZONE 'UTC')::date, pg_database_size(current_database()), ${purged.users}, ${purged.saves},
            ${purged.challengeSaves})
    ON CONFLICT ("day") DO UPDATE SET
      "databaseBytes" = EXCLUDED."databaseBytes",
      "purgedUsers" = "DailyStat"."purgedUsers" + EXCLUDED."purgedUsers",
      "purgedSaves" = "DailyStat"."purgedSaves" + EXCLUDED."purgedSaves",
      "purgedChallengeSaves" = "DailyStat"."purgedChallengeSaves" + EXCLUDED."purgedChallengeSaves"`;
}
