import { expect, test } from "@playwright/test";
import { createSave, deleteSave, openScreen } from "./helpers";

/** What a player who turns the club down for its reputation says, before any offer. */
const REPUTATION_REFUSAL = "Le joueur refuse : la réputation du club est trop faible à ses yeux.";

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("signs a free agent for his signing bonus, then shows why an offer above the budget is refused", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E transferts ${Date.now()}`;
  saveName = name;
  try {
    // The save starts on 1 July 2026, window open, with the free agent pool on the market.
    await createSave(page, name, "Olympique Lyonnais");

    await openScreen(page, "squad");
    const rows = page.locator("tbody tr[data-player-key]");
    await expect(rows.first()).toBeVisible();
    const squadSize = await rows.count();

    // Sign the best free agent: no fee and no wage to offer, his signing bonus off the budget (docs/design/simplification.md
    // § 1.3), to the euro.
    await openScreen(page, "advanced");
    await expect(page.getByTestId("advanced-title")).toHaveText("Marché avancé");
    await page.getByRole("link", { name: /^Joueurs libres/ }).click();
    const freeAgent = page.locator("tbody tr").first();
    const playerName = ((await freeAgent.getByRole("link", { name: /^Voir la fiche de / }).getAttribute("aria-label")) ?? "").replace(
      "Voir la fiche de ",
      "",
    );
    const bonus = Number(await freeAgent.getAttribute("data-bonus"));
    expect(bonus).toBeGreaterThan(0);
    const budgetBefore = Number(await page.locator('[data-summary="budget"]').getAttribute("data-value"));
    await freeAgent.getByRole("button", { name: "Signer", exact: true }).click();
    await page.getByRole("dialog", { name: `Signer ${playerName}` }).getByRole("button", { name: "Confirmer la signature" }).click();
    await expect(page.getByText(`${playerName} : Contrat signé`, { exact: false })).toBeVisible();
    await expect(page.locator('[data-summary="budget"]')).toHaveAttribute("data-value", String(budgetBefore - bonus));

    await openScreen(page, "squad");
    await expect(rows).toHaveCount(squadSize + 1);
    await expect(page.locator('[data-summary="players"]')).toHaveText(String(squadSize + 1));

    // More than the whole budget, offered for the market's lowest rated player: nothing but the money stands in the way,
    // as he accepts Lyon, like every player (next test), and the refusal says so.
    await openScreen(page, "advanced");
    await page.getByTestId("market-tab-clubs").click();
    await page.getByTestId("market-sort-overall").click();
    await expect(page).toHaveURL(/dir=asc/);
    const budget = Number(await page.locator('[data-summary="budget"]').getAttribute("data-value"));
    await page.locator("tbody tr").first().getByTestId("make-offer").click();
    const offer = page.getByTestId("make-offer-dialog");
    await expect(offer.getByTestId("refusal-alert")).toHaveCount(0);
    await offer.getByLabel("Indemnité proposée, en euros").fill(String(budget + 1_000_000));
    await offer.getByTestId("send-offer").click();
    await expect(offer.getByTestId("refusal-alert")).toContainText("Budget insuffisant");
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});

test("says before any offer that a player turns the club down for its reputation, and nothing can be sent", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E réputation ${Date.now()}`;
  saveName = name;
  try {
    // A refusal certain whatever the seed, which Lyon cannot give. A player joins no club under his rating less 15, nor
    // under his own club's reputation less 10 (minimumReputation): that is 80 at most in a new save, reputations stopping
    // at 90 and ratings at 95, and Lyon, 6th of 18, has 80 (clubFinances). SM Caen, last of the French second division, has
    // 40: every player rated above 55 refuses it, and every player of a first division club, at 55 at least. That is
    // the case of the market's most expensive player, and of the best of the 120 free agents, rated from 50 to 70.
    await createSave(page, name, "SM Caen");
    await openScreen(page, "advanced");

    await page.locator("tbody tr[data-player-id]").first().getByTestId("sign-free-agent").click();
    const signing = page.getByTestId("sign-free-agent-dialog");
    await expect(signing.getByTestId("refusal-alert")).toHaveText(REPUTATION_REFUSAL);
    await expect(signing.getByTestId("confirm-signing")).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(signing).toHaveCount(0);

    await page.getByTestId("market-tab-clubs").click();
    await page.getByTestId("market-sort-price").click();
    await expect(page).toHaveURL(/sort=price/);
    const dearest = page.locator("tbody tr[data-player-id]").first();
    await dearest.getByTestId("make-offer").click();
    const offer = page.getByTestId("make-offer-dialog");
    await expect(offer.getByTestId("refusal-alert")).toHaveText(REPUTATION_REFUSAL);
    await expect(offer.getByTestId("send-offer")).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(offer).toHaveCount(0);

    // His sheet says it too, and its own dialog sends nothing either.
    await dearest.getByTestId("market-player").click();
    const sheet = page.getByTestId("player-sheet");
    await expect(sheet.getByTestId("market-sheet-refused")).toHaveText(REPUTATION_REFUSAL);
    await sheet.getByTestId("make-offer").click();
    await expect(offer.getByTestId("refusal-alert")).toHaveText(REPUTATION_REFUSAL);
    await expect(offer.getByTestId("send-offer")).toBeDisabled();
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
