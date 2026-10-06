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

test("starts a save on 1 July 2026 and shows a squad player's card on hover", async ({ page }) => {
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
    await page.getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

    // The squad: hovering a row shows the player's card after a short delay; a click still opens the full sheet.
    await page.getByRole("link", { name: "Effectif" }).click();
    const goalkeeper = page.locator("tbody tr[data-player-key]").first();
    const playerKey = (await goalkeeper.getAttribute("data-player-key")) ?? "";
    await goalkeeper.hover();
    const card = page.locator(`[data-player-card="${playerKey}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator("[data-attribute]")).toHaveCount(7); // a goalkeeper: six attributes and goalkeeping
    await expect(card).toContainText("Forme");
    await expect(card).toContainText("Salaire");
    await goalkeeper.getByRole("button", { name: /^Voir la fiche de / }).click();
    await expect(page.getByRole("complementary", { name: /^Fiche de / })).toBeVisible();
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
