/**
 * Weight of a career, table by table (npm run measure:weight -- [--seasons=3] [--seed=S] [--club=slug] [--out=file]
 * [--keep] [--vacuum-every=N] [--archive] [--no-europe]): creates a worldVersion 2 save on the local database (the demo club and seed unless told otherwise, cups
 * and European competitions as the game gives them, without the European ones at any season with --no-europe, to compare) and plays N complete seasons (default 3), the assistant deciding everything, the managed
 * club's contracts included (assistantContracts), each followed by advanceToNextSeason. At the creation and after each
 * season's transition, it prints each table's rows, data, indexes and TOAST, the real size (pg_total_relation_size,
 * after a VACUUM ANALYZE: what the database keeps, the space updates left reusable included) and the compact one
 * (live rows and their indexes packed, an estimate), each index's size, and what grew in the season; then details of
 * the largest tables (players by state, events by kind, stats rows without a match, transfers by type, updates).
 *
 * Meant for a dedicated empty database (the reference tables and this save only): the sizes are then the save's own.
 * It refuses a database that already holds a save, and any but a local one (src/db/client.ts refuses the others,
 * this script even with ALLOW_REMOTE_DB=1). --out writes the snapshots there as JSON, to compare two runs; --keep
 * keeps the save and its owner (deleted otherwise). --vacuum-every=N runs a VACUUM of the tables a season rewrites every N
 * matchdays, as autovacuum does on a server where players take their time; without it, each season is played at once,
 * as a « simulate to the end of the season » does, with no VACUUM until the snapshot. --archive runs the « archive » task
 * after each season's transition (src/db/season-archiving.ts: the completed seasons archived, then their rows deleted,
 * without the delay of a production deletion), as the nightly maintenance would: the weight of a career once its
 * completed seasons are archives.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/db/client";
import { isLocalDatabase } from "../src/db/database-url";
import { compactRelationSize, relationSizes } from "../src/db/db-size";
import { createSave } from "../src/db/saves";
import { advanceToNextSeason } from "../src/db/season";
import { runArchivePass } from "../src/db/season-archiving";
import { playNextMatchday } from "../src/db/matchday";
import { DEMO_CLUB_SLUG, DEMO_SEED } from "../src/db/test-support";

const MB = 1024 * 1024;
const OWNER = "measure-career-weight";
const REFERENCE_TABLES = new Set(["Competition", "Club", "Player", "_prisma_migrations"]);
/** The tables a season rewrites, which --vacuum-every vacuums as autovacuum would. */
const VACUUMED_TABLES = ["PlayerSave", "PlayerSeasonStats", "Fixture", "ClubSave", "MatchEvent", "Save"];

type TableSnapshot = { table: string; rows: number; data: number; indexes: number; toast: number; total: number; compact: number };
type IndexSnapshot = { table: string; index: string; size: number };
type Snapshot = {
  label: string;
  seasonsPlayed: number;
  currentDate: string;
  tables: TableSnapshot[];
  indexes: IndexSnapshot[];
  details: Record<string, number>;
  seconds: number;
};

function parseArgs(argv: readonly string[]) {
  const value = (name: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const seasons = Number(value("seasons") ?? 3);
  if (!Number.isInteger(seasons) || seasons < 0) {
    throw new Error(`--seasons must be a non-negative integer, got ${value("seasons")}`);
  }
  const vacuumEvery = Number(value("vacuum-every") ?? 0);
  if (!Number.isInteger(vacuumEvery) || vacuumEvery < 0) {
    throw new Error(`--vacuum-every must be a non-negative integer, got ${value("vacuum-every")}`);
  }
  return {
    seasons,
    seed: value("seed") ?? DEMO_SEED,
    club: value("club") ?? DEMO_CLUB_SLUG,
    out: value("out"),
    keep: argv.includes("--keep"),
    archive: argv.includes("--archive"),
    europe: !argv.includes("--no-europe"),
    vacuumEvery,
  };
}

/**
 * The « archive » task on the save, as the nightly maintenance would run it once the season is advanced: its completed
 * seasons archived, then their rows deleted, pass after pass, without the delay a production deletion waits.
 */
async function archiveSeasons(saveId: string): Promise<void> {
  for (let pass = await runArchivePass(prisma, { mode: "delete", saveIds: [saveId], deleteAfterMs: 0 }); ; ) {
    if (pass.mismatches > 0) {
      throw new Error(`The archive left ${pass.mismatches} season(s) as rows`);
    }
    if (pass.pending + pass.deletableNow === 0) {
      return;
    }
    pass = await runArchivePass(prisma, { mode: "delete", saveIds: [saveId], deleteAfterMs: 0 });
  }
}

const mb = (bytes: number): string => (bytes / MB).toFixed(2);

async function count(sql: Prisma.Sql): Promise<number> {
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>(sql);
  return Number(n);
}

/** Details of the largest tables, for the save: what their rows are, and how often PlayerSave was rewritten. */
async function details(saveId: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });

  result["PlayerSave: avec un club"] = await count(
    Prisma.sql`SELECT count(*) AS n FROM "PlayerSave" WHERE "saveId" = ${saveId} AND "clubSaveId" IS NOT NULL`,
  );
  result["PlayerSave: retraités (transfert RETIREMENT)"] = await count(Prisma.sql`
    SELECT count(*) AS n FROM "PlayerSave" p WHERE p."saveId" = ${saveId} AND p."clubSaveId" IS NULL
      AND EXISTS (SELECT 1 FROM "Transfer" t WHERE t."playerSaveId" = p."id" AND t."type" = 'RETIREMENT')`);
  result["PlayerSave: libres"] = await count(Prisma.sql`
    SELECT count(*) AS n FROM "PlayerSave" p WHERE p."saveId" = ${saveId} AND p."clubSaveId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "Transfer" t WHERE t."playerSaveId" = p."id" AND t."type" = 'RETIREMENT')`);
  result["PlayerSave: retraités sans statistiques"] = await count(Prisma.sql`
    SELECT count(*) AS n FROM "PlayerSave" p WHERE p."saveId" = ${saveId} AND p."clubSaveId" IS NULL
      AND EXISTS (SELECT 1 FROM "Transfer" t WHERE t."playerSaveId" = p."id" AND t."type" = 'RETIREMENT')
      AND NOT EXISTS (SELECT 1 FROM "PlayerSeasonStats" s WHERE s."playerSaveId" = p."id" AND s."appearances" > 0)`);

  const events = await prisma.$queryRaw<{ type: string; managed: boolean; n: bigint }[]>`
    SELECT e."type"::text AS type, (f."homeClubSaveId" = ${managed.id} OR f."awayClubSaveId" = ${managed.id}) AS managed,
           count(*) AS n
    FROM "MatchEvent" e JOIN "Fixture" f ON f."id" = e."fixtureId"
    WHERE f."saveId" = ${saveId}
    GROUP BY 1, 2 ORDER BY 1, 2`;
  for (const { type, managed: isManaged, n } of events) {
    result[`MatchEvent: ${type}, ${isManaged ? "matchs du club dirigé" : "autres matchs"}`] = Number(n);
  }

  result["Fixture: jouées"] = await count(Prisma.sql`SELECT count(*) AS n FROM "Fixture" WHERE "saveId" = ${saveId} AND "played"`);
  result["Fixture: à jouer"] = await count(Prisma.sql`SELECT count(*) AS n FROM "Fixture" WHERE "saveId" = ${saveId} AND NOT "played"`);
  result["Fixture: liveState non nul"] = await count(
    Prisma.sql`SELECT count(*) AS n FROM "Fixture" WHERE "saveId" = ${saveId} AND "liveState" IS NOT NULL`,
  );

  result["PlayerSeasonStats: sans match (appearances = 0)"] = await count(
    Prisma.sql`SELECT count(*) AS n FROM "PlayerSeasonStats" WHERE "saveId" = ${saveId} AND "appearances" = 0`,
  );
  result["PlayerSeasonStats: joueurs du club dirigé (club actuel)"] = await count(Prisma.sql`
    SELECT count(*) AS n FROM "PlayerSeasonStats" s JOIN "PlayerSave" p ON p."id" = s."playerSaveId"
    WHERE s."saveId" = ${saveId} AND p."clubSaveId" = ${managed.id}`);

  const transfers = await prisma.$queryRaw<{ type: string; n: bigint }[]>`
    SELECT "type"::text AS type, count(*) AS n FROM "Transfer" WHERE "saveId" = ${saveId} GROUP BY 1 ORDER BY 1`;
  for (const { type, n } of transfers) {
    result[`Transfer: ${type}`] = Number(n);
  }

  // Cumulative since the database's creation: inserts, updates and HOT updates (no index entry written) of each table.
  const activity = await prisma.$queryRaw<{ table: string; ins: bigint; upd: bigint; hot: bigint }[]>`
    SELECT relname AS "table", n_tup_ins AS ins, n_tup_upd AS upd, n_tup_hot_upd AS hot
    FROM pg_stat_user_tables WHERE relname IN ('PlayerSave', 'ClubSave', 'Fixture', 'PlayerSeasonStats', 'Save')`;
  for (const { table, ins, upd, hot } of activity) {
    result[`${table}: insertions (cumul)`] = Number(ins);
    result[`${table}: mises à jour (cumul)`] = Number(upd);
    result[`${table}: dont HOT (cumul)`] = Number(hot);
  }
  return result;
}

async function snapshot(saveId: string, label: string, seasonsPlayed: number, started: number): Promise<Snapshot> {
  // What autovacuum does in time: dead rows' space marked reusable, statistics refreshed. The files do not shrink.
  await prisma.$executeRawUnsafe("VACUUM ANALYZE");
  const tables: TableSnapshot[] = [];
  for (const size of await relationSizes(prisma)) {
    if (REFERENCE_TABLES.has(size.table)) {
      continue;
    }
    const rows = await count(Prisma.sql`SELECT count(*) AS n FROM ${Prisma.raw(`"${size.table}"`)}`);
    tables.push({ table: size.table, rows, data: size.data, indexes: size.indexes, toast: size.toast, total: size.total, compact: await compactRelationSize(prisma, size.table, rows) });
  }
  const indexes = (
    await prisma.$queryRaw<{ table: string; index: string; size: bigint }[]>`
      SELECT t.relname AS "table", i.relname AS "index", pg_relation_size(i.oid) AS size
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class t ON t.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'`
  )
    .filter((index) => !REFERENCE_TABLES.has(index.table))
    .map((index) => ({ table: index.table, index: index.index, size: Number(index.size) }))
    .sort((a, b) => b.size - a.size);
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const result: Snapshot = {
    label,
    seasonsPlayed,
    currentDate: save.currentDate.toISOString().slice(0, 10),
    tables: tables.sort((a, b) => b.total - a.total),
    indexes,
    details: await details(saveId),
    seconds: Math.round((performance.now() - started) / 1000),
  };
  print(result);
  return result;
}

function printTable(headers: string[], rows: (string | number)[][]): void {
  console.log(`| ${headers.join(" | ")} |`);
  console.log(`| ${headers.map((_, column) => (column === 0 ? "---" : "---:")).join(" | ")} |`);
  for (const row of rows) {
    console.log(`| ${row.join(" | ")} |`);
  }
}

const sum = (tables: readonly TableSnapshot[], key: keyof Omit<TableSnapshot, "table">): number =>
  tables.reduce((total, table) => total + table[key], 0);

function print(snapshot: Snapshot): void {
  console.log(`\n## ${snapshot.label} (${snapshot.currentDate}, ${snapshot.seconds} s)\n`);
  printTable(
    ["Table", "Lignes", "Données (Mo)", "Index (Mo)", "TOAST+ (Mo)", "Réel (Mo)", "Compact (Mo)"],
    [
      ...snapshot.tables
        .filter((table) => table.total > 64 * 1024 || table.rows > 0)
        .map((table) => [table.table, table.rows, mb(table.data), mb(table.indexes), mb(table.toast), mb(table.total), mb(table.compact)]),
      ["**Total**", sum(snapshot.tables, "rows"), mb(sum(snapshot.tables, "data")), mb(sum(snapshot.tables, "indexes")), mb(sum(snapshot.tables, "toast")), mb(sum(snapshot.tables, "total")), mb(sum(snapshot.tables, "compact"))],
    ],
  );
}

function printGrowth(snapshots: readonly Snapshot[]): void {
  console.log("\n## Croissance par saison (réel, Mo ; lignes ajoutées)\n");
  const tables = snapshots[snapshots.length - 1].tables.map((table) => table.table);
  const at = (snapshot: Snapshot, table: string) => snapshot.tables.find((entry) => entry.table === table);
  const headers = ["Table", ...snapshots.slice(1).flatMap((snapshot) => [`${snapshot.label} Mo`, `${snapshot.label} lignes`])];
  const rows = tables.map((table) => [
    table,
    ...snapshots.slice(1).flatMap((snapshot, index) => {
      const before = at(snapshots[index], table);
      const after = at(snapshot, table);
      return [mb((after?.total ?? 0) - (before?.total ?? 0)), (after?.rows ?? 0) - (before?.rows ?? 0)];
    }),
  ]);
  printTable(headers, rows);
  console.log("\n## Index (Mo), au dernier relevé\n");
  const last = snapshots[snapshots.length - 1];
  printTable(
    ["Table", "Index", ...snapshots.map((snapshot) => snapshot.label)],
    last.indexes.map((index) => [
      index.table,
      index.index,
      ...snapshots.map((snapshot) => mb(snapshot.indexes.find((entry) => entry.index === index.index)?.size ?? 0)),
    ]),
  );
  console.log("\n## Détails\n");
  const keys = [...new Set(snapshots.flatMap((snapshot) => Object.keys(snapshot.details)))].sort();
  printTable(
    ["", ...snapshots.map((snapshot) => snapshot.label)],
    keys.map((key) => [key, ...snapshots.map((snapshot) => snapshot.details[key] ?? 0)]),
  );
}

async function main(): Promise<void> {
  const { seasons, seed, club, out, keep, archive, europe, vacuumEvery } = parseArgs(process.argv.slice(2));
  // The client already refuses any database but a local one, ALLOW_REMOTE_DB=1 aside: this script writes, so it refuses
  // even that.
  const url = process.env.DATABASE_URL ?? "";
  if (url === "" || !isLocalDatabase(url)) {
    throw new Error("Refusing to write anywhere else than the local database");
  }
  if ((await prisma.save.count()) > 0) {
    throw new Error("This database already holds saves: run on a dedicated empty one (sizes would mix them)");
  }
  const vacuum = vacuumEvery === 0 ? "sans VACUUM pendant la saison" : `VACUUM toutes les ${vacuumEvery} journées`;
  const archiving = archive ? ", saisons terminées archivées et leurs lignes supprimées après chaque passage" : "";
  console.log(
    `# Poids d'une carrière : base ${new URL(url).pathname.slice(1)} (locale), graine ${seed}, club ${club}, ${seasons} saison(s), ${vacuum}${archiving}${europe ? "" : ", sans compétitions européennes"}`,
  );
  const started = performance.now();
  await prisma.user.deleteMany({ where: { id: OWNER } });
  // Not simulation code: lastSeenAt is real time.
  await prisma.user.create({ data: { id: OWNER, kind: "ANONYMOUS", lastSeenAt: new Date() } });
  const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: club }, select: { id: true } });
  const { id: saveId } = await createSave({
    name: "Mesure du poids d'une carrière",
    managerName: "Mesure",
    clubId,
    seed,
    ownerId: OWNER,
    worldVersion: 2,
    europe,
  });
  const snapshots = [await snapshot(saveId, "Création", 0, started)];
  for (let season = 1; season <= seasons; season++) {
    let matchdays = 0;
    while ((await playNextMatchday(saveId)) !== null) {
      matchdays++;
      if (vacuumEvery > 0 && matchdays % vacuumEvery === 0) {
        await prisma.$executeRawUnsafe(`VACUUM ${VACUUMED_TABLES.map((table) => `"${table}"`).join(", ")}`);
      }
    }
    await advanceToNextSeason(saveId, { assistantContracts: true, ...(europe ? {} : { europe: false as const }) });
    if (archive) {
      await archiveSeasons(saveId);
    }
    snapshots.push(await snapshot(saveId, `Après ${season} saison${season > 1 ? "s" : ""}`, season, started));
  }
  if (snapshots.length > 1) {
    printGrowth(snapshots);
  }
  if (out !== undefined) {
    writeFileSync(out, `${JSON.stringify({ seed, club, seasons, vacuumEvery, archive, snapshots }, null, 2)}\n`);
    console.log(`\nRelevés écrits dans ${out}`);
  }
  if (!keep) {
    await prisma.user.deleteMany({ where: { id: OWNER } });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
