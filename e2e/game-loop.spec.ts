import { expect, test } from "@playwright/test";

const LYON = "Olympique Lyonnais";
const FRANCE = "France — Division 1";
const FRENCH_CLUBS = 18;

test("creates a save with Lyon, plays a matchday, and shows one played match for every fr.1 club", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const saveName = `E2E ${Date.now()}`;

  await page.goto("/");
  await page.getByLabel("Nom de la partie").fill(saveName);
  await page.getByLabel("Manager").fill("Test E2E");
  await page.getByLabel("Club").click();
  await page.getByRole("option", { name: LYON, exact: true }).click();
  await page.getByRole("button", { name: "Créer la partie" }).click();

  await expect(page).toHaveURL(/\/saves\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

  await page.getByRole("button", { name: "Jouer la journée" }).click();
  await expect(page.getByText(/^Journée du 17 août 2024/)).toBeVisible();

  await page.getByRole("link", { name: "Classement" }).click();
  await page.getByRole("tab", { name: FRANCE }).click();
  const panel = page.getByRole("tabpanel");
  await expect(panel.locator("tbody tr")).toHaveCount(FRENCH_CLUBS);
  await expect(panel.locator('td[data-column="played"]')).toHaveText(Array.from({ length: FRENCH_CLUBS }, () => "1"));

  await page.goto("/");
  const row = page.getByRole("row").filter({ hasText: saveName });
  await row.getByRole("button", { name: "Supprimer" }).click();
  await page.getByRole("button", { name: "Supprimer la partie" }).click();
  await expect(page.getByRole("row").filter({ hasText: saveName })).toHaveCount(0);
});
