import { expect, test } from "@playwright/test";
import { createSave, deleteSave, openScreen } from "./helpers";

const LYON = "Olympique Lyonnais";
const FRANCE = "France";
const FRENCH_CLUBS = 18;

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("creates a save with Lyon, plays a matchday, replays its match, and shows one played match for every fr.1 club", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);

    await page.getByTestId("next-match").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/);
    await expect(page.getByText(/Journée 1 · 15 août 2026$/)).toBeVisible();
    // To the break, on through the second half without a change, to the final whistle.
    await page.getByTestId("live-skip").click();
    await page.getByRole("button", { name: "Reprendre sans changement" }).click();
    await page.getByTestId("live-skip").click();
    await page.getByRole("link", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

    await openScreen(page, "standings");
    await page.getByRole("tab", { name: FRANCE }).click();
    await page.getByRole("tab", { name: "Division 1" }).click();
    const panel = page.getByRole("tabpanel", { name: "Division 1" });
    await expect(panel.locator("tbody tr")).toHaveCount(FRENCH_CLUBS);
    await expect(panel.locator('td[data-column="played"]')).toHaveText(Array.from({ length: FRENCH_CLUBS }, () => "1"));
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
