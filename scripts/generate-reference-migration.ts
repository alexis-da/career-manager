/**
 * Writes a migration bringing reference data to a database, from the seed, chosen by the folder's name:
 * npx tsx scripts/generate-reference-migration.ts prisma/migrations/<timestamp>_second_divisions (the second
 * divisions' competitions, clubs and players) or …/<timestamp>_national_cups (the five cups).
 * Reads the seed's files only: no database, nothing else written.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CUPS } from "../prisma/seed/competitions";
import { nationalCupsMigrationSql, secondDivisionsMigrationSql } from "../prisma/seed/reference-sql";
import { buildWorldPlan } from "../prisma/seed/seed";

const directory = process.argv[2];
const sql = directory?.endsWith("_second_divisions")
  ? () => secondDivisionsMigrationSql(buildWorldPlan())
  : directory?.endsWith("_national_cups")
    ? () => nationalCupsMigrationSql(CUPS)
    : undefined;
if (directory === undefined || sql === undefined) {
  throw new Error("Usage: tsx scripts/generate-reference-migration.ts prisma/migrations/<timestamp>_second_divisions | …_national_cups");
}
mkdirSync(directory, { recursive: true });
const path = join(directory, "migration.sql");
writeFileSync(path, sql());
console.log(`Written: ${path}`);
