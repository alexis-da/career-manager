import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Tests too long for `npm run test` (a whole season or more in the database) are named *.slow.test.ts and run
// with `npm run test:slow` (vitest.slow.config.mts). End-to-end tests live in e2e/ and run with Playwright.
export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json: "@/" is the project root.
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    // Hooks of the database tests (creating, then deleting a save, which cascades) can outlast the default 10 s on
    // a remote database while other files run in parallel. Test timeouts keep the default.
    hookTimeout: 30_000,
    exclude: [...configDefaults.exclude, "**/*.slow.test.ts", "e2e/**", ".next/**"],
  },
});
