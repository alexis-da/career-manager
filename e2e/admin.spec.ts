import { devices, expect, test, type Page } from "@playwright/test";
import { MAINTENANCE_SECRET_TEST } from "./constants";
import {
  createAnonymousUser,
  createRegisteredUser,
  databaseNow,
  deleteArchivePassesSince,
  deleteCleanupPassesSince,
  deleteErrors,
  deleteUsers,
  deleteVisits,
  ensureAdminUser,
  userIdOf,
} from "./db";
import { expectNoSidewaysScroll, fillCreateSaveForm, signInAs, waitForReact } from "./helpers";

// /admin, the administrator's dashboard (app/admin, src/db/admin-dashboard.ts): a page that does not exist for anyone
// but ADMIN_EMAIL (ADMIN_EMAIL_TEST on the test server); its seven sections on a phone and a computer, in French and in
// English, without a sideways scroll, page or table; 7 or 30 days; a first visit from a link followed to it; and an error
// provoked in a player's browser, shown in its errors section.

const LYON = "Olympique Lyonnais";
const SECTIONS = ["acquisition", "journey", "tutorial", "retention", "activity", "errors", "health"] as const;
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 360, height: 780 },
];

/** The tables wider than their frame, by test id: none, at any width. */
const tablesOverflowing = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="table-container"]')]
      .filter((frame) => frame.scrollWidth > frame.clientWidth)
      .map((frame) => frame.querySelector("table")?.getAttribute("data-testid") ?? "?"),
  );

test("answers 404 on /admin and /admin/stats to anyone but the administrator", async ({ page }) => {
  expect((await page.goto("/admin"))?.status()).toBe(404);
  // Not simulation code: players seen just now.
  const anonymous = await createAnonymousUser(new Date());
  const google = await createRegisteredUser("Pas l'admin");
  try {
    for (const userId of [anonymous, google.id]) {
      await signInAs(page, userId);
      for (const path of ["/admin", "/admin?days=30", "/admin/stats"]) {
        expect((await page.goto(path))?.status(), `${userId} ${path}`).toBe(404);
      }
    }
  } finally {
    await deleteUsers([anonymous, google.id]);
  }
});

test("shows the administrator its seven sections on a computer and a phone, over 7 or 30 days, in French and in English", async ({
  page,
}) => {
  await signInAs(page, await ensureAdminUser());

  for (const viewport of VIEWPORTS) {
    const step = `${viewport.width} px`;
    await page.setViewportSize(viewport);
    const response = await page.goto("/admin");
    expect(response?.status(), step).toBe(200);
    await expect(page.getByTestId("admin-title")).toHaveText("Administration");
    await expect(page.getByTestId("admin-lead")).toContainText("Les 7 derniers jours (UTC)");
    for (const section of SECTIONS) {
      await expect(page.getByTestId(`admin-${section}`), `${step} ${section}`).toBeVisible();
    }
    await expect(page.getByTestId("admin-acquisition-days").locator("tbody tr")).toHaveCount(7);
    // The tutorial: the five steps of its first day, and its four rows of returns, the reference's last.
    await expect(page.getByTestId("admin-tutorial-steps").locator("tbody tr")).toHaveCount(5);
    await expect(page.getByTestId("admin-tutorial-returns").locator("tbody tr").last()).toHaveAttribute("data-cohort", "reference");
    await expect(page.getByTestId("admin-period-7")).toHaveAttribute("aria-current", "page");
    // The storage: size, growth, its monthly cost now and in 30 days, alerted or not, and the weight per new player.
    const health = page.getByTestId("admin-health");
    for (const tile of ["admin-database-size", "admin-growth", "admin-storage-cost", "admin-storage-projection", "admin-per-new-player"]) {
      await expect(health.getByTestId(tile), `${step} ${tile}`).toBeVisible();
    }
    await expect(health.getByTestId("admin-storage-cost")).toContainText(/\d \$/);
    await expect(health.getByTestId("admin-storage-projection")).toHaveAttribute("data-alert", /^(true|false)$/);
    await expectNoSidewaysScroll(page, step);
    expect(await tablesOverflowing(page), step).toEqual([]);
  }

  // Thirty days, today included.
  await page.getByTestId("admin-period-30").click();
  await expect(page).toHaveURL(/\/admin\?days=30$/);
  await expect(page.getByTestId("admin-period-30")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("admin-acquisition-days").locator("tbody tr")).toHaveCount(30);
  await expect(page.getByTestId("admin-lead")).toContainText("Les 30 derniers jours (UTC)");
  await expectNoSidewaysScroll(page, "30 days at 360 px");
  expect(await tablesOverflowing(page)).toEqual([]);

  // The detailed statistics, a link away, and back.
  await page.getByTestId("admin-stats-link").click();
  await expect(page).toHaveURL(/\/admin\/stats$/);
  await expect(page.getByTestId("admin-stats-title")).toBeVisible();
  await page.getByTestId("admin-dashboard-link").click();
  await expect(page).toHaveURL(/\/admin$/);

  // In English, the player's language.
  await page.context().addCookies([{ name: "lw_lang", value: "en", domain: "localhost", path: "/" }]);
  await page.goto("/admin");
  await expect(page.getByTestId("admin-lead")).toContainText("The last 7 days (UTC)");
  await expect(page.getByRole("heading", { name: "Journey" })).toBeVisible();
  await expect(page.getByTestId("admin-period-30")).toHaveText("30 days");
  await expect(page.getByTestId("admin-storage-cost")).toContainText(/\$\d/);
  await expect(page.getByTestId("admin-storage-projection")).toContainText("In 30 days");
  await expectNoSidewaysScroll(page, "English at 360 px");
  expect(await tablesOverflowing(page)).toEqual([]);
});

test("shows in its errors section an error provoked in a player's browser, the latest one, by its route", async ({ browser, page }) => {
  // A word of this run only, its errors deleted at the end; letters only, which the cleaning of a message keeps.
  const word = `erreur${Date.now().toString(36).replace(/\d/g, "x")}`;
  const visitor = await browser.newContext({ ...devices["Pixel 7"], locale: "fr-FR" });
  const player = await visitor.newPage();
  try {
    await player.goto("/fr/comment-jouer");
    await waitForReact(player);
    const reported = player.waitForRequest((request) => request.url().endsWith("/api/client-errors") && request.method() === "POST");
    // An uncaught error, as a bug of the page's code would throw.
    await player.evaluate((message) => {
      setTimeout(() => {
        throw new TypeError(message);
      });
    }, `Panne ${word}`);
    await reported;

    await signInAs(page, await ensureAdminUser());
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/admin");
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByTestId("admin-errors-latest").textContent();
      })
      .toContain(`TypeError: Panne ${word}`);
    await expect(page.getByTestId("admin-errors-latest")).toContainText("Navigateur · error · /fr/comment-jouer");
    await expect(page.getByTestId("admin-errors-groups").locator("tbody tr", { hasText: word }).locator("td")).toHaveText([
      new RegExp(`TypeError: Panne ${word}`),
      "1",
      "1",
      /\d\d\/\d\d/,
    ]);
    await expectNoSidewaysScroll(page, "errors at 360 px");
    expect(await tablesOverflowing(page)).toEqual([]);
  } finally {
    await deleteErrors(word);
    await deleteUsers([await userIdOf(visitor)]);
    await visitor.close();
  }
});

test("shows in its health section the event cleanup's pass, a count by the maintenance that deletes nothing", async ({ page, request }) => {
  const since = await databaseNow();
  try {
    // The cleanup's endpoint, as the daily maintenance calls it: 404 without its secret, a count with ?dryRun=1.
    expect((await request.post("/api/maintenance/cleanup?dryRun=1")).status()).toBe(404);
    const response = await request.post("/api/maintenance/cleanup?dryRun=1", { headers: { authorization: `Bearer ${MAINTENANCE_SECRET_TEST}` } });
    expect(response.status()).toBe(200);
    const counted = (await response.json()) as { dryRun: boolean; deleted: number; remaining: number };
    expect(counted).toMatchObject({ dryRun: true, deleted: 0 });

    await signInAs(page, await ensureAdminUser());
    await page.goto("/admin");
    const cleanup = page.getByTestId("admin-health").getByTestId("admin-cleanup");
    await expect(cleanup.getByRole("heading")).toHaveText("Nettoyage des événements");
    await expect(cleanup.getByTestId("admin-cleanup-latest")).toContainText("Reste après le dernier passage");
    const pass = cleanup.getByTestId("admin-cleanup-passes").locator("tbody tr").first();
    await expect(pass).toHaveAttribute("data-dry-run", "true");
    await expect(pass).toHaveAttribute("data-deleted", "0");
    await expect(pass).toHaveAttribute("data-remaining", String(counted.remaining));
    await expect(pass).toContainText("Comptage");
    await page.setViewportSize({ width: 360, height: 780 });
    await expectNoSidewaysScroll(page, "health at 360 px");
    expect(await tablesOverflowing(page)).toEqual([]);
  } finally {
    await deleteCleanupPassesSince(since);
  }
});

test("shows in its health section the archive task's pass, a count by the maintenance that writes nothing else", async ({ page, request }) => {
  const since = await databaseNow();
  try {
    // The archive's endpoint, as the daily maintenance calls it: 404 without its secret, a count with ?dryRun=1. Never
    // an archiving here: the test database's demo saves stay as they are.
    expect((await request.post("/api/maintenance/archive?dryRun=1")).status()).toBe(404);
    const response = await request.post("/api/maintenance/archive?dryRun=1", { headers: { authorization: `Bearer ${MAINTENANCE_SECRET_TEST}` } });
    expect(response.status()).toBe(200);
    const counted = (await response.json()) as { mode: string; archived: number; rowsRemaining: number; remaining: number };
    expect(counted).toMatchObject({ mode: "count", archived: 0, remaining: 0 });

    await signInAs(page, await ensureAdminUser());
    await page.goto("/admin");
    const archive = page.getByTestId("admin-health").getByTestId("admin-archive");
    await expect(archive.getByRole("heading")).toHaveText("Archives des saisons terminées");
    await expect(archive.getByTestId("admin-archive-latest")).toContainText("Reste après le dernier passage");
    const pass = archive.getByTestId("admin-archive-passes").locator("tbody tr").first();
    await expect(pass).toHaveAttribute("data-mode", "count");
    await expect(pass).toHaveAttribute("data-archived", "0");
    await expect(pass).toHaveAttribute("data-deleted", "0");
    await expect(pass).toHaveAttribute("data-remaining", String(counted.rowsRemaining));
    await expect(pass).toContainText("Comptage");
    await page.setViewportSize({ width: 360, height: 780 });
    await expectNoSidewaysScroll(page, "health at 360 px");
    expect(await tablesOverflowing(page)).toEqual([]);
  } finally {
    await deleteArchivePassesSince(since);
  }
});

test("follows a first visit from a link to the career it made, on the dashboard", async ({ browser, page }) => {
  // A source of this run only, its counts deleted at the end.
  const source = `e2e-admin-${Date.now().toString(36)}`;
  const visitor = await browser.newContext({ ...devices["Desktop Chrome"], locale: "fr-FR" });
  const player = await visitor.newPage();
  try {
    await player.goto(`/fr?ref=${source}`);
    await fillCreateSaveForm(player, `Admin ${source}`, LYON);
    await player.getByTestId("create-save").click();
    await expect(player).toHaveURL(/\/saves\/[^/]+$/);

    await signInAs(page, await ensureAdminUser());
    await page.goto("/admin");
    // The visit and the player, counted once the page that had the visit was sent.
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByTestId("admin-acquisition-sources").locator(`tr[data-source="${source}"] td`).allTextContents();
      })
      .toEqual([source, "1", "1", "100 %"]);
    await expect(page.getByTestId("admin-journey-sources").locator(`tr[data-source="${source}"] td`).nth(2)).toContainText("1");
  } finally {
    await deleteUsers([await userIdOf(visitor)]);
    await deleteVisits(source);
    await visitor.close();
  }
});
