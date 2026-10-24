import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { assertLocalDatabase, cliDatabaseUrl } from "./src/db/database-url";

// The CLI's database: the local PostgreSQL from the workstation (without SSL), Neon from Vercel's build only.
const directUrl = env("DIRECT_URL");
assertLocalDatabase(directUrl, "DIRECT_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  // The CLI (migrations, seed) uses the direct connection; the app's Prisma client uses the pooled DATABASE_URL
  // (src/db/client.ts). Locally, both point to the same database.
  datasource: {
    url: cliDatabaseUrl(directUrl),
  },
});
