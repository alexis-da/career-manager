import { expect, test } from "@playwright/test";
import { createSave, deleteSave } from "./helpers";

const LYON = "Olympique Lyonnais";

/** Second striker of the 4-4-2: slots are GK, RB, CB, CB, LB, RM, CM, CM, LM, ST, ST. */
const STRIKER_SLOT = 10;

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("switches to a 4-4-2, brings a substitute on, saves, and finds both after a reload", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);

    await page.getByRole("navigation", { name: "Navigation de la partie" }).getByRole("link", { name: "Composition" }).click();
    await expect(page.getByRole("heading", { name: "Composition" })).toBeVisible();
    const formation = page.getByLabel("Dispositif");
    await expect(formation).toHaveValue("4-3-3");

    await formation.selectOption("4-4-2");
    await expect(page.getByText("Modifications non enregistrées")).toBeVisible();

    const slot = page.locator(`[data-slot-index="${STRIKER_SLOT}"]`);
    const starter = (await slot.locator("[data-slot-player]").textContent()) ?? "";
    await slot.click();
    const substitute = page.locator('[data-bench="true"]').first();
    const substituteKey = (await substitute.getAttribute("data-player-key")) ?? "";
    const substituteName = (await substitute.locator("span").nth(1).textContent()) ?? "";
    const substituteLastName = substituteName.trim().split(" ").slice(1).join(" ");
    await substitute.click();

    await expect(slot.locator("[data-slot-player]")).toHaveText(substituteLastName);
    // The replaced starter is now among the substitutes.
    await expect(page.locator('[data-bench="true"]').filter({ hasText: starter })).toHaveCount(1);

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Composition en 4-4-2 enregistrée.")).toBeVisible();
    await expect(page.getByText("Composition enregistrée", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Dispositif")).toHaveValue("4-4-2");
    await expect(page.locator(`[data-slot-index="${STRIKER_SLOT}"] [data-slot-player]`)).toHaveText(substituteLastName);
    await expect(page.locator(`[data-player-key="${substituteKey}"]`)).toHaveCount(0);
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
