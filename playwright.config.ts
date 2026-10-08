import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { parse } from "dotenv";

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
// The test server signs players' cookies with a secret of its own, never the development one.
const AUTH_SECRET_TEST = testEnv.AUTH_SECRET;
if (AUTH_SECRET_TEST === undefined || AUTH_SECRET_TEST === "") {
  throw new Error(`${ENV_TEST} has no AUTH_SECRET: the test server needs one to sign players' cookies. Refusing to start.`);
}

// A port and a build directory of their own, so the tests never run against a development server started by
// hand, which may hold an older Prisma client, and never collide with its lock on .next. Override with E2E_PORT.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// One browser, one worker: the tests write to the test database. No screenshot, video or trace.
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    locale: "fr-FR",
    screenshot: "off",
    video: "off",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    // Variables set here win over .env: the server uses the test database, and the app is not password-protected.
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: DATABASE_URL_TEST,
      DIRECT_URL: DATABASE_URL_TEST,
      APP_PASSWORD: "",
      AUTH_SECRET: AUTH_SECRET_TEST,
    },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
