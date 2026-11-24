import { expect, test } from "@playwright/test";
import { createSave, deleteSave, openScreen } from "./helpers";

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("renews a contract and releases a player from the squad page", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E effectif ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, "Olympique Lyonnais");

    await openScreen(page, "squad");
    await expect(page.getByRole("heading", { name: "Effectif" })).toBeVisible();
    const rows = page.locator("tbody tr[data-player-key]");
    await expect(rows.first()).toBeVisible();
    const initialCount = await rows.count();
    const summary = page.locator('[data-summary="players"]');
    await expect(summary).toHaveText(String(initialCount));

    // Renew the first player for five seasons from 2026-27, or four when his contract already runs to 2031.
    const renewedKey = await rows.first().getAttribute("data-player-key");
    const contractCell = page.locator(`tr[data-player-key="${renewedKey}"] td[data-column="contractUntil"]`);
    const contractBefore = (await contractCell.textContent()) ?? "";
    const [length, expectedEnd] = contractBefore.includes("2031") ? ["4 saisons", "30 juin 2030"] : ["5 saisons", "30 juin 2031"];

    await rows.first().getByRole("button", { name: /^Voir la fiche de / }).click();
    // No wage on the sheet, nor in the renewal: the length alone is chosen (docs/design/simplification.md § 2.3).
    const sheet = page.getByTestId("player-sheet");
    await expect(sheet.getByTestId("player-sheet-contract")).toBeVisible();
    await expect(sheet.getByTestId("player-sheet-contract")).not.toContainText("Salaire");
    await page.getByRole("button", { name: "Prolonger maintenant", exact: true }).click();
    const renewal = page.getByRole("dialog", { name: /^Prolonger / });
    await expect(renewal).toContainText("Contrat actuel : jusqu'au");
    await expect(renewal.getByTestId("renewal-wage")).toHaveCount(0);
    await expect(renewal).not.toContainText("Salaire");
    await renewal.getByRole("button", { name: length, exact: true }).click();
    await renewal.getByRole("button", { name: "Confirmer la prolongation" }).click();
    await expect(page.getByText(`Contrat prolongé jusqu'au ${expectedEnd}.`, { exact: false })).toBeVisible();
    await expect(renewal).toBeHidden();

    // The sheet says so at once. The table's column, which the sheet beside it hides at this width, once it has closed.
    await expect(sheet.getByTestId("player-sheet-contract")).toContainText(expectedEnd);
    await expect(contractCell).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(contractCell).toBeVisible();
    await expect(contractCell).toHaveText(expectedEnd);

    // Release the last player listed: the squad loses one player.
    const releasedKey = await rows.last().getAttribute("data-player-key");
    await rows.last().getByRole("button", { name: /^Voir la fiche de / }).click();
    // Off the row: the card of a hovered row opens to its right, over the sheet's buttons.
    await page.mouse.move(0, 0);
    await page.getByRole("button", { name: "Libérer", exact: true }).click();
    // What a release costs, in money only: half of what he is still owed.
    const release = page.getByRole("dialog", { name: /^Libérer / });
    await expect(release).toContainText(/Il deviendra joueur libre\. Coût : .+, la moitié de ce qui lui reste dû sur son contrat\./);
    await release.getByRole("button", { name: "Libérer le joueur" }).click();
    await expect(page.getByText("Joueur libéré", { exact: false })).toBeVisible();
    await expect(rows).toHaveCount(initialCount - 1);
    await expect(summary).toHaveText(String(initialCount - 1));
    await expect(page.locator(`tr[data-player-key="${releasedKey}"]`)).toHaveCount(0);
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
