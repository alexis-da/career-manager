import { expect, test } from "@playwright/test";
import { createSave, deleteSave, openScreen } from "./helpers";

const LYON = "Olympique Lyonnais";
const FRANCE = "France";
const FRENCH_CLUBS = 18;

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("opens the calendar, simulates to the end of the month, sums it up, and the table shows five matches played", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E simulation ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);

    // The first matchday (15 August) live, as « Prochain match » plays it: nothing in between on the first date.
    await page.getByTestId("next-match").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/);
    // To the break, on through the second half without a change, to the final whistle.
    await page.getByTestId("live-skip").click();
    await page.getByTestId("break-resume").click();
    await page.getByTestId("live-skip").click();
    await page.getByRole("link", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

    // The calendar's grid opens on the month of the save's current date, the current day highlighted with its match.
    await openScreen(page, "fixtures");
    await page.getByTestId("fixtures-view-calendar").click();
    // « août 2026 » in the page: only CSS capitalises it.
    await expect(page.locator('[data-calendar="month"]')).toHaveText("août 2026");
    const today = page.locator('[role="gridcell"][aria-current="date"]');
    await expect(today).toHaveAttribute("data-day", "2026-08-15");
    await expect(today.locator("[data-result]")).toHaveCount(1);

    // 18, 22, 25 and 29 August are left in the month: Lyon's league, which has the winter break, plays its two matchdays
    // of the holidays on the Tuesdays of August, as the English second division plays its own.
    await page.getByTestId("simulate-menu").click();
    await page.getByRole("menuitem", { name: "Fin du mois" }).click();

    const dialog = page.locator('[data-simulation="dialog"]');
    await expect(dialog.getByRole("heading", { name: "Simulation terminée" })).toBeVisible();
    await expect(dialog.getByText("4 journées jouées · jusqu'au 31 août 2026")).toBeVisible();
    await expect(dialog.locator('[data-simulation="matches"] > li')).toHaveCount(4);
    await expect(dialog.locator('[data-simulation="rank"]')).toContainText(`sur ${FRENCH_CLUBS}`);
    await expect(dialog.getByRole("heading", { name: "Blessures" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Contrats arrivés à expiration" })).toBeVisible();

    await dialog.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

    await openScreen(page, "standings");
    await page.getByRole("tab", { name: FRANCE }).click();
    await page.getByRole("tab", { name: "Division 1" }).click();
    const panel = page.getByRole("tabpanel", { name: "Division 1" });
    await expect(panel.locator("tbody tr")).toHaveCount(FRENCH_CLUBS);
    await expect(panel.locator('td[data-column="played"]')).toHaveText(Array.from({ length: FRENCH_CLUBS }, () => "5"));
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
