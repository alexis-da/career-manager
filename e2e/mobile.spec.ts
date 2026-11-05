import { expect, test } from "@playwright/test";
import { demoSaveId, DEMO_USER_ID, signedUserCookie, USER_COOKIE } from "./db";
import {
  boxOf,
  createSave,
  deleteSave,
  expectNavAtFootOfScreen,
  expectNoSidewaysScroll,
  expectUncovered,
  openScreen,
  pinnedToScreen,
  saveRow,
  sidewaysOverflow,
} from "./helpers";

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
  // The club's name whole in the header, the navigation at the foot of the screen, the game's actions in the hero: no
  // bar of actions stays above the navigation any more, nothing but it is pinned to the screen.
  await expect(page.getByTestId("header-club")).toContainText(WOLVERHAMPTON);
  const nextMatch = page.getByTestId("dashboard-next-match").getByTestId("next-match");
  expect((await boxOf(nextMatch)).height).toBeGreaterThanOrEqual(44);
  expect(await pinnedToScreen(page)).toEqual(["save-nav"]);
  await expectNavAtFootOfScreen(page);

  // The next match, live: the first half, the break, the second half, the final whistle.
  await nextMatch.click();
  await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });
  await expect(page.getByTestId("live-skip")).toBeVisible();
  await expect(page.getByTestId("next-match")).toHaveCount(0);
  await expectNoSidewaysScroll(page, "live match");
  await page.getByTestId("live-skip").click();
  await expect(page.getByTestId("break-title")).toBeVisible();
  await expectNoSidewaysScroll(page, "half-time");
  await page.getByTestId("break-resume").click();
  await page.getByTestId("live-skip").click();
  await expect(page.getByTestId("live-status")).toHaveText("Terminé");
  await expectNoSidewaysScroll(page, "full time");
  await page.getByTestId("live-continue").click();
  await expect(page.getByTestId("dashboard-last-result")).toBeVisible();
  await expectNoSidewaysScroll(page, "dashboard after the match");

  // The head of Match has the game's actions, under the club's line and above the screen's tabs, in the flow of the page.
  await openScreen(page, "fixtures");
  await expect(page.getByTestId("fixtures-title")).toBeVisible();
  const atHead = page.getByTestId("next-match");
  await expect(atHead).toBeInViewport({ ratio: 1 });
  await expectUncovered(atHead);
  const button = await boxOf(atHead);
  expect(button.height).toBeGreaterThanOrEqual(44);
  expect(button.y + button.height).toBeLessThanOrEqual((await boxOf(page.getByTestId("section-tabs"))).y);
  expect(await pinnedToScreen(page)).toEqual(["save-nav"]);
  await expectNoSidewaysScroll(page, "calendar");

  // The table: compact, it holds in its frame, the club's long name included; full, it scrolls sideways in that frame, and
  // the page does not.
  await openScreen(page, "standings");
  await expect(page.getByTestId("standings-title")).toBeVisible();
  const table = page.locator('[data-testid="standings-table"]:visible');
  await expect(table.locator("tbody tr")).toHaveCount(20);
  await expect(atHead).toBeVisible();
  await expectNoSidewaysScroll(page, "table");
  const frame = table.locator("xpath=..");
  expect(await sidewaysOverflow(frame)).toBeLessThanOrEqual(0);
  await page.getByTestId("standings-full-toggle").click();
  await expect(table.locator('td[data-column="won"]').first()).toBeVisible();
  expect(await sidewaysOverflow(frame)).toBeGreaterThan(0);
  await expectNoSidewaysScroll(page, "full table");

  await openScreen(page, "cup");
  await expect(page.getByTestId("cup-title")).toBeVisible();
  await expect(atHead).toBeVisible();
  await expectNoSidewaysScroll(page, "cup");

  // The other screens leave the game's actions to the dashboard and to Match. The squad and a sheet, which names the club
  // in full, and the line-up hold in the window too (e2e/team.spec.ts has the rest of them).
  await openScreen(page, "squad");
  await expect(page.getByTestId("squad-title")).toBeVisible();
  await expect(atHead).toBeHidden();
  await expectNoSidewaysScroll(page, "squad");
  await page.getByTestId("squad-row").first().click();
  await expect(page.getByTestId("player-sheet")).toContainText(WOLVERHAMPTON);
  await expectNoSidewaysScroll(page, "player's sheet");
  await page.getByTestId("player-sheet-close").click();
  await openScreen(page, "lineup");
  await expect(page.getByTestId("lineup-title")).toBeVisible();
  await expect(atHead).toBeHidden();
  await expectNoSidewaysScroll(page, "line-up");
  await openScreen(page, "transfers");
  await expect(page.getByTestId("transfers-title")).toBeVisible();
  await expect(atHead).toBeHidden();

  await openScreen(page, "club");
  await expect(page.getByTestId("club-title")).toBeVisible();
  await expect(atHead).toBeHidden();
  await expectNoSidewaysScroll(page, "club");
  await openScreen(page, "challenge");
  await expect(page.getByTestId("challenge-title")).toBeVisible();
  await expect(atHead).toBeHidden();
  await expectNoSidewaysScroll(page, "challenge");
  await openScreen(page, "seasons");
  await expect(page.getByTestId("seasons-title")).toBeVisible();
  await expect(atHead).toBeHidden();
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
