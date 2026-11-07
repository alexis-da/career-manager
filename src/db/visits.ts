import type { Prisma, PrismaClient } from "../generated/prisma/client";

// The visitors' first visits of the public pages (src/lib/arrival.ts), counted by UTC day, source and page of arrival: one
// row each, totals without anything personal (VisitDay). Written once a page is sent (app/_components/count-arrival.tsx).

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The most sources a day keeps apart: a link's ?ref= is anyone's to write, and each new one would add rows. Past them, a
 * new source of the day counts in OTHER_SOURCES. Read without a lock: two first visits at once may pass it by one.
 */
export const MAX_VISIT_SOURCES_PER_DAY = 100;

/** The sources of a day past its first MAX_VISIT_SOURCES_PER_DAY: no link's source can be written so (src/lib/arrival.ts). */
export const OTHER_SOURCES = "(other)";

/** Counts one first visit of a page, on its day (YYYY-MM-DD, UTC), from a source. One statement. */
export async function recordVisit(db: Db, { day, source, page }: { day: string; source: string; page: string }): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "VisitDay" ("day", "source", "page", "visits")
    SELECT ${day}::date,
           CASE WHEN EXISTS (SELECT 1 FROM "VisitDay" WHERE "day" = ${day}::date AND "source" = ${source})
                  OR (SELECT count(DISTINCT "source") FROM "VisitDay" WHERE "day" = ${day}::date) < ${MAX_VISIT_SOURCES_PER_DAY}
                THEN ${source} ELSE ${OTHER_SOURCES} END,
           ${page},
           1
    ON CONFLICT ("day", "source", "page") DO UPDATE SET "visits" = "VisitDay"."visits" + 1`;
}
