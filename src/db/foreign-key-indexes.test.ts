import "dotenv/config";
import { describe, expect, it } from "vitest";

/** The world's reference tables: the game never deletes from them, so nothing ever checks the keys that point at them. */
const REFERENCE_TABLES = ['"Club"', '"Competition"', '"Player"'];

// Runs against DATABASE_URL, on the database's own catalog; skipped when it is not set. The client module is imported
// lazily because it throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the foreign keys", () => {
  it("each have an index that starts with their columns, but those that point at a reference table", async () => {
    const { prisma } = await import("./client");
    // PostgreSQL applies a cascade, or checks a Restrict, one deleted row at a time: without such an index, each of
    // those queries scans the whole referencing table, every save's rows included (a save took 30 s to delete).
    const unindexed = await prisma.$queryRaw<{ referencing: string; columns: string; referenced: string }[]>`
      SELECT c.conrelid::regclass::text AS referencing,
             (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
                FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS columns,
             c.confrelid::regclass::text AS referenced
        FROM pg_constraint c
       WHERE c.contype = 'f'
         AND c.connamespace = 'public'::regnamespace
         AND NOT EXISTS (
           SELECT 1
             FROM pg_index i
            WHERE i.indrelid = c.conrelid
              AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
              AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)
       ORDER BY 1, 2`;
    await prisma.$disconnect();

    expect(unindexed.filter((key) => !REFERENCE_TABLES.includes(key.referenced))).toEqual([]);
    // The query sees the keys: those of the reference tables, which need no index.
    expect(unindexed.length).toBeGreaterThan(0);
  });
});
