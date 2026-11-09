import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { parse } from "dotenv";
import { ADMIN_EMAIL_TEST, MAINTENANCE_SECRET_TEST } from "./e2e/constants";
import { assertLocalDatabase } from "./src/db/database-url";

// The tests write to a database of their own, DATABASE_URL_TEST, read from .env.test (never committed). Without it,
// refuse to start rather than fall back on .env and write to the development or production database.
const ENV_TEST = ".env.test";
if (!existsSync(ENV_TEST)) {
  throw new Error(
    `End-to-end tests need ${ENV_TEST} with DATABASE_URL_TEST, the database they write to (see .env.example). Refusing to start.`,
  );
}
const testEnv = parse(readFileSync(ENV_TEST));
const DATABASE_URL_TEST = testEnv.DATABASE_URL_TEST;
if (DATABASE_URL_TEST === undefined || DATABASE_URL_TEST === "") {
  throw new Error(`${ENV_TEST} has no DATABASE_URL_TEST: set the database the end-to-end tests write to. Refusing to start.`);
}
// The local test database (latewinner_test), never Neon.
assertLocalDatabase(DATABASE_URL_TEST, "DATABASE_URL_TEST");
// The test server signs players' cookies with a secret of its own, never the development one.
const AUTH_SECRET_TEST = testEnv.AUTH_SECRET;
if (AUTH_SECRET_TEST === undefined || AUTH_SECRET_TEST === "") {
  throw new Error(`${ENV_TEST} has no AUTH_SECRET: the test server needs one to sign players' cookies. Refusing to start.`);
}

// A port and a build directory of their own, so the tests never run against a development server started by
// hand, which may hold an older Prisma client, and never collide with its lock on .next. Override with E2E_PORT.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// On GitHub (.github/workflows/ci.yml, nightly.yml), which sets CI: a failure is retried once and keeps its screenshot,
// in an HTML report the workflow keeps as an artifact for 7 days.
const CI = process.env.CI !== undefined && process.env.CI !== "";

// One browser, one worker: the tests write to the test database. No video or trace; a screenshot on GitHub only.
export default defineConfig({
  testDir: "./e2e",
  // Deletes the anonymous users the run leaves without a save (e2e/global-setup.ts).
  globalSetup: "./e2e/global-setup.ts",
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "fr-FR",
    screenshot: CI ? "only-on-failure" : "off",
    video: "off",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    // Variables set here win over .env: the server uses the test database, and the maintenance endpoint has a secret
    // of its own.
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: DATABASE_URL_TEST,
      DIRECT_URL: DATABASE_URL_TEST,
      AUTH_SECRET: AUTH_SECRET_TEST,
      MAINTENANCE_SECRET: MAINTENANCE_SECRET_TEST,
      // The administrator of /admin, never the development one.
      ADMIN_EMAIL: ADMIN_EMAIL_TEST,
    },
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
