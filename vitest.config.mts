import { configDefaults, defineConfig } from "vitest/config";

// Tests too long for `npm run test` (a whole season or more in the database) are named *.slow.test.ts and run
// with `npm run test:slow` (vitest.slow.config.mts). End-to-end tests live in e2e/ and run with Playwright.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/*.slow.test.ts", "e2e/**", ".next/**"],
  },
});
