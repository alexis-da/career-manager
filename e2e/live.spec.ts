import { expect, test, type Cookie, type Locator, type Page } from "@playwright/test";
import { deleteUsers, USER_COOKIE, userIdOf } from "./db";
import {
  boxOf,
  createSave,
  EMOJI,
  expectNoSidewaysScroll,
  expectOrangeActions,
  expectUncovered,
  pinnedToScreen,
  saveIdOf,
  sidewaysOverflow,
  textOf,
} from "./helpers";

// The match live and its Coaching panel, on a Lyon just created. A world of 198 clubs takes some 20 seconds, so the tests
// share one, in the order of this file; its user goes at the end, and the save with them. A match waits at its break until
// it is resumed, and ?rejouer=1 replays its first half as often as a test wants: the tests that only read a match share it,
// and one that goes on past the break leaves the next match to the next test. Each comes to its match by the dashboard's
// hero, which plays it or catches up with the one left waiting, and needs nothing of the tests before it: after a failure,
// Playwright starts a new worker, which creates its own save.

const LYON = "Olympique Lyonnais";

const COMPUTER = { width: 1280, height: 720 };
const TABLET = { width: 768, height: 1024 };

/** The width of the Coaching panel beside the match, from 1024 px. */
const PANEL_WIDTH = 440;

/** A phone's thumb: the height and the width of a target, under 640 px. */
const THUMB = 44;

/** The speeds of the replay. */
const SPEEDS = [1, 2, 4];

/** The time between the two taps of a double tap. */
const DOUBLE_TAP_MS = 250;

const PHONES = [
  {
    name: "390 × 844, in French",
    locale: "fr-FR",
    viewport: { width: 390, height: 844 },
    says: {
      status: "En direct",
      exit: "Retour à l'accueil",
      skip: "Coaching à la mi-temps",
      toResult: "Aller au résultat",
      title: "Mi-temps",
    },
  },
  {
    name: "360 × 780, in English",
    locale: "en-GB",
    viewport: { width: 360, height: 780 },
    says: {
      status: "Live",
      exit: "Back to home",
      skip: "Coach at half-time",
      toResult: "Go to the result",
      title: "Half-time",
    },
  },
];

/** A result as the French screens say it, in the colour they give it. */
const RESULTS = {
  W: { label: "Victoire", color: "rgb(74, 222, 128)" },
  D: { label: "Match nul", color: "rgb(163, 163, 163)" },
  L: { label: "Défaite", color: "rgb(248, 113, 113)" },
};

/** The suggestion's card reads as one text: « Sort · forme 7 », his name, « Entre · BU 74 », his name. */
const SUGGESTED_CHANGE = /^Sort · (?:forme [\d.,-]+|blessé)(.+)Entre · \S+ \d+(.+)$/;

let saveId = "";
let ownerId: string | null = null;
let ownerCookies: Cookie[] = [];

test.use({ viewport: COMPUTER });

// A matchday of 198 clubs to play at the head of most tests.
test.describe.configure({ timeout: 240_000 });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    // A unique name (not simulation code: the clock is fine here).
    await createSave(page, `E2E direct ${Date.now()}`, LYON);
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

/** A screen of the shared save, opened by its owner, once React has committed the page: a click before goes nowhere. */
async function openSave(page: Page, path = ""): Promise<void> {
  await page.context().addCookies(ownerCookies);
  await page.goto(`/saves/${saveId}${path}`);
  await page.waitForFunction(() => window.history.state?.__NA === true);
}

/** The dashboard's hero leads to a match waiting at its break: the next one, played, or the one an earlier test left there. */
async function reachBreak(page: Page): Promise<void> {
  await openSave(page);
  const hero = page.getByTestId("dashboard-next-match");
  const play = hero.getByTestId("next-match");
  await expect(play.or(hero.getByTestId("resume-match"))).toBeVisible();
  if (await play.isVisible()) {
    await play.click();
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live\\?rejouer=1$`), { timeout: 120_000 });
  }
}

/** The first half from kick-off, its clock just started: it reaches the break in 22 seconds, at normal speed. */
async function replayFirstHalf(page: Page): Promise<void> {
  await reachBreak(page);
  await openSave(page, "/live?rejouer=1");
  await expect(page.getByTestId("live-skip")).toBeVisible();
}

/** The break, as a player finds it again: the Coaching panel open on it. */
async function openBreak(page: Page): Promise<void> {
  await reachBreak(page);
  await openSave(page, "/live");
  await expect(page.getByTestId("half-time")).toBeVisible();
}

/** The second half's replay, the break passed without a change. */
async function replaySecondHalf(page: Page): Promise<void> {
  await openBreak(page);
  await page.getByTestId("half-time-resume-unchanged").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live\\?reprise=1$`));
}

/** The blue card at the head of the screen. */
const scoreCardOf = (page: Page): Locator => page.getByTestId("live-score").locator("xpath=ancestor::section");

/** The minute under the score. */
const minuteOf = (page: Page): Locator => page.getByTestId("live-score").locator("xpath=following-sibling::p");

/** The lines of the match's feed, newest first. */
const feedOf = (page: Page): Locator => page.getByTestId("live-events").locator("li");

const statsOf = (page: Page): Locator => page.getByTestId("live-stats").locator("[data-stat]");

/** The speed pressed, the others not. */
async function expectSpeed(page: Page, pressed: number): Promise<void> {
  for (const speed of SPEEDS) {
    await expect(page.getByTestId(`live-speed-${speed}`)).toHaveAttribute("aria-pressed", `${speed === pressed}`);
  }
}

/**
 * How fast the clock runs, in match minutes a second: two readings of the minute in the page, with the time between them,
 * so that nothing of the way from the test to the page counts.
 */
const clockPace = (page: Page, milliseconds: number): Promise<number> =>
  minuteOf(page).evaluate(async (minute, duration) => {
    const read = (): number => Number.parseInt(minute.textContent ?? "", 10);
    const [from, start] = [read(), performance.now()];
    await new Promise((resolve) => setTimeout(resolve, duration));
    return ((read() - from) * 1000) / (performance.now() - start);
  }, milliseconds);

/** The panel's two ways on, whole on the screen and nothing over them, whatever the panel shows above. */
async function expectResumeInView(page: Page): Promise<void> {
  for (const action of ["half-time-resume-unchanged", "half-time-resume"]) {
    await expect(page.getByTestId(action)).toBeEnabled();
    await expect(page.getByTestId(action)).toBeInViewport({ ratio: 1 });
    await expectUncovered(page.getByTestId(action));
  }
}

/** The panel over the whole window, once it has come in. */
const expectPanelOverWindow = (page: Page, { width, height }: { width: number; height: number }): Promise<void> =>
  expect.poll(() => boxOf(page.getByTestId("half-time"))).toEqual({ x: 0, y: 0, width, height });

/** Nothing wider than the window: the page under the panel, and the panel's content, which scrolls in a frame of its own. */
async function expectPanelWithinWidth(page: Page, step: string): Promise<void> {
  await expectNoSidewaysScroll(page, step);
  expect(await sidewaysOverflow(page.getByTestId("half-time").locator("> div").first()), step).toBeLessThanOrEqual(0);
}

/** Unfolds the line-up and exchanges the first player of the pitch and the last by two clicks: a goalkeeper up front, a forward in goal. */
async function misplaceTwoPlayers(page: Page): Promise<{ keeper: string; forward: string }> {
  await page.getByTestId("half-time-lineup-toggle").click();
  const slots = page.getByTestId("half-time").getByTestId("pitch-slot");
  await expect(slots).toHaveCount(11);
  const [first, last] = [slots.first().locator("[data-slot-player]"), slots.last().locator("[data-slot-player]")];
  const [keeper, forward] = [await textOf(first), await textOf(last)];
  await first.click();
  await expect(slots.first()).toHaveAttribute("aria-pressed", "true");
  await last.click();
  await expect(first).toHaveText(forward);
  await expect(last).toHaveText(keeper);
  return { keeper, forward };
}

test("runs the first half: the clock, its speeds, and one orange action that says where it leads", async ({ page }) => {
  await replayFirstHalf(page);

  await expect(page.getByTestId("live-caption")).toHaveText("France — Division 1 · Journée 1 · 15 août 2026");
  await expect(page.getByTestId("live-status")).toHaveText("En direct");

  // A computer keeps its column, under Match: the way out is there, not the phone's.
  await expect(page.getByTestId("save-nav")).toBeVisible();
  await expect(page.getByTestId("nav-match")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("live-exit")).toBeHidden();

  // The way on names the break, and is the screen's only orange; the game's actions have left the column.
  await expect(page.getByTestId("live-skip")).toHaveText("Coaching à la mi-temps");
  await expectOrangeActions(page, ["live-skip"]);
  for (const action of ["next-match", "resume-match", "simulate-menu"]) {
    await expect(page.getByTestId(action)).toHaveCount(0);
  }

  // The statistics beside the feed, which ends with the kick-off, the newest line first.
  await expect(statsOf(page)).toHaveCount(5);
  await expect(feedOf(page).last()).toContainText("Coup d'envoi");
  const feed = await boxOf(page.getByTestId("live-events"));
  const stats = await boxOf(page.getByTestId("live-stats"));
  expect(stats.x).toBeGreaterThanOrEqual(feed.x + feed.width);
  expect(stats.y).toBe(feed.y);

  // The other matches of the day: France's first division has 18 clubs.
  await expect(page.getByTestId("live-other-matches").locator("li")).toHaveCount(8);

  // The clock runs at normal speed, then four times as fast: twice at the very least, whatever the machine's load.
  await expect(page.getByTestId("live-speed-1")).toHaveText("x1");
  await expectSpeed(page, 1);
  const normal = await clockPace(page, 2_000);
  expect(normal).toBeGreaterThan(0);
  await page.getByTestId("live-speed-4").click();
  await expectSpeed(page, 4);
  expect(await clockPace(page, 1_500)).toBeGreaterThan(2 * normal);

  // Nothing in the feed but words and drawings, some minutes into the match.
  await expect(page.getByTestId("live-events")).not.toContainText(EMOJI);
});

test("opens the Coaching panel by itself at the break, which only Escape and its cross close", async ({ page }) => {
  await replayFirstHalf(page);
  await page.getByTestId("live-speed-4").click();

  // Nothing touched since: the clock gets there.
  const panel = page.getByTestId("half-time");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveRole("dialog");
  await expect(panel).toHaveAccessibleName("Mi-temps");
  await expect(page.getByTestId("half-time-title")).toHaveText("Mi-temps");
  await expect(page.getByTestId("half-time-substitutions")).toHaveText("Remplacements : 0/5");
  await expect(page.getByTestId("live-status")).toHaveText("Mi-temps");
  await expect(minuteOf(page)).toHaveText("45'");

  // The feed stops there, the half-time above the rest with its score.
  await expect(feedOf(page).first()).toContainText("Mi-temps");
  await expect(feedOf(page).first()).toContainText(await textOf(page.getByTestId("live-score")));
  await expect(feedOf(page).last()).toContainText("Coup d'envoi");

  // Beside the match, against the right of the screen, the whole of its height. Nothing left to skip or to speed up.
  await expect.poll(() => boxOf(panel)).toEqual({ x: COMPUTER.width - PANEL_WIDTH, y: 0, width: PANEL_WIDTH, height: COMPUTER.height });
  await expect(page.getByTestId("live-skip")).toHaveCount(0);
  await expect(page.locator('[data-testid^="live-speed-"]')).toHaveCount(0);
  await expect(page.getByTestId("half-time-resume")).toHaveText("Reprendre le match");
  await expectResumeInView(page);
  await expectOrangeActions(page, ["half-time-resume"]);

  // Modal: the column is out of reach, of a screen reader as of a click, and a click on it closes nothing.
  const shell = page.locator("[data-save-shell]");
  await expect(shell).toHaveAttribute("aria-hidden", "true");
  const entry = await boxOf(page.getByTestId("nav-dashboard"));
  const beside = { x: entry.x + entry.width / 2, y: entry.y + entry.height / 2 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("data-slot"), beside)).toBe("sheet-overlay");
  await page.mouse.click(beside.x, beside.y);
  await expect(panel).not.toHaveAttribute("data-closed");
  await expect(panel).toBeVisible();

  // Escape: the page is back, its own button takes the keyboard's focus and the orange, and opens the panel again.
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(shell).not.toHaveAttribute("aria-hidden", "true");
  await expect(page.getByTestId("live-coaching")).toBeFocused();
  await expectOrangeActions(page, ["live-coaching"]);
  await page.getByTestId("live-coaching").click();
  await expect(panel).toBeVisible();
  await expectOrangeActions(page, ["half-time-resume"]);

  // The cross closes it too.
  await panel.getByRole("button", { name: "Fermer" }).click();
  await expect(panel).toBeHidden();
  await expectOrangeActions(page, ["live-coaching"]);
});

test("makes the change the assistant suggests, undoes it, keeps it through a closed panel, and plays it at 46'", async ({ page }) => {
  await openBreak(page);
  const panel = page.getByTestId("half-time");

  // The line-up comes folded: nothing of the pitch or the bench. In this match of the seed, nobody on the bench would do better.
  const toggle = page.getByTestId("half-time-lineup-toggle");
  const suggestion = page.getByTestId("half-time-suggestion");
  const advice = page.getByTestId("half-time-advice");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel.getByTestId("pitch")).toHaveCount(0);
  await expect(page.getByTestId("half-time-bench")).toHaveCount(0);
  await expect(advice).toContainText("Ton adjoint :");
  await expect(advice).toContainText("Personne sur le banc ne ferait mieux.");
  await expect(suggestion).toHaveCount(0);

  const { keeper, forward } = await misplaceTwoPlayers(page);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("half-time-bench")).toBeVisible();

  // One of the two is to come off, and the assistant says the same as his card.
  const card = page.getByTestId("half-time-suggestion-apply");
  await expect(suggestion).toContainText("Changement conseillé · 5 restants");
  const [, outgoing, incoming] = SUGGESTED_CHANGE.exec(await textOf(card)) ?? [];
  expect([keeper, forward]).toContain(outgoing);
  await expect(advice).not.toContainText("Personne sur le banc");
  await expect(advice).toContainText(outgoing);
  await expect(advice).toContainText(incoming);

  // The card makes the change, one line says so.
  const substitutions = page.getByTestId("half-time-substitutions");
  const planned = page.getByTestId("half-time-off");
  await expect(planned).toHaveCount(0);
  await card.click();
  await expect(substitutions).toHaveText("Remplacements : 1/5");
  await expect(planned.locator("[data-off-player-key]")).toHaveCount(1);
  await expect(planned).toContainText(`${outgoing} sort, ${incoming} entre`);

  // Undone, nothing is left of it, and the assistant suggests it again.
  await page.getByTestId("half-time-cancel-change").click();
  await expect(substitutions).toHaveText("Remplacements : 0/5");
  await expect(planned).toHaveCount(0);
  await expect(card).toContainText(outgoing);
  await expect(card).toContainText(incoming);

  // A change made, the panel closed and opened again: it is still there, and so is the whole pitch.
  await card.click();
  await expect(substitutions).toHaveText("Remplacements : 1/5");
  const slots = panel.getByTestId("pitch-slot");
  const pitch = await slots.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-slot-player-key")));
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await page.getByTestId("live-coaching").click();
  await expect(panel).toBeVisible();
  await expect(substitutions).toHaveText("Remplacements : 1/5");
  await expect(planned).toContainText(`${outgoing} sort, ${incoming} entre`);
  expect(await slots.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-slot-player-key")))).toEqual(pitch);

  // The replay starts again from the break, and the change comes on with the second half.
  await page.getByTestId("half-time-resume").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live\\?reprise=1$`));
  await expect(panel).toBeHidden();
  await expect(minuteOf(page)).toHaveText(/^(4[5-9]|[5-9]\d)'$/);
  const change = feedOf(page).filter({ hasText: "46'" }).filter({ hasText: incoming });
  await expect(change).toContainText("Remplacement");
  await expect(change).toContainText(new RegExp(`remplace .*${outgoing}$`));
});

test("goes to the result without an orange action, then on from the final whistle, the only orange then", async ({ page }) => {
  await replaySecondHalf(page);

  // Nothing waits past the 90th minute: a secondary way on, the speeds still there.
  const skip = page.getByTestId("live-skip");
  await expect(skip).toHaveText("Aller au résultat");
  await expect(page.getByTestId("live-status")).toHaveText("En direct");
  await expectSpeed(page, 1);
  await expectOrangeActions(page, []);
  await skip.click();

  // The way on has the keyboard's focus, and the screen's orange.
  const proceed = page.getByTestId("live-continue");
  await expect(proceed).toBeFocused();
  await expect(proceed).toHaveText("Continuer");
  await expectOrangeActions(page, ["live-continue"]);
  await expect(page.getByTestId("live-status")).toHaveText("Terminé");
  await expect(minuteOf(page)).toHaveText("90'");
  await expect(skip).toHaveCount(0);
  await expect(page.locator('[data-testid^="live-speed-"]')).toHaveCount(0);

  // The result, from the score on the screen, and on whichever side Lyon played.
  const score = page.getByTestId("live-score");
  const [home, away] = (await textOf(score)).split(" – ").map(Number);
  const atHome = (await boxOf(scoreCardOf(page).getByText(LYON, { exact: true }))).x < (await boxOf(score)).x;
  const [scored, conceded] = atHome ? [home, away] : [away, home];
  const result = scored > conceded ? "W" : scored < conceded ? "L" : "D";
  const pill = page.getByTestId("live-result");
  await expect(pill).toHaveAttribute("data-result", result);
  await expect(pill).toHaveText(RESULTS[result].label);
  await expect(pill).toHaveCSS("color", RESULTS[result].color);

  // The pill has the colour, the score that of its card.
  const color = (locator: Locator): Promise<string> => locator.evaluate((element) => getComputedStyle(element).color);
  expect(await color(score)).toBe(await color(scoreCardOf(page)));

  // The statistics have every goal, and the feed the whole match, in words and drawings.
  await expect(page.getByTestId("live-stats").locator('[data-stat="GOAL"]')).toHaveText(`${home}Buts${away}`);
  await expect(feedOf(page).last()).toContainText("Coup d'envoi");
  expect(await feedOf(page).count()).toBeGreaterThan(2);
  await expect(page.getByTestId("live-events")).not.toContainText(EMOJI);

  await proceed.click();
  await expect(page.getByTestId("dashboard-last-result")).toBeVisible();
});

test("keeps the speed chosen through the break, into the second half", async ({ page }) => {
  await replayFirstHalf(page);
  await page.getByTestId("live-speed-4").click();
  await page.getByTestId("live-skip").click();
  await page.getByTestId("half-time-resume-unchanged").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live\\?reprise=1$`));
  await expect(page.getByTestId("live-skip")).toHaveText("Aller au résultat");
  await expectSpeed(page, 4);
});

for (const { name, locale, viewport, says } of PHONES) {
  test.describe(`on a phone, ${name}`, () => {
    test.use({ locale, viewport });

    test("gives the match the whole screen, its bar at the foot, and the panel too, without ever scrolling sideways", async ({ page }) => {
      await replayFirstHalf(page);
      await expect(page.getByTestId("live-status")).toHaveText(says.status);
      await expectNoSidewaysScroll(page, "match running");

      // Neither the club's line nor the navigation: both in the page, without a box. The score has the top of the screen.
      await expect(page.getByTestId("save-nav")).toHaveCount(1);
      await expect(page.getByTestId("save-nav")).toBeHidden();
      await expect(page.getByTestId("header-club")).toHaveCount(1);
      await expect(page.getByTestId("header-club")).toBeHidden();
      expect(await boxOf(scoreCardOf(page))).toMatchObject({ x: 0, y: 0, width: viewport.width });

      // The bar of controls at the foot of the screen, the only thing pinned to it, whole, a thumb high.
      const controls = page.getByTestId("live-controls");
      const bar = await boxOf(controls);
      expect(bar).toMatchObject({ x: 0, width: viewport.width });
      expect(bar.y + bar.height).toBe(viewport.height);
      expect(await pinnedToScreen(page)).toEqual(["live-controls"]);
      await expect(page.getByTestId("live-exit")).toHaveAccessibleName(says.exit);
      const skip = page.getByTestId("live-skip");
      await expect(skip).toHaveText(says.skip);
      await expect(skip).toBeInViewport({ ratio: 1 });
      await expectUncovered(skip);
      await expectOrangeActions(page, ["live-skip"]);
      for (const control of ["live-speed-1", "live-speed-2", "live-speed-4", "live-skip", "live-exit"]) {
        const { width, height } = await boxOf(page.getByTestId(control));
        expect(height, control).toBeGreaterThanOrEqual(THUMB);
        expect(width, control).toBeGreaterThanOrEqual(THUMB);
      }

      // To the foot of the page: its last card ends above the bar.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const last = page.getByTestId("live-other-matches");
      await expect.poll(async () => (await boxOf(last)).y + (await boxOf(last)).height).toBeLessThanOrEqual(bar.y);
      await expectNoSidewaysScroll(page, "foot of the match");

      // The break: the panel has the window to itself, its ways on in view. They come right under the thumb, and wait: a
      // double tap on the bar's button does not resume the match.
      const { x, y, width, height } = await boxOf(skip);
      await page.mouse.click(x + width / 2, y + height / 2);
      await page.waitForTimeout(DOUBLE_TAP_MS);
      await page.mouse.click(x + width / 2, y + height / 2);
      const panel = page.getByTestId("half-time");
      await expect(page.getByTestId("half-time-title")).toHaveText(says.title);
      await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live\\?rejouer=1$`));
      await expectPanelOverWindow(page, viewport);
      await expectResumeInView(page);
      await expectOrangeActions(page, ["half-time-resume"]);
      await expectPanelWithinWidth(page, "panel");

      // The line-up unfolded and the assistant's change made: as wide as ever, the ways on still there.
      const toggle = await boxOf(page.getByTestId("half-time-lineup-toggle"));
      expect(toggle.height).toBeGreaterThanOrEqual(THUMB);
      await misplaceTwoPlayers(page);
      await expectResumeInView(page);
      await expectPanelWithinWidth(page, "line-up unfolded");
      await expect(page.getByTestId("half-time-suggestion")).toBeVisible();
      await page.getByTestId("half-time-suggestion-apply").click();
      await expect(page.getByTestId("half-time-off")).toBeVisible();
      expect((await boxOf(page.getByTestId("half-time-cancel-change"))).height).toBeGreaterThanOrEqual(THUMB);
      await expectResumeInView(page);
      await expectPanelWithinWidth(page, "change planned");

      // Closed by its cross, a thumb's target like the rest: the way back to it, and the way out.
      const close = panel.locator('[data-slot="sheet-close"]');
      const cross = await boxOf(close);
      expect(Math.min(cross.width, cross.height)).toBeGreaterThanOrEqual(THUMB);
      await close.click();
      await expect(panel).toBeHidden();
      await expectOrangeActions(page, ["live-coaching"]);
      await expectUncovered(page.getByTestId("live-coaching"));
      await expectNoSidewaysScroll(page, "panel closed");

      // The hero leads back to the match, which opens on its break.
      await page.getByTestId("live-exit").click();
      const resume = page.getByTestId("dashboard-next-match").getByTestId("resume-match");
      await expect(resume).toBeVisible();
      await expectNoSidewaysScroll(page, "dashboard");
      await resume.click();
      await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live$`));
      await expect(page.getByTestId("half-time-title")).toHaveText(says.title);
      await expectPanelOverWindow(page, viewport);
      await expectResumeInView(page);
      await expect(skip).toHaveCount(0);
      await expectPanelWithinWidth(page, "back at the break");

      // On to the final whistle, the way on in the bar.
      await page.getByTestId("half-time-resume-unchanged").click();
      await expect(skip).toHaveText(says.toResult);
      await expectOrangeActions(page, []);
      await expectNoSidewaysScroll(page, "second half");
      await skip.click();
      const proceed = page.getByTestId("live-continue");
      await expect(page.getByTestId("live-result")).toBeVisible();
      await expectOrangeActions(page, ["live-continue"]);
      await expect(proceed).toBeInViewport({ ratio: 1 });
      await expectUncovered(proceed);
      expect((await boxOf(proceed)).height).toBeGreaterThanOrEqual(THUMB);
      await expectNoSidewaysScroll(page, "full time");
    });
  });
}

test.describe("at 768 px", () => {
  test.use({ viewport: TABLET });

  test("has the cards under each other, the bar at the foot, and one orange action at each step of the match", async ({ page }) => {
    await replayFirstHalf(page);

    // The first half: a tablet is no computer, the match has the screen and its own way out.
    await expectOrangeActions(page, ["live-skip"]);
    await expectNoSidewaysScroll(page, "match running");
    await expect(page.getByTestId("save-nav")).toBeHidden();
    await expect(page.getByTestId("header-club")).toBeHidden();
    await expect(page.getByTestId("live-exit")).toBeVisible();

    // One card under the other, and the bar over the foot of the screen.
    const feed = await boxOf(page.getByTestId("live-events"));
    const stats = await boxOf(page.getByTestId("live-stats"));
    const others = await boxOf(page.getByTestId("live-other-matches"));
    expect(stats.x).toBe(feed.x);
    expect(stats.width).toBe(feed.width);
    expect(stats.y).toBeGreaterThanOrEqual(feed.y + feed.height);
    expect(others.y).toBeGreaterThanOrEqual(stats.y + stats.height);
    const bar = await boxOf(page.getByTestId("live-controls"));
    expect(bar).toMatchObject({ x: 0, width: TABLET.width });
    expect(bar.y + bar.height).toBe(TABLET.height);

    // The break: the panel over the whole screen, then the page's own button.
    await page.getByTestId("live-skip").click();
    await expect(page.getByTestId("half-time-title")).toBeVisible();
    await expectPanelOverWindow(page, TABLET);
    await expectResumeInView(page);
    await expectOrangeActions(page, ["half-time-resume"]);
    await expectPanelWithinWidth(page, "panel");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("half-time")).toBeHidden();
    await expectOrangeActions(page, ["live-coaching"]);
    await expectNoSidewaysScroll(page, "panel closed");

    // The second half, and the final whistle.
    await page.getByTestId("live-coaching").click();
    await page.getByTestId("half-time-resume-unchanged").click();
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live\\?reprise=1$`));
    await expect(page.getByTestId("live-skip")).toBeVisible();
    await expectOrangeActions(page, []);
    await expectNoSidewaysScroll(page, "second half");
    await page.getByTestId("live-skip").click();
    await expect(page.getByTestId("live-result")).toBeVisible();
    await expectOrangeActions(page, ["live-continue"]);
    await expectNoSidewaysScroll(page, "full time");
  });
});
