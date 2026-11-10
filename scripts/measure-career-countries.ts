/**
 * Where a career's weight goes, country by country (npx tsx scripts/measure-career-countries.ts [--seasons=3]
 * [--seed=S] [--club=slug] [--vacuum-every=5] [--out=file]). As scripts/measure-career-weight.ts, on a dedicated empty
 * local database: creates a worldVersion 2 save (the demo club and seed unless told otherwise) and plays N complete
 * seasons, the assistant deciding everything, the managed club's contracts included, each followed by
 * advanceToNextSeason, with a VACUUM of the tables a season rewrites every N matchdays, as autovacuum would.
 *
 * At the creation and after each season, it splits each table's real size between the managed club's country, the four
 * other countries and what belongs to none (free agents and retired players, the save's own rows): the data and TOAST by
 * each row's width (pg_column_size), the indexes by its row count. A row's country: its club's competition for a player
 * (PlayerSave), its season's competition for a fixture, a season's stats and a club (Fixture, PlayerSeasonStats,
 * ClubSave, Season), its fixture's for an event or a decision, its arriving club's (else leaving club's) for a transfer.
 * It also counts the rows each country inserts and updates, through statement triggers with transition tables that it
 * installs on the dedicated database only, and drops at the end with their counter table.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "../src/db/client";
import { isLocalDatabase } from "../src/db/database-url";
import { relationSizes } from "../src/db/db-size";
import { playNextMatchday } from "../src/db/matchday";
import { createSave } from "../src/db/saves";
import { advanceToNextSeason } from "../src/db/season";
import { DEMO_CLUB_SLUG, DEMO_SEED } from "../src/db/test-support";

const MB = 1024 * 1024;
const OWNER = "measure-career-countries";
const REFERENCE_TABLES = new Set(["Competition", "Club", "Player", "_prisma_migrations"]);
/** The tables a season rewrites, vacuumed every N matchdays as autovacuum would. */
const VACUUMED_TABLES = ["PlayerSave", "PlayerSeasonStats", "Fixture", "ClubSave", "MatchEvent", "Save"];
const COUNTER = "_measure_writes";

/** For each split table, the SQL giving the country of its row `t` (null: none). */
const COUNTRY_OF: Record<string, string> = {
  PlayerSave: `(SELECT c."country" FROM "ClubSave" cs JOIN "Competition" c ON c."id" = cs."competitionId" WHERE cs."id" = t."clubSaveId")`,
  PlayerSeasonStats: `(SELECT c."country" FROM "Season" s JOIN "Competition" c ON c."id" = s."competitionId" WHERE s."id" = t."seasonId")`,
  Fixture: `(SELECT c."country" FROM "Season" s JOIN "Competition" c ON c."id" = s."competitionId" WHERE s."id" = t."seasonId")`,
  MatchEvent: `(SELECT c."country" FROM "Fixture" f JOIN "Season" s ON s."id" = f."seasonId" JOIN "Competition" c ON c."id" = s."competitionId" WHERE f."id" = t."fixtureId")`,
  MatchDecision: `(SELECT c."country" FROM "Fixture" f JOIN "Season" s ON s."id" = f."seasonId" JOIN "Competition" c ON c."id" = s."competitionId" WHERE f."id" = t."fixtureId")`,
  ClubSave: `(SELECT c."country" FROM "Competition" c WHERE c."id" = t."competitionId")`,
  Season: `(SELECT c."country" FROM "Competition" c WHERE c."id" = t."competitionId")`,
  Transfer: `(SELECT c."country" FROM "Club" k JOIN "Competition" c ON c."id" = k."competitionId" WHERE k."id" = coalesce(t."toClubId", t."fromClubId"))`,
};
/** The writes counted by trigger: inserts and updates of each table. */
const COUNTED: Record<string, ("INSERT" | "UPDATE")[]> = {
  PlayerSave: ["INSERT", "UPDATE"],
  PlayerSeasonStats: ["INSERT", "UPDATE"],
  Fixture: ["INSERT", "UPDATE"],
  ClubSave: ["INSERT", "UPDATE"],
  MatchEvent: ["INSERT"],
  MatchDecision: ["INSERT"],
  Transfer: ["INSERT"],
};

type Group = "managed" | "others" | "none";
const GROUPS: readonly Group[] = ["managed", "others", "none"];
type Split = Record<Group, number>;
type TableSnapshot = { table: string; rows: number; total: number; mb: Split; rowsBy: Split };
type Writes = Record<string, Record<"INSERT" | "UPDATE", Split>>;
type Snapshot = { label: string; currentDate: string; tables: TableSnapshot[]; writes: Writes; byCountry: Record<string, number> };

const emptySplit = (): Split => ({ managed: 0, others: 0, none: 0 });
const mb = (bytes: number): string => (bytes / MB).toFixed(2);
const pct = (part: number, whole: number): string => (whole === 0 ? "—" : `${Math.round((part / whole) * 100)} %`);

function parseArgs(argv: readonly string[]) {
  const value = (name: string): string | undefined => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const seasons = Number(value("seasons") ?? 3);
  const vacuumEvery = Number(value("vacuum-every") ?? 5);
  if (!Number.isInteger(seasons) || seasons < 0 || !Number.isInteger(vacuumEvery) || vacuumEvery < 0) {
    throw new Error("--seasons and --vacuum-every take non-negative integers");
  }
  return { seasons, vacuumEvery, seed: value("seed") ?? DEMO_SEED, club: value("club") ?? DEMO_CLUB_SLUG, out: value("out") };
}

/** Installs the counter table and, on each counted table, one statement trigger per write. */
async function installCounters(): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${COUNTER}"`);
  await prisma.$executeRawUnsafe(`CREATE TABLE "${COUNTER}" ("table" text, "op" text, "country" text, "rows" bigint)`);
  for (const [table, operations] of Object.entries(COUNTED)) {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "_measure_count_${table}"() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        INSERT INTO "${COUNTER}" ("table", "op", "country", "rows")
        SELECT '${table}', TG_OP, x."country", count(*) FROM (SELECT ${COUNTRY_OF[table]} AS "country" FROM new_rows t) x GROUP BY x."country";
        RETURN NULL;
      END $f$`);
    for (const operation of operations) {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "_measure_${table}_${operation}" ON "${table}"`);
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER "_measure_${table}_${operation}" AFTER ${operation} ON "${table}" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION "_measure_count_${table}"()`,
      );
    }
  }
}

async function dropCounters(): Promise<void> {
  for (const [table, operations] of Object.entries(COUNTED)) {
    for (const operation of operations) {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "_measure_${table}_${operation}" ON "${table}"`);
    }
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "_measure_count_${table}"()`);
  }
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${COUNTER}"`);
}

/** The writes counted since the last call, by table, operation and group; the counter is emptied. */
async function takeWrites(groupOf: (country: string | null) => Group): Promise<Writes> {
  const rows = await prisma.$queryRawUnsafe<{ table: string; op: "INSERT" | "UPDATE"; country: string | null; rows: bigint }[]>(
    `SELECT "table", "op", "country", sum("rows")::bigint AS "rows" FROM "${COUNTER}" GROUP BY 1, 2, 3`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "${COUNTER}"`);
  const writes: Writes = {};
  for (const row of rows) {
    writes[row.table] ??= { INSERT: emptySplit(), UPDATE: emptySplit() };
    writes[row.table][row.op][groupOf(row.country)] += Number(row.rows);
  }
  return writes;
}

async function snapshot(label: string, saveId: string, groupOf: (country: string | null) => Group): Promise<Snapshot> {
  // What autovacuum does in time: dead rows' space marked reusable, statistics refreshed. The files do not shrink.
  await prisma.$executeRawUnsafe("VACUUM ANALYZE");
  const tables: TableSnapshot[] = [];
  const byCountry: Record<string, number> = {};
  for (const size of await relationSizes(prisma)) {
    if (REFERENCE_TABLES.has(size.table) || size.table === COUNTER) {
      continue;
    }
    const expression = COUNTRY_OF[size.table] ?? "NULL::text";
    const split = await prisma.$queryRawUnsafe<{ country: string | null; rows: bigint; bytes: bigint | null }[]>(
      `SELECT x."country", count(*)::bigint AS "rows", sum(x."bytes")::bigint AS "bytes"
       FROM (SELECT ${expression} AS "country", pg_column_size(t.*) AS "bytes" FROM "${size.table}" t) x GROUP BY 1`,
    );
    const rows = split.reduce((sum, part) => sum + Number(part.rows), 0);
    const bytes = split.reduce((sum, part) => sum + Number(part.bytes ?? 0), 0);
    const table: TableSnapshot = { table: size.table, rows, total: size.total, mb: emptySplit(), rowsBy: emptySplit() };
    for (const part of split) {
      const group = groupOf(part.country);
      const byteShare = bytes === 0 ? 0 : Number(part.bytes ?? 0) / bytes;
      const rowShare = rows === 0 ? 0 : Number(part.rows) / rows;
      // Data and TOAST by width, indexes by rows; a table without rows keeps its empty pages in « none ».
      const share = (size.data + size.toast) * byteShare + size.indexes * rowShare;
      table.mb[group] += share;
      table.rowsBy[group] += Number(part.rows);
      if (part.country !== null) {
        byCountry[part.country] = (byCountry[part.country] ?? 0) + share;
      }
    }
    if (rows === 0) {
      table.mb.none += size.total;
    }
    tables.push(table);
  }
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  return {
    label,
    currentDate: save.currentDate.toISOString().slice(0, 10),
    tables: tables.sort((a, b) => b.total - a.total),
    writes: await takeWrites(groupOf),
    byCountry,
  };
}

function printTable(headers: string[], rows: (string | number)[][]): void {
  console.log(`| ${headers.join(" | ")} |`);
  console.log(`| ${headers.map((_, column) => (column === 0 ? "---" : "---:")).join(" | ")} |`);
  for (const row of rows) {
    console.log(`| ${row.join(" | ")} |`);
  }
}

function print(snapshot: Snapshot, managedCountry: string): void {
  const total = snapshot.tables.reduce((sum, table) => sum + table.total, 0);
  console.log(`\n## ${snapshot.label} (${snapshot.currentDate}) : ${mb(total)} Mo\n`);
  printTable(
    ["Table", "Lignes", "Réel (Mo)", "Part", `${managedCountry} (Mo)`, "4 autres pays (Mo)", "Sans pays (Mo)", `Lignes ${managedCountry}`, "Lignes autres"],
    snapshot.tables
      .filter((table) => table.total >= 0.05 * MB)
      .map((table) => [
        table.table,
        table.rows,
        mb(table.total),
        pct(table.total, total),
        mb(table.mb.managed),
        mb(table.mb.others),
        mb(table.mb.none),
        table.rowsBy.managed,
        table.rowsBy.others,
      ]),
  );
  console.log(`\nPar pays (Mo) : ${Object.entries(snapshot.byCountry).sort(([a], [b]) => a.localeCompare(b)).map(([country, bytes]) => `${country} ${mb(bytes)}`).join(" · ")}`);
  console.log(`\nÉcritures depuis le relevé précédent (lignes : ${managedCountry} / 4 autres / sans pays)\n`);
  printTable(
    ["Table", "Insertions", "Mises à jour"],
    Object.entries(snapshot.writes).map(([table, ops]) => [
      table,
      GROUPS.map((group) => ops.INSERT[group]).join(" / "),
      GROUPS.map((group) => ops.UPDATE[group]).join(" / "),
    ]),
  );
}

async function main(): Promise<void> {
  const { seasons, vacuumEvery, seed, club, out } = parseArgs(process.argv.slice(2));
  // This script writes and installs triggers: the local database only, ALLOW_REMOTE_DB or not.
  const url = process.env.DATABASE_URL ?? "";
  if (url === "" || !isLocalDatabase(url)) {
    throw new Error("Refusing to write anywhere else than the local database");
  }
  if ((await prisma.save.count()) > 0) {
    throw new Error("This database already holds saves: run on a dedicated empty one (sizes would mix them)");
  }
  console.log(`# Poids d'une carrière par pays : base ${new URL(url).pathname.slice(1)} (locale), graine ${seed}, club ${club}, ${seasons} saison(s), VACUUM toutes les ${vacuumEvery} journées`);
  await installCounters();
  try {
    await prisma.user.deleteMany({ where: { id: OWNER } });
    // Not simulation code: lastSeenAt is real time.
    await prisma.user.create({ data: { id: OWNER, kind: "ANONYMOUS", lastSeenAt: new Date() } });
    const { id: clubId, competition } = await prisma.club.findUniqueOrThrow({
      where: { slug: club },
      select: { id: true, competition: { select: { country: true } } },
    });
    if (competition === null) {
      throw new Error(`${club} plays in no competition`);
    }
    const managedCountry = competition.country;
    const groupOf = (country: string | null): Group => (country === null ? "none" : country === managedCountry ? "managed" : "others");
    const { id: saveId } = await createSave({ name: "Mesure par pays", managerName: "Mesure", clubId, seed, ownerId: OWNER, worldVersion: 2 });
    const snapshots = [await snapshot("Création", saveId, groupOf)];
    print(snapshots[0], managedCountry);
    for (let season = 1; season <= seasons; season++) {
      let matchdays = 0;
      while ((await playNextMatchday(saveId)) !== null) {
        matchdays++;
        if (vacuumEvery > 0 && matchdays % vacuumEvery === 0) {
          await prisma.$executeRawUnsafe(`VACUUM ${VACUUMED_TABLES.map((table) => `"${table}"`).join(", ")}`);
        }
      }
      await advanceToNextSeason(saveId, { assistantContracts: true });
      snapshots.push(await snapshot(`Après ${season} saison${season > 1 ? "s" : ""}`, saveId, groupOf));
      print(snapshots[snapshots.length - 1], managedCountry);
    }
    if (out !== undefined) {
      writeFileSync(out, `${JSON.stringify({ seed, club, managedCountry, seasons, vacuumEvery, snapshots }, null, 2)}\n`);
      console.log(`\nRelevés écrits dans ${out}`);
    }
    await prisma.user.deleteMany({ where: { id: OWNER } });
  } finally {
    await dropCounters();
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
