import { defineConfig, devices } from "@playwright/test";

// A port and a build directory of their own, so the tests never run against a development server started by
// hand, which may hold an older Prisma client, and never collide with its lock on .next. Override with E2E_PORT.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// One browser, one worker: the tests write to the development database. No screenshot, video or trace.
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
    env: { NEXT_DIST_DIR: ".next-e2e" },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
