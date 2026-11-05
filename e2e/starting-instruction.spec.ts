import { expect, test, type Locator, type Page } from "@playwright/test";
import { FORMATION_NAMES } from "../src/engine/formations";
import { createSave, deleteSave, expectOrangeActions, openScreen } from "./helpers";

// The lineup's formation panel and starting instruction, on a Lyon of the seed « g6-start »: the eleven's strengths
// beside the next opponent's, the seventeen formations compared and one picked, then Fermer chosen and saved with the
// lineup, and the next match started live with it, which its score card says.

const LYON = "Olympique Lyonnais";
const SEED = "g6-start";

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

/** The radio of an instruction, and its label, which a player taps. */
const instruction = (page: Page, value: string): { radio: Locator; label: Locator } => {
  const choice = page.getByTestId("starting-instruction");
  const radio = choice.locator(`input[name="starting-instruction"][data-instruction="${value}"]`);
  // The label that holds it: a locator inside it, relative to it.
  return { radio, label: choice.locator("label").filter({ has: page.locator(`input[data-instruction="${value}"]`) }) };
};

/** An element's attack and defense, as its data attributes give them. */
const figuresOf = async (locator: Locator): Promise<{ attack: number; defense: number }> => ({
  attack: Number(await locator.getAttribute("data-attack")),
  defense: Number(await locator.getAttribute("data-defense")),
});

test("compares the formations, saves a starting instruction with the lineup, and starts the next match live with it", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E consigne ${Date.now()}`;
  saveName = name;
  await createSave(page, name, LYON, SEED);
  await openScreen(page, "lineup");

  // Équilibré until the manager chooses, what it does, and the principle in one sentence.
  await expect(instruction(page, "BALANCED").radio).toBeChecked();
  await expect(page.getByTestId("starting-instruction-about")).toContainText("la force des deux onze décide");
  await expect(page.getByTestId("starting-instruction-principle")).toHaveText(
    "Plus fort que l'adversaire : ouvre le jeu ; plus faible : ferme-le.",
  );

  // The 4-3-3's profile, and the eleven's strengths beside the next opponent's likely eleven.
  await expect(page.getByTestId("formation-profile")).toHaveText(/^Plus offensif : \+3 % en attaque, −3 % en défense/);
  const mine = page.getByTestId("formation-strength");
  const before = await figuresOf(mine);
  expect(before.attack).toBeGreaterThan(40);
  expect(before.defense).toBeGreaterThan(40);
  const opponent = await figuresOf(page.getByTestId("opponent-strength"));
  expect(opponent.attack).toBeGreaterThan(40);

  // Every formation, each with its automatic eleven, one flagged the best against him, the current one marked.
  const toggle = page.getByTestId("formation-compare-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const options = page.getByTestId("formation-option");
  await expect(options).toHaveCount(FORMATION_NAMES.length);
  await expect(page.locator('[data-testid="formation-option"][data-best="true"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="formation-option"][aria-current="true"]')).toHaveAttribute("data-formation", "4-3-3");

  // The 5-3-2 picked: its eleven in the formation, and the figures its row gave, defending more than the 4-3-3.
  const fiveThreeTwo = page.locator('[data-testid="formation-option"][data-formation="5-3-2"]');
  const row = await figuresOf(fiveThreeTwo);
  await fiveThreeTwo.getByTestId("formation-apply").click();
  await expect(page.getByTestId("lineup-formation")).toHaveAttribute("data-formation", "5-3-2");
  await expect(mine).toHaveAttribute("data-attack", String(row.attack));
  await expect(mine).toHaveAttribute("data-defense", String(row.defense));
  await expect(page.getByTestId("formation-profile")).toHaveText(/^Très défensif/);
  await expect(page.getByTestId("lineup-status")).toHaveText("Modifications non enregistrées");

  // Fermer chosen: what it does says so; « Enregistrer » is the screen's only orange.
  await instruction(page, "DEFEND").label.click();
  await expect(instruction(page, "DEFEND").radio).toBeChecked();
  await expect(page.getByTestId("starting-instruction-about")).toContainText("moins de buts des deux côtés");
  await expectOrangeActions(page, ["lineup-save"]);
  await page.getByTestId("lineup-save").click();
  await expect(page.getByTestId("lineup-status")).toHaveText("Composition enregistrée");

  // Found again after a reload, with the formation.
  await page.reload();
  await expect(instruction(page, "DEFEND").radio).toBeChecked();
  await expect(page.getByTestId("lineup-formation")).toHaveAttribute("data-formation", "5-3-2");

  // The next match live: it starts closed, and the score card says so, and who chose it.
  await page.getByTestId("nav-dashboard").click();
  await page.getByTestId("dashboard-next-match").getByTestId("next-match").click();
  await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });
  const line = page.getByTestId("live-instruction");
  await expect(line).toHaveAttribute("data-instruction", "DEFEND");
  await expect(line).toHaveAttribute("data-instruction-source", "START");
  await expect(line).toHaveText("Consigne : Fermer · de départ");
});
