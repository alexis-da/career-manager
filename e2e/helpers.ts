import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The seed of the saves the end-to-end tests create, unless a test needs a world of its own: fixed, so that every run
 * plays the same squads and the same matches, and a failure can be replayed.
 */
export const E2E_SEED = "e2e";

// The public pages' controls are found by their data-testid, the same in French and in English.

/** The page as wide as the window, never wider: document.documentElement.scrollWidth ≤ window.innerWidth. */
export async function expectNoSidewaysScroll(page: Page, step: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(innerWidth, step).toBe(page.viewportSize()?.width);
  expect(scrollWidth, step).toBeLessThanOrEqual(innerWidth);
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
