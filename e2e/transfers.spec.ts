import { expect, test, type Page } from "@playwright/test";
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

/** Payroll of the managed club in euros, as the dashboard shows it. */
async function dashboardPayroll(page: Page): Promise<number> {
  await page.getByRole("link", { name: "Tableau de bord" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  return Number(await page.locator('[data-summary="payroll"]').getAttribute("data-value"));
}

test("signs a free agent, then shows why an offer above the budget is refused", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E transferts ${Date.now()}`;
  saveName = name;
  try {
    // The save starts on 1 July 2024, window open.
    await createSave(page, name, "Olympique Lyonnais");

    // A new save has no free agent yet: release the last player of the squad to put one on the market.
    await page.getByRole("link", { name: "Effectif" }).click();
    const rows = page.locator("tbody tr[data-player-key]");
    await expect(rows.first()).toBeVisible();
    const squadSize = await rows.count();
    const lastPlayer = rows.last().getByRole("button", { name: /^Voir la fiche de / });
    const playerName = ((await lastPlayer.getAttribute("aria-label")) ?? "").replace("Voir la fiche de ", "");
    await lastPlayer.click();
    await page.getByRole("button", { name: "Libérer", exact: true }).click();
    await page.getByRole("dialog", { name: /^Libérer / }).getByRole("button", { name: "Libérer le joueur" }).click();
    await expect(page.getByText("Joueur libéré", { exact: false })).toBeVisible();
    await expect(rows).toHaveCount(squadSize - 1);

    const payrollBefore = await dashboardPayroll(page);

    // Sign him from the free agents, at the prefilled minimum wage.
    await page.getByRole("link", { name: "Transferts" }).click();
    await page.getByRole("link", { name: /^Joueurs libres/ }).click();
    await page.getByRole("row").filter({ hasText: playerName }).getByRole("button", { name: "Signer", exact: true }).click();
    await page.getByRole("dialog", { name: `Signer ${playerName}` }).getByRole("button", { name: "Confirmer la signature" }).click();
    await expect(page.getByText(`${playerName} : Contrat signé`, { exact: false })).toBeVisible();

    await page.getByRole("link", { name: "Effectif" }).click();
    await expect(rows).toHaveCount(squadSize);
    await expect(page.locator('[data-summary="players"]')).toHaveText(String(squadSize));
    expect(await dashboardPayroll(page)).toBeGreaterThan(payrollBefore);

    // The most expensive player of the AI clubs costs more than the whole budget: the refusal says so.
    await page.getByRole("link", { name: "Transferts" }).click();
    await page.getByRole("link", { name: "Autres clubs" }).click();
    await page.getByRole("link", { name: "Prix demandé" }).click();
    await expect(page).toHaveURL(/sort=price/);
    await page.locator("tbody tr").first().getByRole("button", { name: "Faire une offre" }).click();
    const offer = page.getByRole("dialog", { name: /^Offre pour / });
    await offer.getByRole("button", { name: "Envoyer l'offre" }).click();
    await expect(offer.getByRole("alert")).toContainText("Budget insuffisant");
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
