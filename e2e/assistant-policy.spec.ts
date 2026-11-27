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
  await expect(choiceOf(page, "youth").label).toContainText("Tes 21 ans et moins démarrent en championnat si l'écart est faible");
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

/** Waits for a mark's toast, which names its player, and its page read again. */
async function expectMarkSaved(page: Page, words: RegExp): Promise<void> {
  await expect(page.getByText(words).last()).toBeVisible();
}

test("marks a young player « Le lancer » from the settings' « Il lancera », in the « Jeunes » view and on his sheet, at 1280 and 390 px", async ({
  page,
}) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E jeunes lancés ${Date.now()}`;
  saveName = name;
  await createSave(page, name, LYON, SEED);

  // « Lancer les jeunes » chosen: the settings name the two young players with the most potential he brings on.
  await openSettings(page);
  await expect(page.getByTestId("settings-assistant-launches")).toHaveCount(0);
  await choose(page, "youth", "Lancer les jeunes");
  const launches = page.getByTestId("settings-assistant-launches");
  await expect(launches).toHaveAttribute("data-kind", "targets");
  await expect(launches).toHaveAttribute("data-by-marks", "false");
  await expect(launches).toContainText("Il lancera :");
  await expect(launches).toContainText("les plus gros potentiels");

  // « Choisir » opens the squad on its « Jeunes » view, every mark to make.
  await launches.getByTestId("settings-assistant-launches-choose").click();
  await expect(page).toHaveURL(/\/squad\?vue=jeunes$/);
  await expect(page.getByTestId("squad-young-intro")).toBeVisible();
  const count = page.getByTestId("squad-young-launches");
  await expect(count).toHaveAttribute("data-marks", "0");
  const row = page.getByTestId("squad-row").filter({ has: page.getByTestId("youth-launch-toggle") }).first();
  const player = (await row.getByTestId("squad-player-open").innerText()).trim();
  const toggle = row.getByTestId("youth-launch-toggle");
  await expect(toggle).toHaveText("Le lancer");
  await toggle.click();
  await expectMarkSaved(page, /ton adjoint le fera entrer en championnat quand il ne démarre pas/);
  await expect(toggle).toHaveAttribute("data-marked", "true");
  await expect(toggle).toHaveText("Ne plus le lancer");
  await expect(count).toHaveAttribute("data-marks", "1");

  // His sheet says so too.
  await row.getByTestId("squad-player-open").click();
  const section = page.getByTestId("player-youth-launch");
  await expect(section).toHaveAttribute("data-marked", "true");
  await expect(section).toContainText("Marqué : en championnat, quand il ne démarre pas, ton adjoint le fait entrer à la 60e.");

  // The settings now name him, the player's choice.
  await openSettings(page);
  await expect(launches).toHaveAttribute("data-by-marks", "true");
  await expect(launches).toContainText(`Il lancera : ${player}`);
  await expect(launches).toContainText("tes choix");

  // 390 px: the « Jeunes » view's cards, the toggle at a thumb's size, nothing wider than the screen; the mark taken off.
  await page.setViewportSize(PHONE);
  await openScreen(page, "squad");
  await page.getByTestId("squad-young-toggle").click();
  const phoneRow = page.getByTestId("squad-row").filter({ hasText: player }).first();
  const phoneToggle = phoneRow.getByTestId("youth-launch-toggle");
  await expect(phoneToggle).toHaveText("Ne plus le lancer");
  await expectThumbTarget(phoneToggle);
  await expectNoSidewaysScroll(page, "young view");
  await phoneToggle.click();
  await expectMarkSaved(page, /Il ne fait plus partie des jeunes que ton adjoint lance/);
  await expect(phoneToggle).toHaveAttribute("data-marked", "false");
  await expect(page.getByTestId("squad-young-launches")).toHaveAttribute("data-marks", "0");
});
