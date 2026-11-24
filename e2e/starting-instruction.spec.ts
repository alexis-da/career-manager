import { expect, test, type Locator, type Page } from "@playwright/test";
import { FORMATION_NAMES } from "../src/engine/formations";
import { createSave, deleteSave, expectOrangeActions, openScreen } from "./helpers";

// The lineup's formation panel and starting instruction, on a Lyon of the seed « g6-start »: the eleven's strengths
// beside the next opponent's, the seventeen formations compared, best first, and one picked, then Fermer chosen, each
// saved at once while the assistant makes the eleven (docs/design/simplification.md § 3.2), and the next match started
// live with it, which its score card says.

const LYON = "Olympique Lyonnais";
const SEED = "g6-start";

/** The line-up's status while the assistant makes the eleven, a new career's way. */
const ASSISTANT_STATUS = "Onze de ton adjoint · il le refait avant chaque match";

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

test("compares the formations, saves a formation and a starting instruction at once, and starts the next match live with it", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E consigne ${Date.now()}`;
  saveName = name;
  await createSave(page, name, LYON, SEED);
  await openScreen(page, "lineup");
  const status = page.getByTestId("lineup-status");
  await expect(status).toHaveText(ASSISTANT_STATUS);

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

  // Every formation, each with its automatic eleven, best first against him, the best flagged, the current one marked:
  // the first three shown, the fourteen others behind a button that unfolds them in place.
  const toggle = page.getByTestId("formation-compare-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const options = page.getByTestId("formation-option");
  await expect(options).toHaveCount(FORMATION_NAMES.length);
  await expect(options.first()).toHaveAttribute("data-best", "true");
  await expect(page.locator('[data-testid="formation-option"][data-best="true"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="formation-option"][aria-current="true"]')).toHaveAttribute("data-formation", "4-3-3");
  const visibleOptions = page.locator('[data-testid="formation-option"]:visible');
  await expect(visibleOptions).toHaveCount(3);
  const more = page.getByTestId("formation-compare-more");
  await expect(more).toHaveText(`Voir les ${FORMATION_NAMES.length - 3} autres`);
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(visibleOptions).toHaveCount(FORMATION_NAMES.length);

  // The 5-3-2 picked, among the others unless it is one of the three: the assistant's eleven in the formation, and the
  // figures its row gave, defending more than the 4-3-3; saved at once, his eleven still, nothing to save.
  const fiveThreeTwo = page.locator('[data-testid="formation-option"][data-formation="5-3-2"]');
  await expect(fiveThreeTwo).toBeVisible();
  const row = await figuresOf(fiveThreeTwo);
  await fiveThreeTwo.getByTestId("formation-apply").click();
  await expect(page.getByTestId("lineup-formation")).toHaveAttribute("data-formation", "5-3-2");
  await expect(page.getByText("Dispositif enregistré : ton adjoint aligne son onze en 5-3-2")).toBeVisible();
  await expect(mine).toHaveAttribute("data-attack", String(row.attack));
  await expect(mine).toHaveAttribute("data-defense", String(row.defense));
  await expect(page.getByTestId("formation-profile")).toHaveText(/^Très défensif/);
  await expect(status).toHaveText(ASSISTANT_STATUS);
  await expect(page.getByTestId("lineup-save")).toHaveCount(0);
  // Saved: found again after a reload.
  await page.reload();
  await expect(page.getByTestId("lineup-formation")).toHaveAttribute("data-formation", "5-3-2");
  await expect(instruction(page, "BALANCED").radio).toBeChecked();

  // Fermer chosen: what it does says so; saved at once too, the screen without an orange of its own.
  await instruction(page, "DEFEND").label.click();
  await expect(instruction(page, "DEFEND").radio).toBeChecked();
  await expect(page.getByText("Consigne de départ enregistrée : Fermer")).toBeVisible();
  await expect(page.getByTestId("starting-instruction-about")).toContainText("moins de buts des deux côtés");
  await expect(status).toHaveText(ASSISTANT_STATUS);
  await expectOrangeActions(page, []);

  // Found again after a reload, with the formation, the assistant's eleven still.
  await page.reload();
  await expect(instruction(page, "DEFEND").radio).toBeChecked();
  await expect(page.getByTestId("lineup-formation")).toHaveAttribute("data-formation", "5-3-2");
  await expect(status).toHaveText(ASSISTANT_STATUS);

  // The next match live: it starts closed, and the score card says so, and who chose it.
  await page.getByTestId("nav-dashboard").click();
  await page.getByTestId("dashboard-next-match").getByTestId("next-match").click();
  await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });
  const line = page.getByTestId("live-instruction");
  await expect(line).toHaveAttribute("data-instruction", "DEFEND");
  await expect(line).toHaveAttribute("data-instruction-source", "START");
  await expect(line).toHaveText("Consigne : Fermer · de départ");
  // And the feed tells it from the first minute.
  const change = page.getByTestId("live-events").getByTestId("live-instruction-change");
  await expect(change).toHaveAttribute("data-instruction", "DEFEND");
  await expect(change).toHaveAttribute("data-source", "START");
  await expect(change).toContainText("Consigne : Fermer");
  await expect(change).toContainText("Consigne de départ");
});
