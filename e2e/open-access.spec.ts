import { expect, test } from "@playwright/test";
import { MAINTENANCE_SECRET_TEST } from "./constants";
import { createAnonymousUser, deleteUsers, signedUserCookie, USER_COOKIE, userExists } from "./db";
import { createSave, deleteSave, fillCreateSaveForm, saveRow } from "./helpers";

const LYON = "Olympique Lyonnais";
const DAY_MS = 86_400_000;
const LIMIT_MESSAGE = "Tu as déjà une carrière en cours. Connecte-toi avec Google pour en mener jusqu'à trois.";
const BANNER = "Crée un compte pour ne pas perdre ta carrière";

/** What the maintenance endpoint answers (src/db/purge.ts, PurgeResult). */
type PurgeResponse = { dryRun: boolean; inactive: number; empty: number; total: number; remaining: number };

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("refuses a second save to an anonymous player with the message, and puts it in place of the form", async ({ page }) => {
  // A unique name to find this save again (not simulation code: the clock is fine here).
  const name = `E2E limite ${Date.now()}`;
  saveName = name;
  // A second tab of the same browser, opened on the creation form before the first save exists.
  const otherTab = await page.context().newPage();
  await otherTab.goto("/");
  await expect(otherTab.getByTestId("create-save")).toBeVisible();

  await createSave(page, name, LYON);

  // The tab opened earlier still shows the form: the server refuses the creation with the message.
  await fillCreateSaveForm(otherTab, `${name} bis`, LYON);
  await otherTab.getByTestId("create-save").click();
  await expect(otherTab.getByTestId("create-save-message")).toHaveText(LIMIT_MESSAGE);
  await otherTab.close();

  // Back on the home page, the message and the Google button replace the form; the one save is there.
  await page.goto("/");
  const notice = page.getByTestId("save-limit");
  await expect(notice.getByText(LIMIT_MESSAGE)).toBeVisible();
  await expect(notice.getByTestId("google-sign-in")).toBeVisible();
  await expect(page.getByTestId("create-save")).toHaveCount(0);
  await expect(saveRow(page, name)).toHaveCount(1);
  await expect(saveRow(page, `${name} bis`)).toHaveCount(0);
});

test("asks an anonymous player to sign in once a matchday is played, and the cross puts it away", async ({ page }) => {
  const name = `E2E bandeau ${Date.now()}`;
  saveName = name;
  await createSave(page, name, LYON);
  // Nothing played yet: no banner.
  await expect(page.getByText(BANNER)).toHaveCount(0);

  await page.getByRole("button", { name: "Prochain match" }).click();
  await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/);
  await page.getByRole("button", { name: "Passer" }).click();
  await page.getByRole("button", { name: "Reprendre sans changement" }).click();
  await page.getByRole("button", { name: "Passer" }).click();
  await page.getByRole("link", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

  const banner = page.getByRole("region", { name: "Compte" });
  await expect(banner.getByText(BANNER)).toBeVisible();
  await expect(banner.getByRole("button", { name: /Google/ })).toBeVisible();
  await banner.getByRole("button", { name: "Fermer" }).click();
  await expect(page.getByText(BANNER)).toHaveCount(0);

  // Remembered in a cookie for 7 days: still away after a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await expect(page.getByText(BANNER)).toHaveCount(0);
  const closed = (await page.context().cookies()).find((cookie) => cookie.name === "lw_banner_closed");
  expect(closed?.expires).toBeGreaterThan(Date.now() / 1000 + 6 * 24 * 3600);
});

test("purges an anonymous user not seen for 40 days: counted in dry run, deleted batch after batch, 404 without the secret", async ({ request }) => {
  // Not simulation code: the user is aged against real time.
  const userId = await createAnonymousUser(new Date(Date.now() - 40 * DAY_MS));
  try {
    const authorization = `Bearer ${MAINTENANCE_SECRET_TEST}`;
    expect((await request.post("/api/maintenance/purge", { headers: { authorization: "Bearer wrong" } })).status()).toBe(404);
    expect((await request.post("/api/maintenance/purge")).status()).toBe(404);

    const dryRun = await request.post("/api/maintenance/purge?dryRun=1", { headers: { authorization } });
    expect(dryRun.status()).toBe(200);
    const counted = (await dryRun.json()) as PurgeResponse;
    expect(counted).toMatchObject({ dryRun: true, total: expect.any(Number), remaining: expect.any(Number) });
    expect(counted.total + counted.remaining).toBeGreaterThanOrEqual(1);
    expect(await userExists(userId)).toBe(true);

    // Batch after batch, as the workflow calls (20 calls at most), until none remain.
    let purged: PurgeResponse | undefined;
    for (let call = 0; call < 20 && (purged === undefined || purged.remaining > 0); call++) {
      const purge = await request.post("/api/maintenance/purge", { headers: { authorization } });
      expect(purge.status()).toBe(200);
      purged = (await purge.json()) as PurgeResponse;
      expect(purged).toMatchObject({ dryRun: false });
    }
    expect(purged?.remaining).toBe(0);
    expect(await userExists(userId)).toBe(false);
  } finally {
    await deleteUsers([userId]);
  }
});

test("answers 404 on /admin/stats to an anonymous player, and to a visitor without a cookie", async ({ page, baseURL }) => {
  expect((await page.goto("/admin/stats"))?.status()).toBe(404);

  // Not simulation code: a player seen just now.
  const userId = await createAnonymousUser(new Date());
  try {
    await page.context().addCookies([{ name: USER_COOKIE, value: signedUserCookie(userId), url: baseURL }]);
    expect((await page.goto("/admin/stats"))?.status()).toBe(404);
    await expect(page.getByText("Statistiques")).toHaveCount(0);
  } finally {
    await deleteUsers([userId]);
  }
});
