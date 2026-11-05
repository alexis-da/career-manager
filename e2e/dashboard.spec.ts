import { expect, test, type Cookie, type Locator, type Page } from "@playwright/test";
import { deleteUsers, USER_COOKIE, userIdOf } from "./db";
import {
  ACTION_ORANGE,
  boxOf,
  createSave,
  expectClearOfNav,
  expectNoSidewaysScroll,
  expectUncovered,
  fullOrangeActions,
  openScreen,
  saveHeader,
  saveIdOf,
  textOf,
} from "./helpers";

// The dashboard of a Lyon just created: 1 July 2026, the window open, nothing played. A world of 198 clubs takes some 20
// seconds, so the tests share one, in the order of this file: those that only read it, then the one that plays its
// match, then the one that simulates the rest of its season. Its user goes at the end, and the save with them. After a
// failure, Playwright starts a new worker, which creates its own.

const LYON = "Olympique Lyonnais";

const PHONE = { width: 390, height: 844 };

// A line of « À faire » reads as one text, its title against its detail.

/** « Ton point faible : latéral droit », then « Note 63 · voir le marché ». */
const WEAK_SPOT = /^Ton point faible : (.+)Note (\d+) · voir le marché$/;

/** « Lille OSC propose 12,5 M€ pour Jean Morel », then « 3 offres pour tes remplaçants ». */
const BEST_OFFER = /^(.+) propose (.+) pour (.+?)(\d+) offres? pour tes remplaçants$/;

let saveId = "";
let ownerId: string | null = null;
let ownerCookies: Cookie[] = [];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    // A unique name (not simulation code: the clock is fine here).
    await createSave(page, `E2E accueil ${Date.now()}`, LYON);
    saveId = saveIdOf(page);
    ownerCookies = (await context.cookies()).filter(({ name }) => name === USER_COOKIE);
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    ownerId = await userIdOf(context);
    await context.close();
  }
});

test.afterAll(async () => {
  await deleteUsers([ownerId]);
});

/** The shared save's dashboard, opened by its owner in the test's own browser. */
async function openDashboard(page: Page): Promise<void> {
  await page.context().addCookies(ownerCookies);
  await page.goto(`/saves/${saveId}`);
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
}

const heroOf = (page: Page): Locator => page.getByTestId("dashboard-next-match");

/** One full orange action on the screen, the hero's: the design's rule, read from the colour the browser computes. */
async function expectOneOrangeAction(page: Page, action: string): Promise<void> {
  await expect(page.locator(`[data-testid="${action}"]`)).toHaveCount(1);
  await expect(heroOf(page).getByTestId(action)).toHaveCSS("background-color", ACTION_ORANGE);
  expect(await fullOrangeActions(page)).toEqual([action]);
}

test("names the next match in the hero: its opponent, its date and its competition", async ({ page }) => {
  await openDashboard(page);
  const hero = heroOf(page);
  await expect(hero.getByRole("heading")).toHaveText("Prochain match · Journée 1");
  await expect(hero).toContainText(/sam\. 15 août · (Domicile|Extérieur) · France — Division 1/);
  await expect(hero).toContainText(LYON);

  // The opponent, as its own panel names it: not the club the player manages, and the same in the sidebar's card.
  await hero.getByTestId("view-opponent").click();
  const title = page.getByTestId("opponent-title");
  await expect(title).not.toBeEmpty();
  const opponent = await textOf(title);
  expect(opponent).not.toBe(LYON);
  await page.keyboard.press("Escape");
  await expect(title).toBeHidden();
  await expect(hero).toContainText(opponent);
  await expect(saveHeader(page)).toContainText(`vs ${opponent}`);
});

test("opens the simulation's menu from the hero, and prepares the match on the line-up", async ({ page }) => {
  await openDashboard(page);
  const hero = heroOf(page);

  const simulate = hero.getByTestId("simulate-menu");
  await expect(simulate).toHaveText("Simuler");
  await simulate.click();
  for (const target of ["next-match", "month-end", "window-close", "season-end", "pick-date"]) {
    await expect(page.getByTestId(`simulate-${target}`)).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("simulate-month-end")).toBeHidden();

  const prepare = hero.getByTestId("dashboard-lineup");
  await expect(prepare).toHaveText("Préparer");
  await prepare.click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/lineup$`));
  await expect(page.getByTestId("lineup-title")).toBeVisible();
});

test("sums the club up: its money at the top of the page, its season in tiles, blank before its first match", async ({ page }) => {
  await openDashboard(page);

  await expect(page.getByTestId("dashboard-budget")).toHaveText(/^Budget \d+(,\d+)? M€$/);
  await expect(page.getByTestId("dashboard-payroll")).toHaveText(/^Salaires \d+,\d \/ \d+,\d M€$/);
  await expect(page.locator('[data-summary="payroll"]')).toHaveAttribute("data-value", /^[1-9]\d*$/);
  await expect(page.getByTestId("dashboard-window")).toHaveText("Mercato ouvert jusqu'au 31 août");

  await expect(page.getByTestId("dashboard-position")).toContainText("—");
  await expect(page.getByTestId("dashboard-points")).toContainText("—");
  await expect(page.getByTestId("dashboard-form")).toContainText("Pas encore de match");
  await expect(page.getByTestId("dashboard-squad")).toContainText(/\d+ ?joueurs/);
});

test("shows the player's club in the small table, and leads to the full one", async ({ page }) => {
  await openDashboard(page);
  const table = page.getByTestId("dashboard-table");
  await expect(table.getByRole("heading")).toHaveText("France — Division 1 · 2026-27");

  // Its line among its neighbours', in bold.
  await expect(table.locator("li")).toHaveCount(6);
  const managed = table.locator("li[data-managed]");
  await expect(managed).toContainText(LYON);
  await expect(managed).toHaveCSS("font-weight", "700");

  await table.getByTestId("dashboard-full-table").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/standings$`));
  await expect(page.getByTestId("standings-title")).toBeVisible();
  await expect(page.locator('[data-testid="standings-table"]:visible tr[data-managed]')).toContainText(LYON);
});

test("sends the weak spot to the market and, while the window is open, the best offer to its sales", async ({ page }) => {
  await openDashboard(page);

  // The market says the same of the same spot.
  const weakSpot = page.getByTestId("dashboard-alerts").getByTestId("alert-weak-spot");
  await expect(weakSpot).toHaveText(WEAK_SPOT);
  const [, position, rating] = WEAK_SPOT.exec(await textOf(weakSpot)) ?? [];
  await weakSpot.getByTestId("alert-action").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/transfers$`));
  await expect(page.getByTestId("market-intro")).toHaveText(`Ton point faible : ${position} (note ${rating}). Voici qui le comblerait.`);

  // The sales open on the offer the line gives, and count as many.
  await openScreen(page, "dashboard");
  const offers = page.getByTestId("dashboard-alerts").getByTestId("alert-offers");
  await expect(offers).toHaveText(BEST_OFFER);
  const [, buyer, fee, player, count] = BEST_OFFER.exec(await textOf(offers)) ?? [];
  await offers.getByTestId("alert-action").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/transfers\\?tab=sell$`));
  const best = page.getByTestId("market-sell").getByTestId("market-sale-offer");
  await expect(best).toHaveAttribute("aria-label", player);
  await expect(best).toContainText(buyer);
  await expect(best).toContainText(fee);
  await expect(page.getByTestId("market-tab-sell")).toHaveText(new RegExp(`^Vendre · ${count} offres?$`));
});

test("leads to the week's challenge from a career outside it", async ({ page }) => {
  await openDashboard(page);
  await expect(page.getByTestId("challenge-banner")).toHaveCount(0);

  const card = page.getByTestId("dashboard-challenge");
  await expect(card).toContainText("Défi de la semaine");
  await card.getByRole("link").click();
  await expect(page).toHaveURL(/\/challenge$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Défi de la semaine");
});

test("has one full orange action, the hero's", async ({ page }) => {
  await openDashboard(page);
  await expectOneOrangeAction(page, "next-match");
});

test.describe("on a phone, in English", () => {
  test.use({ locale: "en-GB", viewport: PHONE });

  test("stays within the screen, and its one orange action is never covered", async ({ page }) => {
    await openDashboard(page);
    const hero = heroOf(page);
    const play = hero.getByTestId("next-match");

    await expect(page.getByTestId("dashboard-title")).toHaveText("Dashboard");
    await expect(hero.getByRole("heading")).toHaveText("Next match · Matchday 1");
    await expect(hero).toContainText("France — Division 1");
    await expect(play).toHaveText("Play the match");
    await expect(hero.getByTestId("dashboard-lineup")).toHaveText("Prepare");
    await expect(hero.getByTestId("simulate-menu")).toHaveText("Simulate");
    await expect(hero.getByTestId("view-opponent")).toHaveText("View opponent");
    for (const control of ["next-match", "dashboard-lineup", "simulate-menu", "view-opponent"]) {
      expect((await boxOf(hero.getByTestId(control))).height).toBeGreaterThanOrEqual(44);
    }
    await expectOneOrangeAction(page, "next-match");
    await expectNoSidewaysScroll(page, "dashboard");

    // In view from the start, nothing over it.
    await expect(play).toBeInViewport({ ratio: 1 });
    await expectUncovered(play);

    // To the foot of the page, whose last card clears the navigation, and back: the button scrolls with the page, and
    // toBeInViewport alone would pass for a button under the bar.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expectClearOfNav(page, page.getByTestId("dashboard-table"));
    await play.evaluate((button) => button.scrollIntoView({ block: "center" }));
    await expect(play).toBeInViewport({ ratio: 1 });
    await expectUncovered(play);
  });
});

test("plays the match from the hero, offers only to resume it at the break, then shows its result", async ({ page }) => {
  // A matchday played, then its match live, to the break and on to the final whistle.
  test.setTimeout(240_000);
  await openDashboard(page);
  const hero = heroOf(page);
  const play = hero.getByTestId("next-match");
  await expect(play).toHaveText("Jouer le match");
  await play.click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live\\?rejouer=1$`), { timeout: 120_000 });
  await page.getByTestId("live-skip").click();
  await expect(page.getByTestId("break-title")).toBeVisible();

  // The match waits: the hero's one way on is back to it, and nothing can be simulated. The break's card closed first: it
  // is modal.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("break-card")).toBeHidden();
  await openScreen(page, "dashboard");
  const resume = hero.getByTestId("resume-match");
  await expect(resume).toHaveText("Match en cours — reprendre");
  await expect(page.getByTestId("next-match")).toHaveCount(0);
  await expect(page.getByTestId("simulate-menu")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-lineup")).toHaveCount(0);
  await expectOneOrangeAction(page, "resume-match");

  await resume.click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live$`));
  await page.getByTestId("break-resume").click();
  await page.getByTestId("live-skip").click();
  await page.getByTestId("live-continue").click();

  // The hero goes on to the next match; the cards have the one played.
  await expect(hero.getByRole("heading")).toHaveText("Prochain match · Journée 2");
  await expect(play).toBeVisible();
  const lastResult = page.getByTestId("dashboard-last-result");
  await expect(lastResult).toContainText("Dernier résultat · Journée 1");
  await expect(lastResult).toContainText(LYON);
  await expect(lastResult.getByTestId("first-actions")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-position")).toContainText(/\d/);
  await expect(page.getByTestId("dashboard-points")).toContainText(/\d/);
  await expect(page.getByTestId("dashboard-form").locator("span[title]")).toHaveCount(1);

  await lastResult.getByTestId("dashboard-match-report").click();
  // On the month of the match played: the calendar alone would open on the next one's.
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/fixtures\\?mois=2026-08$`));
  await expect(page.getByTestId("fixtures-title")).toBeVisible();
  await expect(page.getByTestId("fixtures-month")).toHaveText("août 2026");
});

// Last: nothing is left to play after it.
test("leads only to the next season once this one is over, with no offer to show out of the window", async ({ page }) => {
  // The rest of the season, simulated.
  test.setTimeout(240_000);
  await openDashboard(page);
  await heroOf(page).getByTestId("simulate-menu").click();
  await page.getByTestId("simulate-season-end").click();
  await page.locator('[data-simulation="dialog"]').getByRole("button", { name: "Continuer" }).click({ timeout: 180_000 });
  await openDashboard(page);

  // No match left to name or to prepare: the sidebar's card goes, the hero keeps the way on.
  await expect(heroOf(page)).toContainText("La saison est terminée.");
  await expect(page.getByTestId("dashboard-lineup")).toHaveCount(0);
  await expect(page.getByTestId("simulate-menu")).toHaveCount(0);
  await expect(page.getByTestId("header-next-match")).toBeHidden();
  await expectOneOrangeAction(page, "next-season");

  await expect(page.getByTestId("dashboard-window")).toHaveText("Fenêtre fermée jusqu'au 1er juil.");
  await expect(page.getByTestId("alert-weak-spot").getByTestId("alert-action")).toHaveAttribute("href", `/saves/${saveId}/transfers`);
  await expect(page.getByTestId("alert-offers")).toHaveCount(0);
});
