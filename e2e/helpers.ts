import { expect, type Locator, type Page } from "@playwright/test";

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

/** Fills the home page's creation form: name, manager, club, and a fixed seed. */
export async function fillCreateSaveForm(page: Page, name: string, clubName: string, seed: string = E2E_SEED): Promise<void> {
  await page.getByTestId("save-name").fill(name);
  await page.getByTestId("manager-name").fill("Test E2E");
  await page.getByTestId("club").click();
  await page.getByRole("option", { name: clubName, exact: true }).click();
  await page.getByTestId("create-save-options").click();
  await page.getByTestId("seed").fill(seed);
}

/** Creates a save from the home page, with a fixed seed, and waits for its dashboard. */
export async function createSave(page: Page, name: string, clubName: string, seed: string = E2E_SEED): Promise<void> {
  await page.goto("/");
  await fillCreateSaveForm(page, name, clubName, seed);
  await page.getByTestId("create-save").click();

  await expect(page).toHaveURL(/\/saves\/[^/]+$/);
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
}

/** The row of a save in the home page's list, by the name it was created with. */
export function saveRow(page: Page, name: string): Locator {
  return page.locator(`tr[data-save-name="${name}"]`);
}

/** Deletes a save from the home page, through its confirmation dialog; does nothing when there is no such save. */
export async function deleteSave(page: Page, name: string): Promise<void> {
  await page.goto("/");
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
  | "transfers"
  | "advanced"
  | "club"
  | "challenge"
  | "seasons";

/** The entry of each tab: a tab exists only on the screens of its entry. */
const ENTRY_OF_TAB: Partial<Record<SaveScreen, "team" | "match" | "club">> = {
  squad: "team",
  lineup: "team",
  fixtures: "match",
  standings: "match",
  cup: "match",
  challenge: "club",
  seasons: "club",
};

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
