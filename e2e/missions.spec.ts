import { expect, test } from "@playwright/test";
import { createAnonymousUser, deleteUsers, setTodaysMission } from "./db";
import { boxOf, createSave, expectNoSidewaysScroll, expectOrangeActions, openScreen, saveIdOf, signInAs, waitForReact } from "./helpers";

// The mission of the day (CLAUDE.md « Mission du jour »): its card under the dashboard's hero, done by a live match played
// to its end, recalled in the « À demain » card, the streak a day longer in the club's settings; in English, the way to the
// line-up for a youngster to start. A player of its own each time, its mission set in the database (the draw is the
// player's and the day's), deleted with their career at the end.

const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1280, height: 800 };
const LYON = "Olympique Lyonnais";

test.describe("on a phone, in French", () => {
  test.use({ viewport: PHONE });

  test("shows the day's mission under the hero, done by a live match, then tomorrow's and the streak", async ({ page }) => {
    // A career created, then its first match live, the dates before it played first.
    test.setTimeout(300_000);
    const userId = await createAnonymousUser(new Date());
    try {
      await signInAs(page, userId);
      await createSave(page, `E2E missions ${Date.now()}`, LYON);
      const saveId = saveIdOf(page);
      // Its own mission after two days in a row: to play the next match live.
      await setTodaysMission(userId, "PLAY_LIVE", 1, 2);
      await page.reload();
      await waitForReact(page);

      const card = page.getByTestId("daily-mission");
      await expect(card).toHaveAttribute("data-kind", "PLAY_LIVE");
      await expect(card).toHaveAttribute("data-completed", "false");
      await expect(card.getByTestId("mission-title")).toHaveText("Joue ton prochain match en direct");
      await expect(card.getByTestId("mission-streak")).toHaveText("2 jours d'affilée");
      await expect(card.getByTestId("mission-streak-line")).toHaveText("Accomplis-la pour passer à 3 jours.");
      await expect(card.getByTestId("mission-progress")).toHaveText("0/1");
      // Under the hero and a new career's first actions, before the rest of the page; the hero keeps the one orange.
      const hero = await boxOf(page.getByTestId("dashboard-next-match"));
      const firstSteps = await boxOf(page.getByTestId("dashboard-first-steps"));
      const mission = await boxOf(card);
      expect(firstSteps.y).toBeGreaterThan(hero.y);
      expect(mission.y).toBeGreaterThan(firstSteps.y);
      expect(mission.y).toBeLessThan((await boxOf(page.getByTestId("dashboard-objectives"))).y);
      await expectNoSidewaysScroll(page, "the dashboard and its mission");
      await expectOrangeActions(page, ["next-match"]);

      // The match live, to the break, then to its end.
      await page.getByTestId("next-match").click();
      await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live`), { timeout: 120_000 });
      await page.getByTestId("live-skip").click();
      await expect(page.getByTestId("break-title")).toBeVisible();
      await page.getByTestId("break-resume").click();
      await page.getByTestId("live-skip").click();

      // The final whistle: the mission done in « À demain », the streak a day longer, tomorrow's to come.
      const line = page.getByTestId("session-end").getByTestId("session-end-mission");
      await expect(line).toHaveAttribute("data-completed", "true");
      await expect(line).toContainText("Mission du jour accomplie");
      await expect(line.getByTestId("mission-streak")).toHaveText("3 jours d'affilée");
      await expect(line).toContainText("Demain : nouvelle mission");
      await expectNoSidewaysScroll(page, "the final whistle and its mission");
      await page.getByTestId("live-continue").click();

      // Back on the dashboard: done, its record, tomorrow's to come.
      await expect(card).toHaveAttribute("data-completed", "true");
      await expect(card.getByTestId("mission-done")).toHaveText("Mission accomplie · C'est ton record.");
      await expect(card).toContainText("Demain : nouvelle mission");
      await expect(card.getByTestId("mission-progress")).toHaveText("1/1");
      await expect(card.getByTestId("mission-streak")).toHaveText("3 jours d'affilée");

      // The club's settings: the streak running and the record.
      await openScreen(page, "club");
      const streak = page.getByTestId("settings-streak");
      await expect(streak).toContainText("Missions du jour");
      await expect(streak.getByTestId("mission-streak")).toHaveText("3 jours d'affilée");
      await expect(streak).toContainText("Record : 3 jours");
      await expectNoSidewaysScroll(page, "the club's settings and the streak");
    } finally {
      await deleteUsers([userId]);
    }
  });
});

test.describe("on a computer, in English", () => {
  test.use({ viewport: COMPUTER, locale: "en-GB" });

  test("asks to start a youngster, the way to the line-up beside it, and says how a streak starts", async ({ page }) => {
    test.setTimeout(180_000);
    const userId = await createAnonymousUser(new Date());
    try {
      await signInAs(page, userId);
      await createSave(page, `E2E missions EN ${Date.now()}`, LYON);
      const saveId = saveIdOf(page);
      await setTodaysMission(userId, "START_YOUTH", 1);
      await page.reload();
      await waitForReact(page);

      const card = page.getByTestId("daily-mission");
      await expect(card.getByTestId("mission-title")).toHaveText("Start a player aged 21 or under");
      await expect(card).toContainText("Put him in your eleven, then play the match.");
      await expect(card.getByTestId("mission-streak-line")).toHaveText("Complete it to start your streak.");
      await expect(card.getByTestId("mission-streak")).toHaveCount(0);
      // Across the page, under the hero and the small table.
      const width = (await boxOf(card)).width;
      expect(width).toBeGreaterThan((await boxOf(page.getByTestId("dashboard-next-match"))).width);
      await card.getByTestId("mission-lineup").click();
      await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/lineup$`));
    } finally {
      await deleteUsers([userId]);
    }
  });
});
