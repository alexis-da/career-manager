import { expect, test, type Locator, type Page } from "@playwright/test";
import { createSave, deleteSave, expectOrangeActions } from "./helpers";

// A match live with the player's own decisions, on a Lyon of the seed « g5-365 »: its first match, at Marseille, has one
// choice event, a scuffle at 15', and no other. The player protests against his assistant's advice, makes a substitution
// and gives an instruction in the Coaching panel that follows the card, asks for a stop at 30', where the panel opens
// again, goes to half-time at once and asks for a stop at 60', then goes to the result: the decision and its effect are in
// the feed and on the match sheet.

const LYON = "Olympique Lyonnais";
const SEED = "g5-365";

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

/** Whether the keyboard's focus is inside an element. */
const holdsFocus = (locator: Locator): Promise<boolean> => locator.evaluate((element) => element.contains(document.activeElement));

/** The panel's substitutions line, the windows line and the change its assistant makes or not. */
const ruleOf = (page: Page) => ({
  substitutions: page.getByTestId("half-time-substitutions"),
  windows: page.getByTestId("half-time-windows"),
  assistant: page.getByTestId("half-time-assistant-changes"),
});

test("plays a match live with a decision of the player's, a substitution, an instruction and a stop asked for", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E choix ${Date.now()}`;
  saveName = name;
  await createSave(page, name, LYON, SEED);
  await page.getByTestId("dashboard-next-match").getByTestId("next-match").click();
  await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });

  // While the clock runs, « Coaching » is the screen's orange, and says where it stops the match.
  const request = page.getByTestId("live-coaching-request");
  await expect(request).toHaveText("Coaching à la 15e");
  await expectOrangeActions(page, ["live-coaching-request"]);
  await expect(page.getByTestId("live-skip")).toHaveText("Aller à la mi-temps");

  // The card at 15', which has the focus and keeps it: Escape does nothing, the choice is the player's to make.
  const card = page.getByTestId("choice-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toHaveAttribute("data-choice-kind", "SCUFFLE");
  await expect(card).toHaveRole("dialog");
  expect(await holdsFocus(card)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("live-score").locator("xpath=following-sibling::p")).toHaveText("15'");

  // Two options, the assistant's marked and taken by default; one orange action.
  const options = card.getByTestId("choice-option");
  await expect(options).toHaveCount(2);
  await expect(card.locator('[data-testid="choice-option"][data-assistant="true"]')).toHaveAttribute("data-option", "CALM");
  await expect(card).toContainText("Conseil de l'adjoint");
  await expectOrangeActions(page, ["choice-validate"]);
  await card.locator('[data-testid="choice-option"][data-option="PROTEST"]').click();
  await page.getByTestId("choice-validate").click();
  await expect(card).toBeHidden();

  // The Coaching panel follows, at the 15th minute: the rule, no window used yet, the assistant's changes to come.
  const panel = page.getByTestId("half-time");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("half-time-title")).toHaveText("15e minute");
  const rule = ruleOf(page);
  await expect(rule.substitutions).toHaveText("Remplacements : 0/5");
  await expect(rule.windows).toHaveText("Fenêtres pendant le jeu : 0/3");
  await expect(rule.assistant).toHaveText("Sans changement de ta part, l'adjoint fait les siens en seconde période.");
  await expect(panel.getByTestId("half-time-rule")).toContainText("5 remplacements au plus, en 3 fenêtres pendant le jeu");

  // A substitution: the last player of the eleven makes way for the last substitute, by two touches.
  await panel.getByTestId("half-time-lineup-toggle").click();
  const slot = panel.locator("button[data-slot-player-key]").last();
  const outgoing = await slot.getAttribute("data-slot-player-key");
  await slot.click();
  const substitute = panel.locator("[data-bench-player-key]").last();
  const incoming = await substitute.getAttribute("data-bench-player-key");
  await substitute.click();
  await expect(rule.substitutions).toHaveText("Remplacements : 1/5");
  await expect(panel.locator(`[data-off-player-key="${outgoing}"]`)).toBeVisible();

  // An instruction, each with what it does in words.
  const instruction = panel.getByTestId("half-time-instruction");
  await expect(instruction.locator("[data-instruction]")).toHaveCount(3);
  await expect(instruction.locator('[data-instruction="ATTACK"]')).toContainText("utile si tu es le plus fort ou si tu cours après le score");
  await expect(instruction.locator('[data-instruction="BALANCED"] input')).toBeChecked();
  await instruction.locator('[data-instruction="ATTACK"]').click();
  await expect(instruction).toContainText("Jusqu'à la fin du temps réglementaire");
  await page.getByTestId("half-time-resume").click();
  await expect(panel).toBeHidden();

  // A stop asked for at the next boundary: pressed, then the clock reaches it and the panel opens there.
  await expect(request).toHaveText("Coaching à la 30e");
  await request.click();
  await expect(request).toHaveAttribute("aria-pressed", "true");
  await expect(request).toHaveText("Arrêt demandé · 30e");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("half-time-title")).toHaveText("30e minute");
  await expect(page.getByTestId("live-score").locator("xpath=following-sibling::p")).toHaveText("30'");
  // The substitution of 15' took a window, and the player has taken the changes over; his instruction holds.
  await expect(rule.windows).toHaveText("Fenêtres pendant le jeu : 1/3");
  await expect(rule.assistant).toHaveText("Tu fais tes changements : l'adjoint n'en fait plus.");
  await expect(instruction.locator('[data-instruction="ATTACK"] input')).toBeChecked();
  await page.getByTestId("half-time-resume-unchanged").click();
  await expect(panel).toBeHidden();

  // To half-time at once; from there the clock goes on at its own pace: a stop asked for at 60' stops the match there.
  await page.getByTestId("live-skip").click();
  await expect(page.getByTestId("half-time-title")).toHaveText("Mi-temps");
  await page.getByTestId("half-time-resume-unchanged").click();
  await expect(request).toHaveText("Coaching à la 60e");
  await request.click();
  await expect(page.getByTestId("half-time-title")).toHaveText("60e minute", { timeout: 30_000 });
  await page.getByTestId("half-time-resume-unchanged").click();
  await expect(panel).toBeHidden();

  // Then to the result.
  await page.getByTestId("live-skip").click();
  await expect(page.getByTestId("live-continue")).toBeVisible();

  // The decision in the feed with its effect, the substitution at 16'.
  const decision = page.getByTestId("live-decision");
  await expect(decision).toHaveCount(1);
  await expect(decision).toHaveAttribute("data-decision-option", "PROTEST");
  await expect(decision).toContainText(/Tu as protesté : (.+ averti|.+ exclu|pas de carton)/);
  const feed = page.getByTestId("live-events");
  await expect(feed.locator("li").filter({ hasText: "16'" }).filter({ hasText: "Remplacement" })).not.toHaveCount(0);

  // And on the match sheet, in Lyon's column.
  await page.getByTestId("live-continue").click();
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
  await page.goto(`${page.url()}/fixtures`);
  await page.getByTestId("fixture-row").getByTestId("match-sheet-trigger").first().click();
  const sheet = page.getByTestId("match-sheet");
  await expect(sheet.getByTestId("match-sheet-decision")).toHaveCount(1);
  await expect(sheet.getByTestId("match-sheet-decision")).toContainText("Tu as protesté");
  await expect(sheet.locator(`li[data-player-key="${incoming}"][data-related-player-key="${outgoing}"]`)).toContainText("16'");

  await deleteSave(page, name);
  saveName = undefined;
});
