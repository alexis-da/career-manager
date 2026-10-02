import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  // The CLI (migrations, seed) uses the direct connection; the app's Prisma client uses the pooled DATABASE_URL
  // (src/db/client.ts). Locally, both may point to the same database.
  datasource: {
    url: env("DIRECT_URL"),
  },
});
