import { expect, test } from "@playwright/test";
import { demoSaveId, DEMO_USER_ID, signedUserCookie, USER_COOKIE } from "./db";
import { boxOf, createSave, deleteSave, expectNavAtFootOfScreen, expectNoSidewaysScroll, openScreen, saveRow } from "./helpers";

// The game on a phone's screen, 390 × 844: at every step, the page is never wider than the window, so nothing scrolls
// sideways. The career's club has the longest name of the game, the one most likely to push a screen wider.
const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE });

const WOLVERHAMPTON = "Wolverhampton Wanderers FC";

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("plays a career on a phone, from the home page to the honours, never wider than the screen", async ({ page }) => {
  // A world of 198 clubs created, then a match played live after the dates before it.
  test.setTimeout(300_000);
  // A unique name to find this save again (not simulation code: the clock is fine here).
  const name = `E2E téléphone ${Date.now()}`;
  saveName = name;

  await page.goto("/");
  await expectNoSidewaysScroll(page, "home page");
  await page.getByTestId("club").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expectNoSidewaysScroll(page, "list of clubs");
  await page.keyboard.press("Escape");

  await createSave(page, name, WOLVERHAMPTON);
  await expectNoSidewaysScroll(page, "dashboard");
  // The club's name whole in the header, the game's actions above the navigation, itself at the foot of the screen.
  await expect(page.getByTestId("header-club")).toContainText(WOLVERHAMPTON);
  const nextMatch = page.getByTestId("next-match");
  const button = await boxOf(nextMatch);
  const nav = await boxOf(page.getByTestId("save-nav"));
  expect(button.height).toBeGreaterThanOrEqual(44);
  expect(button.y + button.height).toBeLessThanOrEqual(nav.y);
  await expectNavAtFootOfScreen(page);

  // The next match, live: the first half, the break, the second half, the final whistle.
  await nextMatch.click();
  await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });
  await expect(page.getByTestId("live-skip")).toBeVisible();
  await expectNoSidewaysScroll(page, "live match");
  await page.getByTestId("live-skip").click();
  await expect(page.getByTestId("half-time-title")).toBeVisible();
  await expectNoSidewaysScroll(page, "half-time");
  await page.getByTestId("half-time-resume-unchanged").click();
  await page.getByTestId("live-skip").click();
  await expect(page.getByTestId("live-status")).toHaveText("Terminé");
  await expectNoSidewaysScroll(page, "full time");
  await page.getByTestId("live-continue").click();
  await expect(page.getByTestId("dashboard-last-result")).toBeVisible();
  await expectNoSidewaysScroll(page, "dashboard after the match");

  // The table: only the full table scrolls sideways, inside its own frame.
  await openScreen(page, "standings");
  await expect(page.getByTestId("standings-title")).toBeVisible();
  await expect(page.locator('[data-testid="standings-table"]:visible tbody tr')).toHaveCount(20);
  await expectNoSidewaysScroll(page, "table");

  await openScreen(page, "club");
  await expect(page.getByTestId("seasons-title")).toBeVisible();
  await expectNoSidewaysScroll(page, "honours");

  // Back home, the career is a card of the list.
  await page.goto("/");
  await expect(saveRow(page, name)).toBeVisible();
  await expectNoSidewaysScroll(page, "home page with a career");
});

test("shows a finished season's honours and card on a phone, never wider than the screen", async ({ page, context, baseURL }) => {
  const saveId = await demoSaveId();
  // The demo user's cookie, as the server signs it: the save opens for its owner only.
  await context.addCookies([{ name: USER_COOKIE, value: signedUserCookie(DEMO_USER_ID), url: baseURL ?? "" }]);

  await page.goto(`/saves/${saveId}/seasons`);
  await expect(page.getByTestId("seasons-table")).toBeVisible();
  await expectNoSidewaysScroll(page, "honours of the demo save");

  await page.getByTestId("seasons-card-link-2026").click();
  await expect(page.getByTestId("season-card-image")).toBeVisible();
  await expectNoSidewaysScroll(page, "season page and card");
});
