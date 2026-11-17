import { expect, test } from "@playwright/test";
import { createAnonymousUser, deleteUsers, giveTokens, setTodaysMissions } from "./db";
import { boxOf, createSave, expectNoSidewaysScroll, expectOrangeActions, openScreen, saveIdOf, signInAs, waitForReact } from "./helpers";

// The missions of the day, v2 (CLAUDE.md « Missions du jour, jetons et récompenses »): their card under the dashboard's
// hero, a mission changed, two done by a live match played to its end with the streak's bonus, recalled in the « À
// demain » card; then the Rewards tab, its journal and a fitness camp bought. In English, at 1280 px, the way to the
// line-up for a youngster to start, a title bought and worn, a streak shield. A player of their own each time, their
// missions set in the database (the draw is the player's and the day's), deleted with their career at the end.

const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1280, height: 800 };
const LYON = "Olympique Lyonnais";

test.describe("on a phone, in French", () => {
  test.use({ viewport: PHONE });

  test("shows three missions, changes one, does two by a live match with the streak's bonus, then spends the tokens", async ({ page }) => {
    // A career created, then its first match live, the dates before it played first.
    test.setTimeout(300_000);
    const userId = await createAnonymousUser(new Date());
    try {
      await signInAs(page, userId);
      await createSave(page, `E2E missions ${Date.now()}`, LYON);
      const saveId = saveIdOf(page);
      // Its own missions after two days in a row: a match, the next one live, a live win.
      await setTodaysMissions(userId, { EASY: { kind: "PLAY_MATCH" }, MEDIUM: { kind: "PLAY_LIVE" }, HARD: { kind: "LIVE_WIN" } }, 2);
      await page.reload();
      await waitForReact(page);

      const card = page.getByTestId("daily-missions");
      const tasks = card.getByTestId("mission-task");
      await expect(tasks).toHaveCount(3);
      await expect(tasks.nth(0)).toHaveAttribute("data-kind", "PLAY_MATCH");
      await expect(tasks.nth(1).getByTestId("mission-title")).toHaveText("Joue ton prochain match en direct");
      await expect(card.getByTestId("mission-streak")).toHaveText("2 jours d'affilée");
      await expect(card.getByTestId("mission-tokens")).toHaveAttribute("data-tokens", "0");
      await expect(card.getByTestId("mission-streak-line")).toHaveText("Une mission aujourd'hui pour passer à 3 jours.");
      await expect(card.getByTestId("mission-cycle")).toHaveAttribute("data-cycle-day", "2");
      // Under the hero and a new career's first actions; the hero keeps the one orange.
      const hero = await boxOf(page.getByTestId("dashboard-next-match"));
      expect((await boxOf(card)).y).toBeGreaterThan(hero.y);
      expect((await boxOf(card)).y).toBeGreaterThan((await boxOf(page.getByTestId("dashboard-first-steps"))).y);
      await expectNoSidewaysScroll(page, "the dashboard and its missions");
      await expectOrangeActions(page, ["next-match"]);

      // The hard one changed, once: a touch asks, the second changes it; no change left after.
      await tasks.nth(2).getByTestId("mission-change").click();
      await tasks.nth(2).getByTestId("mission-change-yes").click();
      await expect(tasks.nth(2)).not.toHaveAttribute("data-kind", "LIVE_WIN");
      await expect(card.getByTestId("mission-change")).toHaveCount(0);

      // The match live, to the break, then to its end.
      await page.getByTestId("next-match").click();
      await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live`), { timeout: 120_000 });
      await page.getByTestId("live-skip").click();
      await expect(page.getByTestId("break-title")).toBeVisible();
      await page.getByTestId("break-resume").click();
      await page.getByTestId("live-skip").click();

      // The final whistle: two missions done at least, their tokens and the third day's bonus, the streak a day longer.
      const line = page.getByTestId("session-end").getByTestId("session-end-mission");
      await expect(line).toBeVisible();
      expect(Number(await line.getAttribute("data-done"))).toBeGreaterThanOrEqual(2);
      await expect(line.getByTestId("session-end-tokens")).toContainText(/^\+(80|1\d\d) aujourd'hui · solde (80|1\d\d)$/);
      await expect(line.getByTestId("mission-streak")).toHaveText("3 jours d'affilée");
      await expectNoSidewaysScroll(page, "the final whistle and its missions");
      await page.getByTestId("live-continue").click();

      // Back on the dashboard: the easy and the medium ones done, the third day of the cycle earned.
      await expect(tasks.nth(0)).toHaveAttribute("data-completed", "true");
      await expect(tasks.nth(1)).toHaveAttribute("data-completed", "true");
      await expect(card.getByTestId("mission-cycle")).toHaveAttribute("data-cycle-day", "3");
      await expect(card).toContainText("J3 : +50 gagné");

      // The Rewards tab: the balance, the journal, the streak; a fitness camp bought, the only orange in its sheet.
      await openScreen(page, "rewards");
      const balance = Number(await page.getByTestId("rewards-tokens").getAttribute("data-tokens"));
      expect(balance).toBeGreaterThanOrEqual(80);
      await expect(page.getByTestId("token-entry").first()).toBeVisible();
      await expect(page.getByTestId("token-entry").filter({ hasText: "Série : bonus du jour 3" })).toHaveCount(1);
      await expect(page.getByTestId("rewards-streak")).toHaveAttribute("data-streak", "3");
      await expectNoSidewaysScroll(page, "the Rewards tab");
      await expectOrangeActions(page, []);
      const camp = page.locator('[data-testid="shop-item"][data-item="FITNESS_CAMP"]');
      await expect(camp.getByTestId("shop-item-limits")).toHaveText("5 sur 5 cette saison");
      await camp.getByTestId("shop-buy").click();
      const sheet = page.getByTestId("purchase-sheet");
      await expect(sheet).toBeVisible();
      await expect(sheet.getByTestId("purchase-balance")).toHaveText(`Solde après : ${balance - 40} jetons`);
      await expectOrangeActions(page, ["purchase-confirm"]);
      await sheet.getByTestId("purchase-confirm").click();
      await expect(sheet).toBeHidden();
      await expect(page.getByTestId("rewards-tokens")).toHaveAttribute("data-tokens", String(balance - 40));
      await expect(camp.getByTestId("shop-item-limits")).toHaveText("4 sur 5 cette saison");
      await expect(camp).toHaveAttribute("data-refusal", "camp_today");

      // The collection: the frames, the night one worn, those of the streak and the shop locked.
      await page.getByTestId("collection-frame").click();
      await expect(page.locator('[data-testid="cosmetic"][data-cosmetic="frame-night"]')).toHaveAttribute("data-worn", "true");
      await expect(page.locator('[data-testid="cosmetic"][data-cosmetic="frame-bronze"]')).toHaveAttribute("data-owned", "false");
      await expectNoSidewaysScroll(page, "the collection of frames");
    } finally {
      await deleteUsers([userId]);
    }
  });
});

test.describe("on a computer, in English", () => {
  test.use({ viewport: COMPUTER, locale: "en-GB" });

  test("leads a youngster's mission to the line-up, buys and wears a title and a streak shield", async ({ page }) => {
    test.setTimeout(180_000);
    const userId = await createAnonymousUser(new Date());
    try {
      await signInAs(page, userId);
      await createSave(page, `E2E missions EN ${Date.now()}`, LYON);
      const saveId = saveIdOf(page);
      await setTodaysMissions(userId, { EASY: { kind: "START_YOUTH" }, MEDIUM: { kind: "WIN" }, HARD: { kind: "LIVE_CLEAN_SHEET" } });
      await giveTokens(userId, 400);
      await page.reload();
      await waitForReact(page);

      const card = page.getByTestId("daily-missions");
      const youth = card.locator('[data-testid="mission-task"][data-tier="EASY"]');
      await expect(youth.getByTestId("mission-title")).toHaveText("Start a player aged 21 or under");
      await expect(youth).toContainText("Put him in your eleven, then play the match.");
      await expect(card.getByTestId("mission-streak-line")).toHaveText("One mission today starts your streak.");
      await expect(card.getByTestId("mission-streak")).toHaveCount(0);
      await expect(card.getByTestId("mission-tokens")).toHaveAttribute("data-tokens", "400");
      // Across the page, under the hero and the small table.
      expect((await boxOf(card)).width).toBeGreaterThan((await boxOf(page.getByTestId("dashboard-next-match"))).width);
      await youth.getByTestId("mission-lineup").click();
      await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/lineup$`));

      // The Rewards tab, in English: a title bought, then worn; the shield bought, kept in reserve.
      await openScreen(page, "rewards");
      await expect(page.getByTestId("rewards-title")).toHaveText("Rewards");
      const professor = page.locator('[data-testid="cosmetic"][data-cosmetic="title-professor"]');
      await professor.getByTestId("cosmetic-buy").click();
      const sheet = page.getByTestId("purchase-sheet");
      await expect(sheet).toContainText("The Professor");
      await sheet.getByTestId("purchase-confirm").click();
      await expect(sheet).toBeHidden();
      await expect(professor).toHaveAttribute("data-owned", "true");
      await professor.getByTestId("cosmetic-wear").click();
      await expect(professor).toHaveAttribute("data-worn", "true");
      const shield = page.locator('[data-testid="shop-item"][data-item="STREAK_SHIELD"]');
      await shield.getByTestId("shop-buy").click();
      await sheet.getByTestId("purchase-confirm").click();
      await expect(sheet).toBeHidden();
      await expect(page.getByTestId("rewards-tokens")).toHaveAttribute("data-tokens", "100");
      await expect(shield).toHaveAttribute("data-refusal", "shield_held");

      // The Club screen: the title worn beside the manager.
      await openScreen(page, "club");
      await expect(page.getByTestId("club-manager-title")).toHaveText("The Professor");
    } finally {
      await deleteUsers([userId]);
    }
  });
});
