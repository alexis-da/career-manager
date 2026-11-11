import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output of the end-to-end tests' server (playwright.config.ts) and the generated Prisma client.
    ".next-e2e/**",
    "src/generated/**",
  ]),
  {
    rules: {
      // Every link goes through src/components/link.tsx: next/link prefetches every link in view, and again after every
      // Server Action, a server invocation each (chantier « cpu », 11/11).
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "next/link", message: "Use @/src/components/link: no automatic prefetch, a hover's only." }] },
      ],
    },
  },
]);

export default eslintConfig;
