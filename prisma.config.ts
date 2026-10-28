import "dotenv/config";
import { defineConfig } from "prisma/config";
import { assertLocalDatabase, cliDatabaseUrl } from "./src/db/database-url";

// The CLI's database: the local PostgreSQL from the workstation (without SSL), Neon from Vercel's build only. Without
// DIRECT_URL (a fresh clone before its .env), no datasource: `prisma generate`, run by npm install (postinstall), needs
// none, and migrations and the seed refuse to run.
const directUrl = process.env.DIRECT_URL;
assertLocalDatabase(directUrl, "DIRECT_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  // The CLI (migrations, seed) uses the direct connection; the app's Prisma client uses the pooled DATABASE_URL
  // (src/db/client.ts). Locally, both point to the same database.
  ...(directUrl ? { datasource: { url: cliDatabaseUrl(directUrl) } } : {}),
});
