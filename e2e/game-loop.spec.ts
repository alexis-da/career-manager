import { expect, test } from "@playwright/test";
import { createSave, deleteSave } from "./helpers";

const LYON = "Olympique Lyonnais";
const FRANCE = "France — Division 1";
const FRENCH_CLUBS = 18;

test("creates a save with Lyon, plays a matchday, and shows one played match for every fr.1 club", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const saveName = `E2E ${Date.now()}`;
  try {
    await createSave(page, saveName, LYON);

    await page.getByRole("button", { name: "Jouer la journée" }).click();
    await expect(page.getByText(/^Journée du 17 août 2024/)).toBeVisible();

    await page.getByRole("link", { name: "Classement" }).click();
    await page.getByRole("tab", { name: FRANCE }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel.locator("tbody tr")).toHaveCount(FRENCH_CLUBS);
    await expect(panel.locator('td[data-column="played"]')).toHaveText(Array.from({ length: FRENCH_CLUBS }, () => "1"));
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, saveName);
  }
});
