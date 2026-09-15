import { configDefaults, defineConfig } from "vitest/config";

// Only the slow database tests, excluded from `npm run test` by vitest.config.mts.
export default defineConfig({
  test: {
    include: ["**/*.slow.test.ts"],
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
  },
});
