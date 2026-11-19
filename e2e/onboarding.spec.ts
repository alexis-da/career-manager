import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { deleteUsers, userIdOf } from "./db";
import { boxOf, E2E_SEED, expectNoSidewaysScroll, expectUncovered, openScreen } from "./helpers";

// The first visit of a new player, without a cookie: a club card, the tutorial of the first career passed at once with
// its own button (e2e/tutorial.spec.ts follows it), the tips, the first match, its result; and a challenge save, which
// keeps its first actions that tick themselves. In French on a computer, in English on a phone, never wider than the
// screen. Each test deletes the user it made, and their saves with them.

const JOURNEYS = [
  {
    name: "in French, on a computer",
    locale: "fr-FR",
    home: "/fr",
    challenge: "/fr/defi",
    viewport: { width: 1280, height: 800 },
    clubs: { favourite: "Paris Saint-Germain FC", "mid-table": "Toulouse FC", comeback: "USL Dunkerque" },
    careerName: "Carrière Toulouse FC",
    // What the recommended card announces, then the dashboard sets: the same objective, in the same words.
    objective: "Finir 10e ou mieux",
    playMatch: "Jouer le match",
    skipped: "Tutoriel passé. Tu peux le reprendre dans Club, Réglages.",
    leaveMatch: "nav-dashboard", // the sidebar stays beside the match
  },
  {
    name: "in English, on a phone",
    locale: "en-GB",
    home: "/",
    challenge: "/challenge",
    viewport: { width: 390, height: 844 },
    clubs: { favourite: "Liverpool FC", "mid-table": "Fulham FC", comeback: "Sunderland AFC" },
    careerName: "Fulham FC career",
    objective: "Finish 11th or higher",
    playMatch: "Play the match",
    skipped: "Tutorial skipped. You can pick it up again in Club, Settings.",
    leaveMatch: "live-exit", // the match has the whole screen, and its own way out
  },
];

const firstAction = (page: Page, id: "squad" | "lineup" | "match") => page.getByTestId(`first-action-${id}`);

/** The game's main action, in the dashboard's hero. */
const heroAction = (page: Page, id: "next-match" | "resume-match") => page.getByTestId("dashboard-next-match").getByTestId(id);

/** Once a screen has ticked its action: its cookie is written, and the refresh that follows it is over. */
async function waitForSeen(page: Page, context: BrowserContext, item: string): Promise<void> {
  await expect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === `lw_seen_${item}`)).toBe(true);
  await page.waitForLoadState("networkidle");
}

for (const journey of JOURNEYS) {
  test.describe(`a new player, ${journey.name}`, () => {
    test.use({ locale: journey.locale, viewport: journey.viewport });

    test("goes from a club card to a first result, the tutorial passed, never blocked", async ({ page, context }) => {
      // A world of 198 clubs created, then a match played live.
      test.setTimeout(300_000);
      try {
        await page.goto(journey.home);
        await expectNoSidewaysScroll(page, "home page");

        // Three clubs of their country. A card fills the list, and the name of the career follows the club.
        for (const [kind, club] of Object.entries(journey.clubs)) {
          await expect(page.getByTestId(`club-suggestion-${kind}`)).toContainText(club);
        }
        await expect(page.getByTestId("seed")).toBeHidden();
        // The recommended card announces the ranking objective the board will set.
        await expect(page.getByTestId("club-suggestion-mid-table").getByTestId("club-suggestion-objective")).toHaveText(journey.objective);
        await page.getByTestId("club-suggestion-mid-table").click();
        await expect(page.getByTestId("club")).toContainText(journey.clubs["mid-table"]);
        await expect(page.getByTestId("save-name")).toHaveValue(journey.careerName);
        await page.getByTestId("manager-name").fill("Test E2E");
        await page.getByTestId("create-save-options").click();
        await page.getByTestId("seed").fill(E2E_SEED);
        await page.getByTestId("create-save").click();
        await expect(page).toHaveURL(/\/saves\/[^/]+$/);

        // The first career: the tutorial's welcome by the hero's button, and no first actions. Passed with its own button,
        // everything comes at once, and said where to take it up again.
        await expect(page.getByTestId("tutorial-bubble")).toHaveAttribute("data-step", "welcome");
        await expect(page.getByTestId("dashboard-first-steps")).toHaveCount(0);
        await expect(heroAction(page, "next-match")).toHaveText(journey.playMatch);
        await page.getByTestId("tutorial-skip").click();
        await expect(page.getByTestId("tutorial-bubble")).toHaveCount(0);
        await expect(page.getByText(journey.skipped)).toBeVisible();
        await expect(page.getByTestId("dashboard-budget")).toBeVisible();

        // No last result's card before the first match, no tip, no offer nor weak spot, and no rank yet.
        await expect(page.getByTestId("dashboard-last-result")).toHaveCount(0);
        await expect(page.locator('[data-testid^="tip-"]')).toHaveCount(0);
        await expect(page.getByTestId("alert-offers")).toHaveCount(0);
        await expect(page.getByTestId("alert-weak-spot")).toHaveCount(0);
        await expect(page.getByTestId("dashboard-position")).not.toContainText(/\d/);
        // Before any match, the board's ranking objective is the one the card announced.
        await expect(page.getByTestId("dashboard-objectives").locator('[data-objective="RANKING"]')).toContainText(journey.objective);
        await expectNoSidewaysScroll(page, "new dashboard");

        // The squad's tip, closed, stays closed.
        await openScreen(page, "squad");
        await expect(page.getByTestId("squad-title")).toBeVisible();
        await expect(page.getByTestId("tip-rating")).toBeVisible();
        await expectNoSidewaysScroll(page, "squad and its tip");
        await page.getByTestId("tip-rating-close").click();
        await expect(page.getByTestId("tip-rating")).toHaveCount(0);
        await waitForSeen(page, context, "rating");
        await page.reload();
        await expect(page.getByTestId("squad-title")).toBeVisible();
        await expect(page.getByTestId("tip-rating")).toHaveCount(0);

        // The line-up's tip.
        await openScreen(page, "lineup");
        await expect(page.getByTestId("lineup-title")).toBeVisible();
        await expect(page.getByTestId("tip-secondary")).toBeVisible();
        await expectNoSidewaysScroll(page, "line-up and its tip");

        // The first match, from the hero: the break's real buttons in view at once, and no button that leads nowhere.
        await openScreen(page, "dashboard");
        await heroAction(page, "next-match").click();
        await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });
        await expect(page.getByTestId("live-skip")).toBeVisible();
        await expect(page.getByTestId("resume-match")).toHaveCount(0);
        // Passed, the tutorial shows nothing here either.
        await expect(page.getByTestId("tutorial-bubble")).toHaveCount(0);
        await page.getByTestId("live-skip").click();
        await expect(page.getByTestId("break-title")).toBeVisible();
        await expect(page.getByTestId("break-card").getByTestId("tutorial-line")).toHaveCount(0);
        await expect(page.getByTestId("resume-match")).toHaveCount(0);
        for (const action of ["break-coaching", "break-resume"]) {
          await expect(page.getByTestId(action)).toBeEnabled();
          await expect(page.getByTestId(action)).toBeInViewport({ ratio: 1 });
          await expectUncovered(page.getByTestId(action));
        }
        await expectNoSidewaysScroll(page, "half-time");

        // At half-time the other clubs have played, the player's club has not: the way back stays. The break's card
        // closed first: it is modal.
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("break-card")).toBeHidden();
        await page.getByTestId(journey.leaveMatch).click();
        await expect(page.getByTestId("dashboard-last-result")).toHaveCount(0);
        await heroAction(page, "resume-match").click();
        await expect(page.getByTestId("break-title")).toBeVisible();
        await page.getByTestId("break-resume").click();
        await page.getByTestId("live-skip").click();
        await expect(page.getByTestId("session-end").getByTestId("tutorial-line")).toHaveCount(0);
        await page.getByTestId("live-continue").click();

        // The first result, with a rank, and the first tip comes: the money, alone. Closed, the simulation's takes its turn.
        await expect(page.getByTestId("dashboard-last-result")).toContainText(journey.clubs["mid-table"]);
        await expect(page.getByTestId("dashboard-first-steps")).toHaveCount(0);
        await expect(page.getByTestId("dashboard-position")).toContainText(/\d/);
        await expect(page.getByTestId("tip-money")).toBeVisible();
        await expect(page.getByTestId("tip-simulation")).toHaveCount(0);
        await expectNoSidewaysScroll(page, "dashboard after the first match");
        await page.getByTestId("tip-money-close").click();
        await expect(page.getByTestId("tip-money")).toHaveCount(0);
        await waitForSeen(page, context, "money");
        await page.reload();
        await expect(page.getByTestId("tip-simulation")).toBeVisible();
        await expect(page.getByTestId("tip-money")).toHaveCount(0);
      } finally {
        await deleteUsers([await userIdOf(context)]);
      }
    });

    test("finds its first actions in a challenge save, ticked as they are done", async ({ page, context }) => {
      // A world of 198 clubs created, then a match played to its end.
      test.setTimeout(300_000);
      try {
        await page.goto(journey.challenge);
        await page.getByTestId("challenge-play").click();
        await expect(page).toHaveURL(/\/saves\/[^/]+$/, { timeout: 120_000 });

        // The three actions in their own panel, right under the hero, no last result's card, no tutorial. The last
        // action has no link: it names the hero's button.
        await expect(page.getByTestId("tutorial-bubble")).toHaveCount(0);
        const steps = page.getByTestId("dashboard-first-steps");
        await expect(steps.getByTestId("first-actions")).toBeVisible();
        const hero = await boxOf(page.getByTestId("dashboard-next-match"));
        const below = (await boxOf(steps)).y - (hero.y + hero.height);
        expect(below).toBeGreaterThanOrEqual(0);
        expect(below).toBeLessThanOrEqual(24);
        await expect(page.getByTestId("dashboard-last-result")).toHaveCount(0);
        for (const id of ["squad", "lineup", "match"] as const) {
          await expect(firstAction(page, id)).toHaveAttribute("data-done", "false");
        }
        await expect(firstAction(page, "match")).toContainText(journey.playMatch);
        await expect(firstAction(page, "match").getByRole("link")).toHaveCount(0);
        await expectNoSidewaysScroll(page, "challenge dashboard");

        // The squad ticks itself, the line-up too, without saving anything; the browser's Back shows it.
        await firstAction(page, "squad").getByRole("link").click();
        await expect(page.getByTestId("squad-title")).toBeVisible();
        await expect(page.getByTestId("tip-rating")).toBeVisible();
        await waitForSeen(page, context, "squad");
        await openScreen(page, "dashboard");
        await expect(firstAction(page, "squad")).toHaveAttribute("data-done", "true");
        await firstAction(page, "lineup").getByRole("link").click();
        await expect(page.getByTestId("lineup-title")).toBeVisible();
        await waitForSeen(page, context, "lineup");
        await page.goBack();
        await expect(firstAction(page, "lineup")).toHaveAttribute("data-done", "true");
        await expect(firstAction(page, "squad")).toHaveAttribute("data-done", "true");

        // The first match played, the list gives its place to the result.
        await heroAction(page, "next-match").click();
        await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });
        await page.getByTestId("live-skip").click();
        await expect(page.getByTestId("break-resume")).toBeEnabled();
        await page.getByTestId("break-resume").click();
        await page.getByTestId("live-skip").click();
        await page.getByTestId("live-continue").click();
        await expect(page.getByTestId("dashboard-last-result")).toBeVisible();
        await expect(page.getByTestId("dashboard-first-steps")).toHaveCount(0);
      } finally {
        // Even when a step failed: a leftover challenge save would count against the week's cap.
        await deleteUsers([await userIdOf(context)]);
      }
    });
  });
}

test("remembers what a player has seen career by career", async ({ page, context }) => {
  // Two worlds of 198 clubs created.
  test.setTimeout(300_000);
  try {
    await page.goto("/fr");
    await page.getByTestId("club-suggestion-comeback").click();
    await page.getByTestId("manager-name").fill("Test E2E");
    await page.getByTestId("create-save").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+$/);
    const career = page.url();
    await page.getByTestId("tutorial-skip").click();
    await expect(page.getByTestId("tutorial-bubble")).toHaveCount(0);

    await openScreen(page, "squad");
    await expect(page.getByTestId("tip-rating")).toBeVisible();
    await page.getByTestId("tip-rating-close").click();
    await waitForSeen(page, context, "rating");

    // The same player's challenge career starts from nothing.
    await page.goto("/fr/defi");
    await page.getByTestId("challenge-play").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+$/);
    expect(page.url()).not.toBe(career);
    await expect(firstAction(page, "squad")).toHaveAttribute("data-done", "false");
    await openScreen(page, "squad");
    await expect(page.getByTestId("tip-rating")).toBeVisible();

    // The first one has kept everything.
    await page.goto(career);
    await openScreen(page, "squad");
    await expect(page.getByTestId("squad-title")).toBeVisible();
    await expect(page.getByTestId("tip-rating")).toHaveCount(0);
  } finally {
    // Even when a step failed: a leftover challenge save would count against the week's cap.
    await deleteUsers([await userIdOf(context)]);
  }
});
