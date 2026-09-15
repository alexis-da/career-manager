import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Only the slow database tests, excluded from `npm run test` by vitest.config.mts.
export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json: "@/" is the project root.
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    include: ["**/*.slow.test.ts"],
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
  },
});
