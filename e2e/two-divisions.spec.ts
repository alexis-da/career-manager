import { expect, test, type Page } from "@playwright/test";
import { createSave, deleteSave } from "./helpers";

// A second division club, chosen in the creation form like any other.
const PARIS_FC = "Paris FC";

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

/** From the break, on through the second half without a change, to the final whistle, then back to the dashboard. */
async function finishLiveMatch(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Passer" }).click();
  await page.getByRole("button", { name: "Reprendre sans changement" }).click();
  await page.getByRole("button", { name: "Passer" }).click();
  await page.getByRole("link", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
}

test("creates a save with a second division club, plays the dates in between with « Prochain match », and shows each division's table", async ({
  page,
}) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E deux divisions ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, PARIS_FC);
    await expect(page.getByTestId("header-competition")).toHaveText("France — Division 2 · Saison 2026-27");
    await expect(page.getByRole("button", { name: "Jouer la journée" })).toHaveCount(0);

    // Matchday 1 (15 August): every competition starts that day, nothing in between.
    await page.getByRole("button", { name: "Prochain match" }).click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/);
    await expect(page.getByText(/Journée 1 · 15 août 2026$/)).toBeVisible();
    await finishLiveMatch(page);

    // 22 and 29 August, then Paris FC rests on 5 September: the 20-club first divisions play that Saturday, and the
    // English and Spanish second divisions the Tuesday after.
    await page.getByRole("button", { name: "Simuler jusqu'à…" }).click();
    await page.getByRole("menuitem", { name: "Fin du mois" }).click();
    const dialog = page.locator('[data-simulation="dialog"]');
    await expect(dialog.getByText("2 journées jouées · jusqu'au 31 août 2026")).toBeVisible();
    await dialog.getByRole("button", { name: "Continuer" }).click();

    await page.getByRole("button", { name: "Prochain match" }).click();
    await expect(page.getByText("2 journées intermédiaires jouées.")).toBeVisible();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/);
    await expect(page.getByText(/Journée 4 · 12 septembre 2026$/)).toBeVisible();
    await finishLiveMatch(page);

    // The table opens on the club's country and division; Paris FC's has played four matchdays.
    await page.getByRole("link", { name: "Classement" }).click();
    await expect(page.getByRole("tab", { name: "France" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Division 2" })).toHaveAttribute("aria-selected", "true");
    const frenchSecond = page.getByRole("tabpanel", { name: "Division 2" });
    await expect(frenchSecond.locator("tbody tr")).toHaveCount(18);
    await expect(frenchSecond.locator("tr[data-managed]")).toContainText(PARIS_FC);
    await expect(frenchSecond.locator('td[data-column="played"]')).toHaveText(Array.from({ length: 18 }, () => "4"));
    await expect(frenchSecond.locator('tr[data-zone="promotion"]')).toHaveCount(2);

    // England: the first division played the Saturday Paris FC rested, the second division the Tuesday as well.
    await page.getByRole("tab", { name: "Angleterre" }).click();
    await page.getByRole("tab", { name: "Division 1" }).click();
    const englishFirst = page.getByRole("tabpanel", { name: "Division 1" });
    await expect(englishFirst.locator('td[data-column="played"]')).toHaveText(Array.from({ length: 20 }, () => "5"));
    await expect(englishFirst.locator('tr[data-zone="relegation"]')).toHaveCount(3);
    await page.getByRole("tab", { name: "Division 2" }).click();
    const englishSecond = page.getByRole("tabpanel", { name: "Division 2" });
    await expect(englishSecond.locator('td[data-column="played"]')).toHaveText(Array.from({ length: 24 }, () => "6"));
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
