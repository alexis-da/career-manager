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
