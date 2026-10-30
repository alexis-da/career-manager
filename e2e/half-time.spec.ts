import { expect, test } from "@playwright/test";
import { createSave, deleteSave } from "./helpers";

const LYON = "Olympique Lyonnais";

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("stops the match at half-time, makes a substitution and switches to 4-4-2, then shows both on the match sheet", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E mi-temps ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);

    await page.getByRole("button", { name: "Prochain match" }).click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/);
    // « Passer » goes to the break, not to the final whistle.
    await page.getByRole("button", { name: "Passer" }).click();
    const halfTime = page.locator("[data-half-time]");
    await expect(halfTime.getByRole("heading", { name: "Mi-temps" })).toBeVisible();
    await expect(halfTime.locator("[data-substitutions]")).toHaveText("Remplacements : 0/5");

    // While the match waits, no main button on its page, where it would lead nowhere; from any other, it leads back to
    // the match, and the page opens on the break.
    await expect(page.getByRole("button", { name: "Prochain match" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Match en cours — reprendre" })).toHaveCount(0);
    await page.getByTestId("nav-dashboard").click();
    await expect(page.getByRole("button", { name: "Prochain match" })).toHaveCount(0);
    await page.getByRole("link", { name: "Match en cours — reprendre" }).click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live$/);
    await expect(halfTime.getByRole("heading", { name: "Mi-temps" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Passer" })).toHaveCount(0);

    // The last player of the 4-3-3 still on the pitch makes way for the last substitute.
    const slotIndex = await halfTime.locator("button[data-slot-player-key]").last().getAttribute("data-slot-index");
    const striker = halfTime.locator(`button[data-slot-index="${slotIndex}"]`);
    const outgoingKey = await striker.getAttribute("data-slot-player-key");
    const substitute = halfTime.locator("[data-bench-player-key]").last();
    const incomingKey = await substitute.getAttribute("data-bench-player-key");
    await substitute.dragTo(striker);
    await expect(striker).toHaveAttribute("data-slot-player-key", incomingKey ?? "");
    await expect(halfTime.locator("[data-substitutions]")).toHaveText("Remplacements : 1/5");
    await expect(halfTime.locator(`[data-off-player-key="${outgoingKey}"]`)).toBeVisible();
    // He went off for good: he is not on the bench.
    await expect(halfTime.locator(`[data-bench-player-key="${outgoingKey}"]`)).toHaveCount(0);

    await halfTime.getByLabel("Dispositif").selectOption("4-4-2");
    await expect(halfTime.locator("[data-slot-position]")).toHaveText(["G", "DD", "DC", "DC", "DG", "MD", "MC", "MC", "MG", "BU", "BU"]);
    await expect(halfTime.locator("[data-substitutions]")).toHaveText("Remplacements : 1/5");

    await halfTime.getByRole("button", { name: "Reprendre la seconde période" }).click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?reprise=1$/);
    await page.getByRole("button", { name: "Passer" }).click();
    await expect(page.getByText("Terminé", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Prochain match" })).toBeVisible();

    // The match sheet: the half-time score, and the substitution at 46'.
    await page.goto(`${page.url()}/fixtures?vue=liste`);
    await page.getByRole("button", { name: /^\d+ – \d+$/ }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator('[data-match-sheet="half-time"]')).toHaveText(/^Mi-temps : \d+ – \d+$/);
    // By key, not by name: two players of a match may share a name.
    const substitution = sheet.locator(`li[data-player-key="${incomingKey}"][data-related-player-key="${outgoingKey}"]`);
    await expect(substitution.filter({ hasText: "Remplacement" }).filter({ hasText: "46'" })).toHaveCount(1);
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});

test("with reduced motion, shows the break at once, then the final whistle at once", async ({ page }) => {
  const name = `E2E mi-temps sans animation ${Date.now()}`;
  saveName = name;
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await createSave(page, name, LYON);

    await page.getByRole("button", { name: "Prochain match" }).click();
    await expect(page.locator("[data-half-time]").getByRole("heading", { name: "Mi-temps" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Passer" })).toHaveCount(0);

    await page.getByRole("button", { name: "Reprendre sans changement" }).click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?reprise=1$/);
    await expect(page.getByText("Terminé", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Passer" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Continuer" })).toBeVisible();
  } finally {
    await deleteSave(page, name);
    saveName = undefined;
  }
});
