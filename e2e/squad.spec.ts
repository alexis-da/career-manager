import { expect, test } from "@playwright/test";
import { createSave, deleteSave } from "./helpers";

test("renews a contract and releases a player from the squad page", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const saveName = `E2E effectif ${Date.now()}`;
  try {
    await createSave(page, saveName, "Olympique Lyonnais");

    await page.getByRole("link", { name: "Effectif" }).click();
    await expect(page.getByRole("heading", { name: "Effectif" })).toBeVisible();
    const rows = page.locator("tbody tr[data-player-key]");
    await expect(rows.first()).toBeVisible();
    const initialCount = await rows.count();
    const summary = page.locator('[data-summary="players"]');
    await expect(summary).toHaveText(String(initialCount));

    // Renew the first player for five seasons, or four when his contract already runs to 2029.
    const renewedKey = await rows.first().getAttribute("data-player-key");
    const contractCell = page.locator(`tr[data-player-key="${renewedKey}"] td[data-column="contractUntil"]`);
    const contractBefore = (await contractCell.textContent()) ?? "";
    const [length, expectedEnd] = contractBefore.includes("2029") ? ["4 saisons", "30 juin 2028"] : ["5 saisons", "30 juin 2029"];

    await rows.first().getByRole("button", { name: /^Voir la fiche de / }).click();
    await page.getByRole("button", { name: "Prolonger", exact: true }).click();
    const renewal = page.getByRole("dialog", { name: /^Prolonger / });
    await renewal.getByRole("button", { name: length, exact: true }).click();
    await renewal.getByRole("button", { name: "Confirmer la prolongation" }).click();
    await expect(page.getByText(`Contrat prolongé jusqu'au ${expectedEnd}`, { exact: false })).toBeVisible();
    await expect(contractCell).toHaveText(expectedEnd);
    await page.keyboard.press("Escape");

    // Release the last player listed: the squad loses one player.
    const releasedKey = await rows.last().getAttribute("data-player-key");
    await rows.last().getByRole("button", { name: /^Voir la fiche de / }).click();
    await page.getByRole("button", { name: "Libérer", exact: true }).click();
    await page.getByRole("dialog", { name: /^Libérer / }).getByRole("button", { name: "Libérer le joueur" }).click();
    await expect(page.getByText("Joueur libéré", { exact: false })).toBeVisible();
    await expect(rows).toHaveCount(initialCount - 1);
    await expect(summary).toHaveText(String(initialCount - 1));
    await expect(page.locator(`tr[data-player-key="${releasedKey}"]`)).toHaveCount(0);
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, saveName);
  }
});
