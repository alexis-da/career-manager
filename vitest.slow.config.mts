import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { testDatabaseEnv } from "./src/db/test-database";

// Only the slow database tests, excluded from `npm run test` by vitest.config.mts.
export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json: "@/" is the project root.
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    // The database tests run on the local test database of .env.test (src/db/test-database.ts), never on .env's.
    env: testDatabaseEnv(),
    // Same as vitest.config.mts: database hooks get 30 s, test timeouts keep the default.
    hookTimeout: 30_000,
    // Deletes the throwaway owners of the database tests' saves once every file has run.
    globalSetup: ["./src/db/test-global-setup.ts"],
    // A query sent on a busy pg connection fails the test (src/db/test-pg-guard.ts).
    setupFiles: ["./src/db/test-pg-guard.ts"],
    include: ["**/*.slow.test.ts"],
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
  },
});
