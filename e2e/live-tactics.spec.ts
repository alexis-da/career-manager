import { expect, test } from "@playwright/test";
import { createSave, deleteSave, expectOrangeActions } from "./helpers";

// A late tactical card, on a Lyon of the seed « g7-3 »: its first match, at home, has a single choice event, at 75' with
// Lyon one goal up (« Tu mènes »). The card offers the three instructions, each once: Attaquer (« Chercher le break »),
// Équilibré (« Garder l'équilibre »), the one Lyon has played with so far, marked « (actuelle) », and Fermer (« Fermer le
// jeu »), the assistant's, his rule closing a game one goal up from the 75th. The player picks another one and asks for his
// Coaching panel: the score card says it at once, and the feed keeps it.

const LYON = "Olympique Lyonnais";
const SEED = "g7-3";

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test.describe.configure({ timeout: 240_000 });

test("offers the three instructions on a late tactical card, the current one marked, and plays the one picked", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E tactique ${Date.now()}`;
  saveName = name;
  // From one stop to the next at once: half-time, then the card.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createSave(page, name, LYON, SEED);
  await page.getByTestId("dashboard-next-match").getByTestId("next-match").click();
  await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });

  // Half-time, nothing to change: its card's way on.
  await expect(page.getByTestId("break-title")).toHaveText("Mi-temps", { timeout: 60_000 });
  await page.getByTestId("break-resume").click();

  // The card at 75', Lyon one goal up: the three instructions in the screens' order, each once.
  const card = page.getByTestId("choice-card");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toHaveAttribute("data-choice-kind", "LEADING");
  await expect(card).toContainText("Tu mènes, fin de match");
  const options = card.getByTestId("choice-option");
  await expect(options).toHaveCount(3);
  expect(await options.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-option")))).toEqual(["ATTACK", "STEADY", "DEFEND"]);
  await expect(options.nth(0)).toContainText("Chercher le break");
  await expect(options.nth(1)).toContainText("Garder l'équilibre (actuelle)");
  await expect(options.nth(2)).toContainText("Fermer le jeu");
  // One « (actuelle) », the instruction played so far; the assistant's pick is his rule's.
  await expect(card.getByText("(actuelle)")).toHaveCount(1);
  await expect(card.locator('[data-testid="choice-option"][data-assistant="true"]')).toHaveAttribute("data-option", "DEFEND");
  await expect(card.locator('[data-testid="choice-option"][data-assistant="true"]')).toContainText("Conseil de l'adjoint");
  await expectOrangeActions(page, ["choice-validate"]);

  // The player looks for the second goal, and asks for his panel first: the score card says it before the match goes on.
  await options.nth(0).click();
  await page.getByTestId("choice-coaching").click();
  await expect(card).toBeHidden();
  await expect(page.getByTestId("half-time-title")).toHaveText("75e minute");
  const line = page.getByTestId("live-instruction");
  await expect(line).toHaveAttribute("data-instruction", "ATTACK");
  await expect(line).toHaveAttribute("data-instruction-source", "EVENT");
  await expect(line).toHaveText("Consigne : Attaquer · réaction tactique");

  // The Coaching panel of the stop, unchanged; to the final whistle, and the feed keeps the decision.
  await page.getByTestId("half-time-resume-unchanged").click();
  await expect(page.getByTestId("live-continue")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("live-decision")).toContainText("Consigne jusqu'à la fin : chercher le break");
});
