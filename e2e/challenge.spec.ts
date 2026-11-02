import { expect, test, type Page } from "@playwright/test";
import { MAX_CHALLENGE_SAVES_PER_WEEK } from "../src/config/challenge";
import { createAnonymousUser, deleteUsers, fillWeekChallenge, userIdOf } from "./db";

// The weekly challenge of the real week, on the test database: the page creates it when missing. Each test deletes the
// users it made, their challenge saves and entries with them, so that the week's cap stays free for the next run.

/** Simulates through the menu of the dashboard's hero, then closes the summary. */
async function simulate(page: Page, target: string): Promise<void> {
  await page.getByTestId("simulate-menu").click();
  await page.getByRole("menuitem", { name: target }).click();
  const dialog = page.locator('[data-simulation="dialog"]');
  await expect(dialog.getByRole("heading", { name: "Simulation terminée" })).toBeVisible();
  await dialog.getByRole("button", { name: "Continuer" }).click();
  await expect(dialog).toBeHidden();
}

test("plays the week's challenge from the home page to its tenth matchday, then sees its greyed line in the ranking", async ({
  page,
  context,
}) => {
  // A world of 198 clubs created, then some fifteen dates simulated.
  test.setTimeout(300_000);
  try {
    await page.goto("/");
    await page.getByTestId("challenge-teaser").click();
    await expect(page).toHaveURL(/\/challenge$/);
    await expect(page.getByRole("heading", { name: "Défi de la semaine" })).toBeVisible();
    await expect(page.getByTestId("challenge-club")).not.toBeEmpty();
    await expect(page.getByText(/^Semaine \d+ · fin le lundi .+ \(heure de Paris\)$/)).toBeVisible();

    await page.getByTestId("challenge-play").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+$/);
    const banner = page.getByTestId("challenge-banner");
    const standing = banner.getByTestId("challenge-standing");
    await expect(standing).toHaveText("Défi de la semaine · journée 0 / 10");
    await expect(banner).toContainText(/Défi · semaine \d+/);
    await expect(banner).toContainText(/Partie de défi supprimée le mardi \d{2}\/\d{2}/);
    await expect(banner.getByTestId("challenge-banner-ranking")).toHaveAttribute("href", /^\/saves\/[^/]+\/challenge$/);

    // Match after match of the club, cup ties included, until its tenth league matchday. « Fin du mois » would not do:
    // the save's date stays on the last date played, and the same month's end has nothing more to play.
    await simulate(page, "Prochain match de mon club");
    await expect(standing).toHaveText("Défi de la semaine · journée 1 / 10");
    for (let match = 0; match < 14 && !((await standing.textContent()) ?? "").includes("provisoire"); match++) {
      await simulate(page, "Prochain match de mon club");
    }
    await expect(standing).toHaveText(/^Défi de la semaine · \d+ pts? · [+-]?\d+ · \d+ buts? · \d+(er|e) provisoire$/);
    await expect(banner).toContainText("La partie continue mais ne compte plus.");
    await expect(banner).toContainText("Connecte-toi pour apparaître au classement.");

    // Back to the challenge from the card, in the save, then on its public page: the anonymous player's line, greyed,
    // outside the ranking.
    await banner.getByTestId("challenge-banner-ranking").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/challenge$/);
    for (const screen of ["in the save", "public"]) {
      const own = page.locator('[data-ranking-row="own"]');
      await expect(own, screen).toContainText("Toi");
      await expect(own, screen).toContainText("Connecte-toi pour apparaître au classement");
      await expect(own.locator("td").first(), screen).toHaveText("—");
      await expect(page.getByTestId("challenge-resume"), screen).toHaveText("Reprendre ma partie");
      await expect(page.getByText("Score enregistré"), screen).toBeVisible();
      await page.goto("/challenge");
    }
  } finally {
    // Even when a step failed: a leftover challenge save would count against the week's cap.
    await deleteUsers([await userIdOf(context)]);
  }
});

test("replaces « Jouer le défi » once the week has its saves", async ({ page }) => {
  // The page creates the week's challenge when missing; then its saves fill it.
  await page.goto("/challenge");
  await expect(page.getByTestId("challenge-play")).toHaveText("Jouer le défi");
  // Not simulation code: a user last seen now.
  const ownerId = await createAnonymousUser(new Date());
  try {
    await fillWeekChallenge(ownerId, MAX_CHALLENGE_SAVES_PER_WEEK);

    await page.reload();

    await expect(page.getByTestId("challenge-full")).toHaveText("Défi complet cette semaine, reviens lundi");
    await expect(page.getByTestId("challenge-play")).toHaveCount(0);
  } finally {
    await deleteUsers([ownerId]);
  }
});
