import { expect, type Page } from "@playwright/test";

/** Creates a save from the home page and waits for its dashboard. */
export async function createSave(page: Page, name: string, clubName: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Nom de la partie").fill(name);
  await page.getByLabel("Manager").fill("Test E2E");
  await page.getByLabel("Club").click();
  await page.getByRole("option", { name: clubName, exact: true }).click();
  await page.getByRole("button", { name: "Créer la partie" }).click();

  await expect(page).toHaveURL(/\/saves\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
}

/** Deletes a save from the home page, through its confirmation dialog; does nothing when there is no such save. */
export async function deleteSave(page: Page, name: string): Promise<void> {
  await page.goto("/");
  const row = page.getByRole("row").filter({ hasText: name });
  // Called on failure too: the test may have stopped before its save was created.
  if ((await row.count()) === 0) {
    return;
  }
  await row.getByRole("button", { name: "Supprimer" }).click();
  await page.getByRole("button", { name: "Supprimer la partie" }).click();
  // The toast comes once the server has deleted the save. The rows alone would not tell: the open dialog hides the
  // rest of the page from the accessibility tree, so they vanish as soon as it opens, before anything is deleted.
  await expect(page.getByText(`Partie « ${name} » supprimée.`)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
}
