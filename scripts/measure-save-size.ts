/**
 * Size of a save in the database, to set the number of saves a free Neon plan holds (npm run measure:size).
 * Read only: SELECT statements, nothing written. Runs against DATABASE_URL, whose host it prints first.
 *
 * A save's share of a table is the table's total size (data, indexes, TOAST) × its share of the rows. It counts
 * the space dead rows still take (deleted saves before a VACUUM), so it is an upper bound; the tables' dead rows
 * are shown alongside.
 */
import "dotenv/config";
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/db/client";

const MB = 1024 * 1024;
/** The free plan's storage, read as 1 Go = 1024 Mo, and the margin kept for growth, indexes and VACUUM. */
const STORAGE_LIMIT = 1024 * MB;
const MARGIN = 0.3;

const REFERENCE_TABLES = ["Competition", "Club", "Player"];

/** Tables with a saveId column, found in the database rather than listed by hand. */
const SAVE_ID_COLUMN = "saveId";
/** Game tables without saveId, reached through another table's saveId. */
const INDIRECT_TABLES: Record<string, Prisma.Sql> = {
  MatchEvent: Prisma.sql`SELECT f."saveId", count(*)::bigint AS rows FROM "MatchEvent" e JOIN "Fixture" f ON f."id" = e."fixtureId" GROUP BY f."saveId"`,
  Save: Prisma.sql`SELECT "id" AS "saveId", 1::bigint AS rows FROM "Save"`,
};

type TableSize = {
  table: string;
  rows: number;
  data: number;
  indexes: number;
  toast: number;
  total: number;
  dead: number;
  compact: number; // what the live rows and their indexes would take once packed, without the space freed rows left
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
 * The compact size of a table: its live rows at their real width (pg_column_size, tuple header included), and for
 * each index, an entry per row of the average width of its key columns. A lower estimate than pg_total_relation_size
 * once rows have been deleted: VACUUM makes the space reusable, it does not give it back.
 */
async function compactSize(table: string, rows: number): Promise<number> {
  if (rows === 0) {
    return 0;
  }
  const quoted = Prisma.raw(`"${table}"`);
  const [{ width }] = await prisma.$queryRaw<{ width: number }[]>(
    Prisma.sql`SELECT avg(pg_column_size(t.*))::float8 AS width FROM ${quoted} t`,
  );
  const heap = (rows * align8(width + LINE_POINTER)) / PAGE_FILL;

  const indexes = await prisma.$queryRaw<{ columns: string[] }[]>`
    SELECT array_agg(a.attname ORDER BY a.attnum)::text[] AS columns
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE n.nspname = 'public' AND c.relname = ${table}
    GROUP BY i.indexrelid`;
  let index = 0;
  for (const { columns } of indexes) {
    const widths = columns.map((column) => `coalesce(avg(pg_column_size(t."${column}")), 0)`).join(" + ");
    const [{ key }] = await prisma.$queryRaw<{ key: number }[]>(
      Prisma.sql`SELECT (${Prisma.raw(widths)})::float8 AS key FROM ${quoted} t`,
    );
    index += (rows * (align8(INDEX_TUPLE_HEADER + key) + LINE_POINTER)) / INDEX_FILL;
  }
  return heap + index;
}

const mb = (bytes: number): string => (bytes / MB).toFixed(1);

function printTable(title: string, headers: string[], rows: (string | number)[][]): void {
  const cells = [headers, ...rows.map((row) => row.map(String))];
  const widths = headers.map((_, column) => Math.max(...cells.map((row) => row[column].length)));
  const line = (row: string[]) => row.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join("  ");
  console.log(`\n${title}`);
  console.log(line(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of cells.slice(1)) {
    console.log(line(row));
  }
}

async function tableSizes(): Promise<TableSize[]> {
  const sizes = await prisma.$queryRaw<
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
  const result: TableSize[] = [];
  for (const size of sizes) {
    // Exact counts: the tables are small enough, and reltuples is only an estimate.
    const [{ rows }] = await prisma.$queryRaw<{ rows: bigint }[]>(Prisma.sql`SELECT count(*)::bigint AS rows FROM ${Prisma.raw(`"${size.table}"`)}`);
    result.push({
      table: size.table,
      rows: Number(rows),
      data: Number(size.data),
      indexes: Number(size.indexes),
      toast: Number(size.toast),
      total: Number(size.total),
      dead: Number(size.dead ?? 0),
      compact: await compactSize(size.table, Number(rows)),
    });
  }
  return result.sort((a, b) => b.total - a.total);
}

/** Rows per save of each game table: tables with a saveId column, then the ones reached through another. */
async function rowsPerSave(tables: readonly TableSize[]): Promise<Map<string, Map<string, number>>> {
  const columns = await prisma.$queryRaw<{ table: string }[]>`
    SELECT table_name AS "table" FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = ${SAVE_ID_COLUMN}`;
  const queries = new Map<string, Prisma.Sql>(Object.entries(INDIRECT_TABLES));
  for (const { table } of columns) {
    queries.set(table, Prisma.sql`SELECT "saveId", count(*)::bigint AS rows FROM ${Prisma.raw(`"${table}"`)} GROUP BY "saveId"`);
  }
  const known = new Set(tables.map((table) => table.table));
  const result = new Map<string, Map<string, number>>();
  for (const [table, query] of queries) {
    if (!known.has(table)) {
      continue;
    }
    const rows = await prisma.$queryRaw<{ saveId: string; rows: bigint }[]>(query);
    result.set(table, new Map(rows.map((row) => [row.saveId, Number(row.rows)])));
  }
  return result;
}

/** Least squares line through (x, y): y = intercept + slope × x. */
function fitLine(points: readonly { x: number; y: number }[]): { intercept: number; slope: number } | null {
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  const spread = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  if (n < 2 || spread === 0) {
    return null;
  }
  const slope = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / spread;
  return { intercept: meanY - slope * meanX, slope };
}

type Measure = "total" | "compact";

const MEASURE_LABEL: Record<Measure, string> = {
  total: "réel (pg_total_relation_size, place libérée comprise)",
  compact: "compact (lignes vivantes et index tassés)",
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  console.log(`Base mesurée : ${url === undefined ? "(DATABASE_URL absente)" : new URL(url).host}`);
  console.log("1 Mo = 1 048 576 octets ; 1 Go = 1024 Mo.");

  // a. The whole database.
  const [{ size }] = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
  console.log(`\na. Taille totale de la base : ${mb(Number(size))} Mo`);

  // b. Each table.
  const tables = await tableSizes();
  printTable(
    "b. Tables (Mo), par total décroissant",
    ["Table", "Lignes", "Données", "Index", "TOAST+", "Total", "Lignes mortes", "Compact", "Octets/ligne réel", "Octets/ligne compact"],
    tables.map((t) => [
      t.table,
      t.rows,
      mb(t.data),
      mb(t.indexes),
      mb(t.toast),
      mb(t.total),
      t.dead,
      mb(t.compact),
      t.rows === 0 ? "–" : Math.round(t.total / t.rows),
      t.rows === 0 ? "–" : Math.round(t.compact / t.rows),
    ]),
  );
  console.log("TOAST+ : TOAST et cartes d'espace libre et de visibilité. Lignes mortes : en attente de VACUUM.");

  // c. Game tables, per save.
  const perSave = await rowsPerSave(tables);
  const saves = await prisma.$queryRaw<{ id: string; name: string; currentDate: Date; matchdays: bigint; seasons: bigint }[]>`
    SELECT s."id", s."name", s."currentDate",
           (SELECT count(DISTINCT f."scheduledAt") FROM "Fixture" f WHERE f."saveId" = s."id" AND f."played") AS matchdays,
           (SELECT count(DISTINCT se."startYear") FROM "Season" se WHERE se."saveId" = s."id" AND se."completed") AS seasons
    FROM "Save" s ORDER BY s."currentDate", s."name"`;
  const sizeOf = new Map(tables.map((table) => [table.table, table]));
  const gameTables = [...perSave.keys()].sort((a, b) => (sizeOf.get(b)?.total ?? 0) - (sizeOf.get(a)?.total ?? 0));
  /** A save's share of a table: the table's size × the save's share of its rows. */
  const bytesOf = (measure: Measure, table: string, saveId: string): number => {
    const t = sizeOf.get(table);
    const rows = perSave.get(table)?.get(saveId) ?? 0;
    return t === undefined || t.rows === 0 ? 0 : (t[measure] * rows) / t.rows;
  };
  const label = (save: { name: string }) => (save.name.length > 26 ? `${save.name.slice(0, 25)}…` : save.name);

  printTable(
    "c. Lignes par partie, tables de partie",
    ["Table", ...saves.map(label)],
    gameTables.map((table) => [table, ...saves.map((save) => perSave.get(table)?.get(save.id) ?? 0)]),
  );
  for (const measure of ["total", "compact"] as const) {
    printTable(
      `c. Octets estimés par partie (Mo), ${MEASURE_LABEL[measure]} × part des lignes`,
      ["Table", ...saves.map(label)],
      gameTables.map((table) => [table, ...saves.map((save) => mb(bytesOf(measure, table, save.id)))]),
    );
  }

  // d. Each save.
  const totals = saves.map((save) => ({
    ...save,
    matchdays: Number(save.matchdays),
    seasons: Number(save.seasons),
    total: gameTables.reduce((sum, table) => sum + bytesOf("total", table, save.id), 0),
    compact: gameTables.reduce((sum, table) => sum + bytesOf("compact", table, save.id), 0),
  }));
  printTable(
    "d. Parties",
    ["Id", "Nom", "Date en jeu", "Journées jouées", "Saisons terminées", "Réel (Mo)", "Compact (Mo)"],
    totals.map((save) => [
      save.id,
      label(save),
      save.currentDate.toISOString().slice(0, 10),
      save.matchdays,
      save.seasons,
      mb(save.total),
      mb(save.compact),
    ]),
  );
  const averageOf = (measure: Measure) => (totals.length === 0 ? 0 : totals.reduce((sum, save) => sum + save[measure], 0) / totals.length);
  const referenceOf = (measure: Measure) => REFERENCE_TABLES.reduce((sum, table) => sum + (sizeOf.get(table)?.[measure] ?? 0), 0);
  console.log(`\nMoyenne par partie : ${mb(averageOf("total"))} Mo réel, ${mb(averageOf("compact"))} Mo compact, sur ${totals.length} partie(s)`);
  console.log(
    `Tables de référence (${REFERENCE_TABLES.join(", ")}), partagées par toutes les parties : ${mb(referenceOf("total"))} Mo réel, ${mb(referenceOf("compact"))} Mo compact`,
  );

  // e. Projection: size = at creation + per matchday × matchdays played, a line through the saves measured.
  const [{ perSeason }] = await prisma.$queryRaw<{ perSeason: bigint }[]>`
    SELECT coalesce(max(dates), 0)::bigint AS "perSeason" FROM (
      SELECT count(DISTINCT "scheduledAt") AS dates FROM "Fixture" GROUP BY "saveId", "seasonId"
    ) AS seasons`;
  const matchdaysPerSeason = Number(perSeason);
  const distinctMatchdays = new Set(totals.map((save) => save.matchdays)).size;
  console.log(
    `\ne. Projection : droite ajustée sur ${totals.length} partie(s), ${distinctMatchdays} nombre(s) de journées différent(s), ${matchdaysPerSeason} journées par saison`,
  );
  if (totals.length < 3 || distinctMatchdays < 3) {
    console.log("Attention : échantillon trop petit pour une droite fiable (moins de trois nombres de journées différents).");
  }
  const rows: (string | number)[][] = [];
  for (const measure of ["total", "compact"] as const) {
    const fit = fitLine(totals.map((save) => ({ x: save.matchdays, y: save[measure] })));
    if (fit === null) {
      console.log("Échantillon trop petit : il faut au moins deux parties à des nombres de journées différents.");
      return;
    }
    const atCreation = Math.max(0, fit.intercept);
    const afterSeason = atCreation + fit.slope * matchdaysPerSeason;
    const usable = STORAGE_LIMIT * (1 - MARGIN) - referenceOf(measure);
    rows.push(
      [`${measure === "total" ? "Réel" : "Compact"} : à la création (0 journée)`, mb(atCreation), Math.floor(usable / atCreation)],
      [`${measure === "total" ? "Réel" : "Compact"} : par journée jouée`, (fit.slope / MB).toFixed(3), "–"],
      [`${measure === "total" ? "Réel" : "Compact"} : par saison jouée`, mb(fit.slope * matchdaysPerSeason), "–"],
      [`${measure === "total" ? "Réel" : "Compact"} : après une saison complète`, mb(afterSeason), Math.floor(usable / afterSeason)],
    );
  }
  printTable("", ["", "Mo par partie", `Parties dans 1 Go, ${MARGIN * 100} % de marge`], rows);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
