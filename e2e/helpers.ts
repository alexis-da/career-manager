import { expect, type Locator, type Page } from "@playwright/test";
import { signedUserCookie, skipTutorialOf, USER_COOKIE } from "./db";

/**
 * The seed of the saves the end-to-end tests create, unless a test needs a world of its own: fixed, so that every run
 * plays the same squads and the same matches, and a failure can be replayed.
 */
export const E2E_SEED = "e2e";

// The public pages' controls are found by their data-testid, the same in French and in English.

/** The full orange of a screen's main action (--club), as the browser computes it. */
export const ACTION_ORANGE = "rgb(255, 159, 28)";

/** A drawing the system would make in its own colours: the match's events are drawn by the game, never written in emoji. */
export const EMOJI = /\p{Extended_Pictographic}/u;

/** A phone's thumb: the height and the width of a target, under 640 px. */
const THUMB = 44;

/**
 * The header of a save's layout: the sidebar on a computer, the club's line under 1024 px. The game's actions are in it
 * beside the navigation, never inside save-nav, and it has no data-testid of its own.
 */
export const saveHeader = (page: Page): Locator => page.locator("[data-save-shell] > header");

/** The id of the save a page shows, from its address. */
export function saveIdOf(page: Page): string {
  const id = /\/saves\/([^/?]+)/.exec(page.url())?.[1];
  if (id === undefined) {
    throw new Error(`Not a save's page: ${page.url()}`);
  }
  return id;
}

/** The text of an element as the page has it now, to read a value from it. */
export const textOf = async (locator: Locator): Promise<string> => ((await locator.textContent()) ?? "").trim();

/** What stays on the screen while a save's page scrolls, by data-testid: all that is fixed or sticky in its layout. */
export async function pinnedToScreen(page: Page): Promise<(string | null)[]> {
  return page.locator("[data-save-shell] *").evaluateAll((elements) =>
    elements
      .filter((element) => ["fixed", "sticky"].includes(getComputedStyle(element).position) && element.getClientRects().length > 0)
      .map((element) => element.getAttribute("data-testid")),
  );
}

/**
 * The links and buttons a page shows in the full orange of its main action, by data-testid: the colour the browser
 * computes, whatever the classes behind it. A control a width hides has no box, and does not count.
 */
export async function fullOrangeActions(page: Page): Promise<(string | null)[]> {
  return page.locator("a, button").evaluateAll(
    (controls, orange) =>
      controls
        .filter((control) => control.getClientRects().length > 0 && getComputedStyle(control).backgroundColor === orange)
        .map((control) => control.getAttribute("data-testid")),
    ACTION_ORANGE,
  );
}

/**
 * The screen's full orange actions, once a control that changes its look has stopped fading to it. The pointer out of the
 * way: a main action can come under the one that has just pressed the bar's, and the hovered orange is a lighter one.
 */
export async function expectOrangeActions(page: Page, actions: string[]): Promise<void> {
  await page.mouse.move(0, 0);
  await expect.poll(() => fullOrangeActions(page)).toEqual(actions);
}

/** The page as wide as the window, never wider: document.documentElement.scrollWidth ≤ window.innerWidth. */
export async function expectNoSidewaysScroll(page: Page, step: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(innerWidth, step).toBe(page.viewportSize()?.width);
  expect(scrollWidth, step).toBeLessThanOrEqual(innerWidth);
}

/** How much wider an element's content is than its box: positive when it scrolls sideways, in its own frame. */
export const sidewaysOverflow = (locator: Locator): Promise<number> =>
  locator.evaluate((element) => element.scrollWidth - element.clientWidth);

/** The box of a visible element, in the window. */
export async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`No box, the element is not visible: ${locator}`);
  }
  return box;
}

/** A target a thumb can hit. */
export async function expectThumbTarget(target: Locator): Promise<void> {
  const { width, height } = await boxOf(target);
  const name = (await target.getAttribute("data-testid")) ?? (await textOf(target));
  // To the hundredth of a pixel: a sheet still opening leaves a 44 px button at 43.99998.
  expect(Math.round(Math.min(width, height) * 100) / 100, name).toBeGreaterThanOrEqual(THUMB);
}

/** Under 1024 px, a save's navigation touches the foot of the screen: its box ends with the window, to within a pixel. */
export async function expectNavAtFootOfScreen(page: Page): Promise<void> {
  const nav = await boxOf(page.getByTestId("save-nav"));
  const windowHeight = await page.evaluate(() => window.innerHeight);
  expect(Math.abs(nav.y + nav.height - windowHeight)).toBeLessThanOrEqual(1);
}

/** An element clear of a save's navigation, at every width: toBeInViewport passes for one hidden under the bar. */
export async function expectClearOfNav(page: Page, locator: Locator): Promise<void> {
  const box = await boxOf(locator);
  const nav = await boxOf(page.getByTestId("save-nav"));
  const clear = box.x + box.width <= nav.x || nav.x + nav.width <= box.x || box.y + box.height <= nav.y || nav.y + nav.height <= box.y;
  expect(clear, `${locator} under the navigation`).toBe(true);
}

/**
 * A control whole on the screen, nothing over it, a fixed bar included: the middle of each of its sides is the control
 * itself. Not its corners, which are rounded: there, what lies under the pointer is the page.
 */
export async function expectUncovered(locator: Locator): Promise<void> {
  const uncovered = await locator.evaluate((element) => {
    const { left, right, top, bottom } = element.getBoundingClientRect();
    const [middleX, middleY] = [(left + right) / 2, (top + bottom) / 2];
    const sides = [
      { x: middleX, y: top + 1 },
      { x: middleX, y: bottom - 1 },
      { x: left + 1, y: middleY },
      { x: right - 1, y: middleY },
    ];
    return sides.every(({ x, y }) => {
      const found = document.elementFromPoint(x, y);
      return found !== null && element.contains(found);
    });
  });
  expect(uncovered, `${locator} covered`).toBe(true);
}

/** A page's browser as a user's: the lw_uid cookie, signed as the server signs it, resolves any of them. */
export const signInAs = (page: Page, userId: string): Promise<void> =>
  page.context().addCookies([{ name: USER_COOKIE, value: signedUserCookie(userId), domain: "localhost", path: "/" }]);

/** Once React has committed a page: a list or a card clicked before does nothing. */
export async function waitForReact(page: Page): Promise<void> {
  await page.waitForFunction(() => window.history.state?.__NA === true);
}

/** Fills the home page's creation form: manager and club, then, in its options, the name and a fixed seed. */
export async function fillCreateSaveForm(page: Page, name: string, clubName: string, seed: string = E2E_SEED): Promise<void> {
  await waitForReact(page);
  await page.getByTestId("manager-name").fill("Test E2E");
  await page.getByTestId("club").click();
  await page.getByRole("option", { name: clubName, exact: true }).click();
  await page.getByTestId("create-save-options").click();
  await page.getByTestId("save-name").fill(name);
  await page.getByTestId("seed").fill(seed);
}

/**
 * The home page in the browser's language (the context's locale): French under /fr, English at the root. A career
 * created there is in the same language, the player's.
 */
export async function homeOf(page: Page): Promise<string> {
  return (await page.evaluate(() => navigator.language)).startsWith("fr") ? "/fr" : "/";
}

/**
 * Creates a save from the home page of the browser's language, with a fixed seed, and waits for its dashboard. A new
 * player's first career has the tutorial (docs/design/tutoriel.md): passed at once, as its « Passer le tutoriel » does, and
 * the page read again, so that the specs that do not test it see the whole game (e2e/tutorial.spec.ts tests it).
 */
export async function createSave(page: Page, name: string, clubName: string, seed: string = E2E_SEED): Promise<void> {
  await page.goto(await homeOf(page));
  await fillCreateSaveForm(page, name, clubName, seed);
  await page.getByTestId("create-save").click();

  await expect(page).toHaveURL(/\/saves\/[^/]+$/);
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
  await passTutorial(page);
}

/** On a save's dashboard: its tutorial passed, if it has one running, and the page read again. */
export async function passTutorial(page: Page): Promise<void> {
  if (await skipTutorialOf(saveIdOf(page))) {
    await page.reload();
    await expect(page.getByTestId("dashboard-title")).toBeVisible();
    await expect(page.getByTestId("tutorial-bubble")).toHaveCount(0);
  }
}

/**
 * On the dashboard, an international break before the managed club's next match (a worldVersion 2 save, from its first
 * season): « Passer la trêve » plays it as a step of its own and stops at its Tuesday. Plays it when there is one, so that
 * the hero's main action is then the match's.
 */
export async function passInternationalBreak(page: Page): Promise<void> {
  const line = page.getByTestId("hero-break");
  if ((await line.count()) === 0 || (await line.getAttribute("data-state")) !== "upcoming") {
    return;
  }
  await page.getByTestId("dashboard-next-match").getByTestId("next-match").click();
  await expect(line).toHaveAttribute("data-state", "back", { timeout: 120_000 });
}

/** The card of a save in the home page's list, by the name it was created with. */
export function saveRow(page: Page, name: string): Locator {
  return page.locator(`[data-save-name="${name}"]`);
}

/** Deletes a save from the home page, through its confirmation dialog; does nothing when there is no such save. */
export async function deleteSave(page: Page, name: string): Promise<void> {
  await page.goto(await homeOf(page));
  const row = saveRow(page, name);
  // Called on failure too: the test may have stopped before its save was created.
  if ((await row.count()) === 0) {
    return;
  }
  await row.getByTestId("delete-save").click();
  await page.getByTestId("confirm-delete-save").click();
  // The row leaves the page once the server has deleted the save. Found by its attribute, not by its role: the open
  // dialog hides the rest of the page from the accessibility tree, where the rows would vanish before anything is
  // deleted.
  await expect(row).toHaveCount(0);
}

/**
 * A screen of a save, as its navigation opens it: « club » is the entry of that name, which opens on its overview, and
 * « advanced » the advanced market, a link away from the market.
 */
export type SaveScreen =
  | "dashboard"
  | "squad"
  | "lineup"
  | "fixtures"
  | "standings"
  | "cup"
  | "europe"
  | "transfers"
  | "advanced"
  | "club"
  | "challenge"
  | "seasons"
  | "rewards";

/** The entry of each tab: a tab exists only on the screens of its entry. */
const ENTRY_OF_TAB: Partial<Record<SaveScreen, "team" | "match" | "club">> = {
  squad: "team",
  lineup: "team",
  fixtures: "match",
  standings: "match",
  cup: "match",
  europe: "match",
  challenge: "club",
  seasons: "club",
  rewards: "club",
};

/**
 * Picks the lineup's formation, as a player does: the formation's button, then the formation in the sheet that opens,
 * which closes: among the three recommended, or the current one under them, or else in its family, once « Voir tous les
 * dispositifs » has unfolded the others. The button says the formation by its label, and keeps its name in data-formation.
 */
export async function pickFormation(page: Page, formation: string): Promise<void> {
  await page.getByTestId("lineup-formation").click();
  const picker = page.getByTestId("formation-picker");
  // The sheet's rows come all at once: the first recommended in sight, the current one's row is there too.
  await expect(picker.getByTestId("formation-best").first()).toBeVisible();
  const shown = picker.locator(
    `[data-testid="formation-best"][data-formation="${formation}"], [data-testid="formation-current"][data-formation="${formation}"]`,
  );
  if ((await shown.count()) > 0) {
    await shown.click();
  } else {
    const showAll = picker.getByTestId("formation-show-all");
    if ((await showAll.getAttribute("aria-expanded")) !== "true") {
      await showAll.click();
    }
    await picker.locator(`[data-testid="formation-choice"][data-formation="${formation}"]`).click();
  }
  await expect(picker).toBeHidden();
  await expect(page.getByTestId("lineup-formation")).toHaveAttribute("data-formation", formation);
}

/**
 * « À faire » with all its lines in view: its first three always are, the others behind « Voir tout · N de plus », a
 * native disclosure (`dashboard-alerts-more`), opened here when there is one: a click opens it even before the page's
 * script has run.
 */
export async function openTodo(page: Page): Promise<Locator> {
  const alerts = page.getByTestId("dashboard-alerts");
  await expect(alerts).toBeVisible();
  const folded = alerts.locator("details:not([open])");
  if ((await folded.count()) > 0) {
    await alerts.getByTestId("dashboard-alerts-more").click();
  }
  await expect(folded).toHaveCount(0);
  return alerts;
}

/** Opens a screen of a save from its navigation: its entry, then its tab when it is one, or the market's link. */
export async function openScreen(page: Page, screen: SaveScreen): Promise<void> {
  if (screen === "advanced") {
    await page.getByTestId("nav-transfers").click();
    await page.getByTestId("market-advanced").click();
    return;
  }
  const entry = ENTRY_OF_TAB[screen];
  if (entry !== undefined) {
    await page.getByTestId(`nav-${entry}`).click();
  }
  await page.getByTestId(`nav-${screen}`).click();
}
