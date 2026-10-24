import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { testDatabaseEnv } from "./src/db/test-database";

// Tests too long for `npm run test` (a whole season or more in the database) are named *.slow.test.ts and run
// with `npm run test:slow` (vitest.slow.config.mts). End-to-end tests live in e2e/ and run with Playwright.
export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json: "@/" is the project root.
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    // The database tests run on the local test database of .env.test (src/db/test-database.ts), never on .env's.
    env: testDatabaseEnv(),
    // Hooks of the database tests (creating, then deleting a save, which cascades) can outlast the default 10 s on
    // a remote database while other files run in parallel. Test timeouts keep the default.
    hookTimeout: 30_000,
    // Deletes the throwaway owners of the database tests' saves once every file has run.
    globalSetup: ["./src/db/test-global-setup.ts"],
    exclude: [...configDefaults.exclude, "**/*.slow.test.ts", "e2e/**", ".next/**"],
  },
});
