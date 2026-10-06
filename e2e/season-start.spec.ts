import { expect, test } from "@playwright/test";
import { createSave, deleteSave } from "./helpers";

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("starts a save on 1 July 2026", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E saison ${Date.now()}`;
  saveName = name;
  try {
    await page.goto("/");
    await expect(page.getByText("La saison 2026-27 commence le 1er juillet 2026.")).toBeVisible();
    await createSave(page, name, "Olympique Lyonnais");
    await expect(page.getByText("Saison 2026-27")).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("row").filter({ hasText: name })).toContainText("1er juillet 2026");
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
