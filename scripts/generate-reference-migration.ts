/**
 * Writes the migration bringing the second divisions to a database, from the seed's plan
 * (npx tsx scripts/generate-reference-migration.ts prisma/migrations/<timestamp>_second_divisions).
 * Reads the seed's files only: no database, nothing else written.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { secondDivisionsMigrationSql } from "../prisma/seed/reference-sql";
import { buildWorldPlan } from "../prisma/seed/seed";

const directory = process.argv[2];
if (directory === undefined) {
  throw new Error("Usage: tsx scripts/generate-reference-migration.ts prisma/migrations/<timestamp>_second_divisions");
}
mkdirSync(directory, { recursive: true });
const path = join(directory, "migration.sql");
writeFileSync(path, secondDivisionsMigrationSql(buildWorldPlan()));
console.log(`Written: ${path}`);
