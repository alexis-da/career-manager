import { expect, test, type Locator, type Page } from "@playwright/test";
import { createSave, deleteSave, expectNoSidewaysScroll, expectThumbTarget, openScreen } from "./helpers";

// The assistant's policy (docs/design/effectif-adjoint.md § 2): « Lancer les jeunes » chosen in Club → Réglages, saved at
// once, at 1280 and at 390 px, and told on the line-up's card of the assistant, whose link leads back to it; greyed, saying
// why, while the player keeps both the line-up and the contracts. On a Lyon of the seed « assistant-policy », deleted at
// the end.

const LYON = "Olympique Lyonnais";
const SEED = "assistant-policy";

const COMPUTER = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

test.use({ viewport: COMPUTER });
test.describe.configure({ timeout: 240_000 });

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

type Policy = "best" | "youth";

/** A policy's label, which a player taps, and its radio, out of sight. */
const choiceOf = (page: Page, policy: Policy): { label: Locator; radio: Locator } => {
  const label = page.getByTestId(`settings-assistant-policy-${policy}`);
  return { label, radio: label.locator('input[type="radio"]') };
};

/** Club → Réglages, from the navigation: the assistant's policy in sight. */
async function openSettings(page: Page): Promise<Locator> {
  await openScreen(page, "club");
  const policy = page.getByTestId("settings-assistant-policy");
  await expect(policy).toBeVisible();
  return policy;
}

/** Chooses a policy as a player does, and waits until it is saved: its toast, then the page read again. */
async function choose(page: Page, policy: Policy, name: string): Promise<void> {
  const { label, radio } = choiceOf(page, policy);
  await label.click();
  await expect(radio).toBeChecked();
  await expect(page.getByText(`Consigne de ton adjoint : ${name}.`).last()).toBeVisible();
  await expect(page.getByTestId("settings-assistant-policy")).toHaveAttribute("data-policy", policy.toUpperCase());
}

/** The line-up, its assistant's card telling his policy. */
async function policyLineOnLineup(page: Page): Promise<Locator> {
  await openScreen(page, "lineup");
  const card = page.getByTestId("lineup-assistant");
  await expect(card).toBeVisible();
  return card.getByTestId("lineup-assistant-policy");
}

test("chooses « Lancer les jeunes » in the settings at 1280 and 390 px, and tells it on the line-up", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E consigne adjoint ${Date.now()}`;
  saveName = name;
  await createSave(page, name, LYON, SEED);

  // A new career's: « Meilleur onze », the game before the policies, told on the line-up's card.
  let line = await policyLineOnLineup(page);
  await expect(line).toHaveAttribute("data-policy", "BEST");
  await expect(line).toContainText("Consigne : Meilleur onze");

  // 1280 px: its link leads to the settings, under the assistant's switches.
  await line.getByTestId("lineup-assistant-policy-change").click();
  await expect(page).toHaveURL(/\/club#reglages$/);
  const settings = page.getByTestId("club-settings");
  const policy = settings.getByTestId("settings-assistant-policy");
  await expect(policy).toBeVisible();
  await expect(policy).toHaveAttribute("data-active", "true");
  await expect(choiceOf(page, "best").radio).toBeChecked();
  await expect(choiceOf(page, "youth").label).toContainText("Tes 21 ans et moins jouent en championnat si l'écart est faible");
  await choose(page, "youth", "Lancer les jeunes");
  // Saved: read again with the page.
  await page.reload();
  await expect(choiceOf(page, "youth").radio).toBeChecked();
  line = await policyLineOnLineup(page);
  await expect(line).toHaveAttribute("data-policy", "YOUTH");
  await expect(line).toContainText("Consigne : Lancer les jeunes");

  // Back to « Meilleur onze », then 390 px: « Lancer les jeunes » chosen again, on a phone.
  await openSettings(page);
  await choose(page, "best", "Meilleur onze");
  await page.setViewportSize(PHONE);
  await openSettings(page);
  for (const choice of ["best", "youth"] as const) {
    await expectThumbTarget(choiceOf(page, choice).label);
  }
  await choose(page, "youth", "Lancer les jeunes");
  await expectNoSidewaysScroll(page, "settings");

  line = await policyLineOnLineup(page);
  await expect(line).toHaveAttribute("data-policy", "YOUTH");
  await expect(line).toContainText("Consigne : Lancer les jeunes");
  await expectThumbTarget(line.getByTestId("lineup-assistant-policy-change"));
  await expectNoSidewaysScroll(page, "lineup");

  // The player keeps the line-up and the contracts: the policy waits, greyed, and says why.
  const greyed = await openSettings(page);
  for (const setting of ["lineup", "contracts"] as const) {
    const toggle = page.getByTestId(`settings-assistant-${setting}`);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  }
  await expect(greyed).toHaveAttribute("data-active", "false");
  for (const choice of ["best", "youth"] as const) {
    await expect(choiceOf(page, choice).radio).toBeDisabled();
  }
  await expect(page.getByTestId("settings-assistant-policy-inactive")).toHaveText(
    "Ton adjoint ne fait ni ton onze ni tes contrats : sa consigne attendra que tu lui en rendes un.",
  );
  await expect(choiceOf(page, "youth").radio).toBeChecked();
  await expectNoSidewaysScroll(page, "settings greyed");
});
