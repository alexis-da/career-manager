/**
 * Creates the local databases of development and tests when missing (npm run db:local:init): the database of
 * DIRECT_URL in .env (latewinner_dev) and the one of DATABASE_URL_TEST in .env.test (latewinner_test), on the local
 * PostgreSQL, with psql. Idempotent: an existing database is left as it is. Refuses any URL that is not on localhost.
 * Then, for each: `prisma migrate deploy` and `npm run db:seed` (CLAUDE.md, « Postgres local »).
 * psql: from PATH, or PSQL=<path>, or PostgreSQL 17's default place on Windows.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { assertLocalDatabase } from "../src/db/database-url";

const WINDOWS_PSQL = "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const DATABASE_NAME = /^[a-z_][a-z0-9_]*$/;

function psqlPath(): string {
  if (process.env.PSQL !== undefined && process.env.PSQL !== "") {
    return process.env.PSQL;
  }
  const inPath = spawnSync("psql", ["--version"], { encoding: "utf8" });
  if (inPath.status === 0) {
    return "psql";
  }
  if (existsSync(WINDOWS_PSQL)) {
    return WINDOWS_PSQL;
  }
  throw new Error("psql not found: add PostgreSQL's bin folder to PATH, or set PSQL to psql's path");
}

/** Runs a statement on the server's maintenance database; its output, trimmed. The password goes by PGPASSWORD. */
function psql(psqlBin: string, url: URL, sql: string): string {
  const result = spawnSync(
    psqlBin,
    ["-h", url.hostname, "-p", url.port === "" ? "5432" : url.port, "-U", decodeURIComponent(url.username), "-d", "postgres", "-tAc", sql],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } },
  );
  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function databasesToCreate(): { variable: string; url: string }[] {
  const test = existsSync(".env.test") ? parse(readFileSync(".env.test")).DATABASE_URL_TEST : undefined;
  return [
    { variable: "DIRECT_URL (.env)", url: process.env.DIRECT_URL ?? "" },
    { variable: "DATABASE_URL_TEST (.env.test)", url: test ?? "" },
  ];
}

const psqlBin = psqlPath();
for (const { variable, url } of databasesToCreate()) {
  if (url === "") {
    throw new Error(`${variable} is not set`);
  }
  // Even with ALLOW_REMOTE_DB: this script only ever creates local databases.
  delete process.env.ALLOW_REMOTE_DB;
  assertLocalDatabase(url, variable);
  const parsed = new URL(url);
  const name = parsed.pathname.slice(1);
  if (!DATABASE_NAME.test(name)) {
    throw new Error(`${variable}: « ${name} » is not a plain database name (lowercase letters, digits, _)`);
  }
  const exists = psql(psqlBin, parsed, `SELECT 1 FROM pg_database WHERE datname = '${name}'`) === "1";
  if (exists) {
    console.log(`${name}: already there`);
  } else {
    psql(psqlBin, parsed, `CREATE DATABASE "${name}"`);
    console.log(`${name}: created`);
  }
}
