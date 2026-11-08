import type { Prisma, PrismaClient } from "../generated/prisma/client";

// The size of the database and of its tables, from PostgreSQL's catalogue: read only. Shared by /admin/stats and
// scripts/measure-save-size.ts.

type Db = PrismaClient | Prisma.TransactionClient;

export type RelationSize = {
  table: string;
  data: number; // bytes of the table itself
  indexes: number;
  toast: number; // TOAST, free space and visibility maps
  total: number; // all of it: pg_total_relation_size
  dead: number; // dead rows waiting for VACUUM
};

/** Heap pages: 8 kB, of which the page header and free space for updates leave about this much to the rows. */
const PAGE_FILL = 0.9;
/** A row's line pointer in its page, and an index entry's header and line pointer. */
const LINE_POINTER = 4;
const INDEX_TUPLE_HEADER = 8;
/** B-tree leaf pages after inserts in no particular order (cuid keys): about two thirds full. */
const INDEX_FILL = 0.7;

const align8 = (bytes: number): number => Math.ceil(bytes / 8) * 8;

/**
 * The compact size of a table, in bytes: its live rows at their real width (pg_column_size, tuple header included), and
 * for each index, an entry per row of the average width of its key columns. A lower estimate than pg_total_relation_size
 * once rows have been deleted or updated: VACUUM makes the space reusable, it does not give it back. Reads the whole
 * table: for scripts (scripts/measure-save-size.ts, scripts/measure-career-weight.ts), never a page.
 */
export async function compactRelationSize(db: Db, table: string, rows: number): Promise<number> {
  if (rows === 0) {
    return 0;
  }
  const quoted = `"${table.replaceAll('"', '""')}"`;
  const [{ width }] = await db.$queryRawUnsafe<{ width: number }[]>(
    `SELECT avg(pg_column_size(t.*))::float8 AS width FROM ${quoted} t`,
  );
  const heap = (rows * align8(width + LINE_POINTER)) / PAGE_FILL;

  const indexes = await db.$queryRaw<{ columns: string[] }[]>`
    SELECT array_agg(a.attname ORDER BY a.attnum)::text[] AS columns
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE n.nspname = 'public' AND c.relname = ${table}
    GROUP BY i.indexrelid`;
  let index = 0;
  for (const { columns } of indexes) {
    const widths = columns.map((column) => `coalesce(avg(pg_column_size(t."${column.replaceAll('"', '""')}")), 0)`).join(" + ");
    const [{ key }] = await db.$queryRawUnsafe<{ key: number }[]>(`SELECT (${widths})::float8 AS key FROM ${quoted} t`);
    index += (rows * (align8(INDEX_TUPLE_HEADER + key) + LINE_POINTER)) / INDEX_FILL;
  }
  return heap + index;
}

/** The whole database, in bytes: what the Neon storage limit counts. */
export async function databaseSize(db: Db): Promise<number> {
  const [{ size }] = await db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
  return Number(size);
}

/** Every table of the public schema, largest first. */
export async function relationSizes(db: Db): Promise<RelationSize[]> {
  const sizes = await db.$queryRaw<
    { table: string; data: bigint; indexes: bigint; toast: bigint; total: bigint; dead: bigint | null }[]
  >`
    SELECT c.relname AS "table",
           pg_relation_size(c.oid) AS data,
           pg_indexes_size(c.oid) AS indexes,
           pg_table_size(c.oid) - pg_relation_size(c.oid) AS toast,
           pg_total_relation_size(c.oid) AS total,
           s.n_dead_tup AS dead
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'`;
  return sizes
    .map((size) => ({
      table: size.table,
      data: Number(size.data),
      indexes: Number(size.indexes),
      toast: Number(size.toast),
      total: Number(size.total),
      dead: Number(size.dead ?? 0),
    }))
    .sort((a, b) => b.total - a.total);
}
