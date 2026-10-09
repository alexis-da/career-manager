import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Only the slow database tests, excluded from `npm run test` by vitest.config.mts.
export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json: "@/" is the project root.
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    // Same as vitest.config.mts: database hooks get 30 s, test timeouts keep the default.
    hookTimeout: 30_000,
    // Deletes the throwaway owners of the database tests' saves once every file has run.
    globalSetup: ["./src/db/test-global-setup.ts"],
    include: ["**/*.slow.test.ts"],
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
  },
});
