import { expect, test, type Page } from "@playwright/test";
import { createSave, deleteSave, openScreen } from "./helpers";

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
  await page.getByTestId("live-skip").click();
  await page.getByTestId("break-resume").click();
  await page.getByTestId("live-skip").click();
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
    await expect(page.getByTestId("play-matchday")).toHaveCount(0);

    // Matchday 1 (15 August): every competition starts that day, nothing in between.
    await page.getByTestId("next-match").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/);
    await expect(page.getByText(/Journée 1 · 15 août 2026$/)).toBeVisible();
    await finishLiveMatch(page);

    // 18, 22, 25 and 29 August: Paris FC's league, which has the winter break, plays its two matchdays of the holidays on
    // the Tuesdays of August, as the English second division (24 clubs, 46 matchdays) plays its own. Then the first
    // international break, 4 to 8 September, comes before Paris FC's match of 12 September: « Passer la trêve »
    // plays the Tuesday before it, 1 September, and the break, and stops there; « Prochain match » then has nothing in
    // between.
    await page.getByTestId("simulate-menu").click();
    await page.getByRole("menuitem", { name: "Fin du mois" }).click();
    const dialog = page.locator('[data-simulation="dialog"]');
    await expect(dialog.getByText("4 journées jouées · jusqu'au 31 août 2026")).toBeVisible();
    await dialog.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByTestId("next-match")).toHaveText("Passer la trêve");
    await page.getByTestId("next-match").click();
    await expect(page.getByTestId("hero-break")).toHaveAttribute("data-state", "back", { timeout: 60_000 });
    await page.getByTestId("next-match").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/);
    await expect(page.getByText(/Journée 6 · 12 septembre 2026$/)).toBeVisible();
    await finishLiveMatch(page);

    // The table opens on the club's country and division; Paris FC's has played six matchdays.
    await openScreen(page, "standings");
    await expect(page.getByRole("tab", { name: "France" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Division 2" })).toHaveAttribute("aria-selected", "true");
    const frenchSecond = page.getByRole("tabpanel", { name: "Division 2" });
    await expect(frenchSecond.locator("tbody tr")).toHaveCount(18);
    await expect(frenchSecond.locator("tr[data-managed]")).toContainText(PARIS_FC);
    await expect(frenchSecond.locator('td[data-column="played"]')).toHaveText(Array.from({ length: 18 }, () => "6"));
    await expect(frenchSecond.locator('tr[data-zone="promotion"]')).toHaveCount(2);

    // England: the first division played the same four Saturdays, the second division three Tuesdays as well.
    await page.getByRole("tab", { name: "Angleterre" }).click();
    await page.getByRole("tab", { name: "Division 1" }).click();
    const englishFirst = page.getByRole("tabpanel", { name: "Division 1" });
    await expect(englishFirst.locator('td[data-column="played"]')).toHaveText(Array.from({ length: 20 }, () => "4"));
    await expect(englishFirst.locator('tr[data-zone="relegation"]')).toHaveCount(3);
    await page.getByRole("tab", { name: "Division 2" }).click();
    const englishSecond = page.getByRole("tabpanel", { name: "Division 2" });
    await expect(englishSecond.locator('td[data-column="played"]')).toHaveText(Array.from({ length: 24 }, () => "7"));
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
