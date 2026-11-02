import { expect, test, type Locator, type Page } from "@playwright/test";
import { formatMoney } from "../src/lib/format";
import { setSaveDate } from "./db";
import { createSave, deleteSave, expectNoSidewaysScroll, expectUncovered, openScreen, saveIdOf, textOf } from "./helpers";

// The market's main screen, on a Lyon just created: what to buy, one proposal at a time, the signing in two steps, then
// what to sell. The advanced market has its own specs (transfers, transfer-filters).

const LYON = "Olympique Lyonnais";

const PHONE = { width: 390, height: 844 };

/** An amount as formatMoney shows it, in French: « 12,5 M€ », « 850 k€ », and never « Gratuit ». */
const AMOUNT = /^\d+(,\d+)? [Mk]?€$/;

/** The ways in other than « Mes besoins »: the sentence of each, and the tag of its players. */
const OTHER_ENTRIES = [
  { entry: "market-entry-gems", sentence: "Des jeunes à fort potentiel, à ta portée.", label: /^Pépite · pot\. \d+$/ },
  { entry: "market-entry-bargains", sentence: "Moins chers que leur valeur, souvent en fin de contrat.", label: /^Bonne affaire$/ },
  { entry: "market-entry-stars", sentence: "Les meilleurs joueurs prêts à te rejoindre, à ta portée.", label: /^Star$/ },
];

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

async function createLyonSave(page: Page): Promise<void> {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  saveName = `E2E marché ${Date.now()}`;
  await createSave(page, saveName, LYON);
}

/** The managed club's budget in euros, from the market's header. */
const budgetOf = async (page: Page): Promise<number> => Number(await page.locator('[data-summary="budget"]').getAttribute("data-value"));

/** The PlayerSave.id a proposal or an offer carries. */
async function playerIdOf(card: Locator): Promise<string> {
  const id = await card.getAttribute("data-player-id");
  if (id === null) {
    throw new Error(`No player id on ${card}`);
  }
  return id;
}

/** A player signed in this window: his sheet in the squad has the sale disabled and says why, with no dialog to go through. */
async function expectNoResale(page: Page, playerName: string): Promise<void> {
  await openScreen(page, "squad");
  await page.getByTestId("squad-row").filter({ has: page.getByText(playerName, { exact: true }) }).click();
  const sheet = page.getByTestId("player-sheet");
  await expect(sheet.getByTestId("player-sheet-name")).toHaveText(playerName);
  const sale = sheet.getByTestId("sell-player");
  await expect(sale).toBeDisabled();
  await expect(sheet.getByTestId("player-sale-refusal")).toHaveText(
    "Tu viens de le recruter à ce mercato : il ne peut pas repartir avant le prochain.",
  );
  // Past the button's refusal of the pointer: nothing to confirm opens.
  await sale.click({ force: true });
  await expect(page.getByTestId("sell-dialog")).toHaveCount(0);
}

test("proposes one player at a time, through four ways in, and opens his sheet on the advanced market", async ({ page }) => {
  await createLyonSave(page);
  await openScreen(page, "transfers");

  await expect(page.getByTestId("transfers-title")).toHaveText("Marché");
  await expect(page.getByTestId("market-sides")).toBeVisible();
  await expect(page.getByTestId("market-tab-buy")).toHaveText("Acheter");
  await expect(page.getByTestId("market-tab-buy")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("market-buy")).toBeVisible();
  await expect(page.getByTestId("market-advanced")).toBeVisible();
  expect(await budgetOf(page)).toBeGreaterThan(0);
  await expect(page.locator('[data-summary="wage-room"]')).toBeVisible();

  // « Mes besoins » by default: the weak spot, and who fills it best. He plays for a club, which has a price: the biggest
  // gain goes to a rating free agents do not reach, as they stop at 70.
  const needs = page.getByTestId("market-entry-needs");
  const intro = page.getByTestId("market-intro");
  const proposal = page.getByTestId("market-proposal");
  const tag = page.getByTestId("market-tag");
  const name = page.getByTestId("market-player-name");
  await expect(needs).toHaveAttribute("aria-pressed", "true");
  await expect(intro).toHaveText(/^Ton point faible : .+ \(note \d+\)\. Voici qui le comblerait\.$/);
  await expect(tag).toHaveText("Meilleur choix");
  await expect(page.getByTestId("market-rating")).toHaveText(/^\d{2}$/);
  await expect(name).toHaveText(/\S \S/);
  await expect(page.getByTestId("market-impact")).toHaveText(/^\+[1-9]\d* au poste \S+$/);
  await expect(page.getByTestId("market-price")).toHaveText(AMOUNT);
  await expect(page.getByTestId("market-recruit")).toHaveText("Recruter");
  const best = await playerIdOf(proposal);

  await page.getByTestId("market-pass").click();
  await expect(proposal).not.toHaveAttribute("data-player-id", best);
  await expect(tag).not.toHaveText("Meilleur choix");

  // On a computer, the next players beside the card, the one it shows pressed: a click brings another. And an offer.
  const spotted = page.getByTestId("market-spotted-player");
  await expect(spotted).toHaveCount(3);
  await expect(spotted.nth(1)).toHaveAttribute("aria-pressed", "true");
  await spotted.nth(2).click();
  await expect(spotted.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(spotted.nth(1)).toHaveAttribute("aria-pressed", "false");
  await expect(spotted.nth(2)).toContainText(await textOf(name));
  await expect(page.getByTestId("market-sale-offer").getByTestId("sell-player")).toBeVisible();

  for (const { entry, sentence, label } of OTHER_ENTRIES) {
    await page.getByTestId(entry).click();
    await expect(page.getByTestId(entry)).toHaveAttribute("aria-pressed", "true");
    await expect(needs).toHaveAttribute("aria-pressed", "false");
    await expect(intro).toHaveText(sentence);
    await expect(tag).toHaveText(label);
  }

  // Back to the needs, from their first player, whose terms can be adjusted on the advanced market, his sheet open.
  await needs.click();
  await expect(proposal).toHaveAttribute("data-player-id", best);
  const bestName = await textOf(name);
  await page.getByTestId("market-adjust").click();
  await expect(page).toHaveURL(new RegExp(`/transfers/advanced\\?.*player=${best}`));
  await expect(page.getByTestId("advanced-title")).toHaveText("Marché avancé");
  const sheet = page.getByTestId("player-sheet");
  await expect(sheet.getByTestId("player-sheet-name")).toHaveText(bestName);
  await expect(sheet.getByTestId("make-offer")).toBeEnabled();

  await page.getByTestId("market-back").click();
  await expect(page.getByTestId("transfers-title")).toBeVisible();
});

test("signs a proposal after a short confirmation, and nobody signed in this window can be sold", async ({ page }) => {
  // A world of 198 clubs created, then two signings, each checked in the squad.
  test.setTimeout(240_000);
  await createLyonSave(page);

  await openScreen(page, "squad");
  const rows = page.getByTestId("squad-row");
  await expect(rows.first()).toBeVisible();
  const squadSize = await rows.count();

  await openScreen(page, "transfers");
  const proposal = page.getByTestId("market-proposal");
  const playerId = await playerIdOf(proposal);
  const playerName = await textOf(page.getByTestId("market-player-name"));
  const price = await textOf(page.getByTestId("market-price"));
  const budgetBefore = await budgetOf(page);

  // Nothing to choose, everything to read: the card's price and wage, three seasons from 2026-27, what the budget keeps.
  await page.getByTestId("market-recruit").click();
  const confirmation = page.getByTestId("market-recruit-dialog");
  await expect(confirmation).toContainText(`Recruter ${playerName}`);
  await expect(confirmation.locator("dt")).toHaveText(["Prix", "Salaire par saison", "Durée", "Budget restant"]);
  const lines = confirmation.locator("dd");
  await expect(lines).toHaveText([price, AMOUNT, "3 saisons, jusqu'au 30 juin 2029", AMOUNT]);
  await expect(proposal).toContainText(`Salaire ${await textOf(lines.nth(1))} · 3 saisons`);
  const budgetLeft = await textOf(lines.nth(3));

  await page.getByTestId("market-recruit-confirm").click();
  const signed = page.getByTestId("market-signed");
  await expect(signed).toContainText("Signé !");
  await expect(signed).toContainText(`${playerName} rejoint ${LYON}`);
  await expect(signed).toContainText("Contrat de 3 saisons, jusqu'au 30 juin 2029");
  await page.getByTestId("market-signed-continue").click();
  await expect(signed).toHaveCount(0);

  // The budget has lost the price shown, compared as shown: the card rounds it. He is no longer proposed.
  await expect(page.locator('[data-summary="budget"]')).not.toHaveAttribute("data-value", String(budgetBefore));
  const budgetAfter = await budgetOf(page);
  expect(formatMoney(budgetBefore - budgetAfter)).toBe(price);
  expect(formatMoney(budgetAfter)).toBe(budgetLeft);
  await expect(proposal).not.toHaveAttribute("data-player-id", playerId);

  await openScreen(page, "squad");
  await expect(rows).toHaveCount(squadSize + 1);
  await expect(page.locator('[data-summary="players"]')).toHaveText(String(squadSize + 1));
  await expectNoResale(page, playerName);

  // The same rule for a free agent, signed on the advanced market.
  await openScreen(page, "advanced");
  const freeAgent = page.locator("tbody tr[data-player-id]").first();
  const freeAgentName = await textOf(freeAgent.getByTestId("market-player"));
  await freeAgent.getByTestId("sign-free-agent").click();
  await page.getByTestId("sign-free-agent-dialog").getByTestId("confirm-signing").click();
  await expect(page.getByText(`${freeAgentName} : Contrat signé`, { exact: false })).toBeVisible();
  await expectNoResale(page, freeAgentName);

  // Neither is among the offers of « Vendre », in the eleven or out of it.
  await openScreen(page, "transfers");
  await page.getByTestId("market-tab-sell").click();
  const sell = page.getByTestId("market-sell");
  const withOffer = sell.locator("[data-player-id]").filter({ has: page.getByTestId("sell-player") });
  await expect(withOffer.first()).toBeVisible();
  await expect(withOffer.filter({ has: page.getByText(playerName, { exact: true }) })).toHaveCount(0);
  await expect(withOffer.filter({ has: page.getByText(freeAgentName, { exact: true }) })).toHaveCount(0);
});

test("sells a player out of the eleven: the tab counts the offers, the budget rises and his line goes", async ({ page }) => {
  await createLyonSave(page);

  // The eleven by key, as the line-up shows it, then the squad's names by key: two players may share a name.
  await openScreen(page, "lineup");
  const slots = page.locator("[data-slot-player-key]");
  await expect(slots).toHaveCount(11);
  const eleven = await slots.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-slot-player-key")));

  await openScreen(page, "squad");
  const rows = page.getByTestId("squad-row");
  await expect(rows.first()).toBeVisible();
  const squad = await rows.evaluateAll((elements) =>
    elements.map((element) => ({
      key: element.getAttribute("data-player-key"),
      name: element.querySelector('[data-testid="squad-player-open"]')?.textContent?.trim() ?? "",
    })),
  );
  const substitutes = squad.filter(({ key }) => !eleven.includes(key)).map(({ name }) => name);
  expect(substitutes).toHaveLength(squad.length - 11);

  await openScreen(page, "transfers");
  const tab = page.getByTestId("market-tab-sell");
  await expect(tab).toHaveText(/^Vendre · \d+ offres?$/);
  const offers = Number(/\d+/.exec(await textOf(tab))?.[0]);
  await tab.click();
  await expect(page).toHaveURL(/\/transfers\?tab=sell$/);
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("market-advanced")).toBeVisible();

  // Each substitute once and nobody else: the best offer on its card, named by its label, the others by a row's first line.
  const sell = page.getByTestId("market-sell");
  await expect(sell.getByTestId("market-sale-offer").getByTestId("sell-player")).toBeVisible();
  const listed = sell.locator("[data-player-id]");
  await expect(listed).toHaveCount(substitutes.length);
  const names = await listed.evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("aria-label") ?? card.querySelector("p")?.textContent?.trim() ?? ""),
  );
  expect(names.sort()).toEqual(substitutes.sort());
  const withOffer = listed.filter({ has: page.getByTestId("sell-player") });
  await expect(withOffer).toHaveCount(offers);

  // The last of the offers: by his id from now on, as « the last » moves with the list.
  const soldId = await playerIdOf(withOffer.last());
  const sold = sell.locator(`[data-player-id="${soldId}"]`);
  const budgetBefore = await budgetOf(page);
  await sold.getByTestId("sell-player").click();
  const dialog = page.getByTestId("sell-dialog");
  await expect(dialog).toContainText("Meilleure offre");
  const offer = await textOf(dialog);
  await dialog.getByTestId("sell-confirm").click();

  await expect(sold).toHaveCount(0);
  await expect(listed).toHaveCount(substitutes.length - 1);
  await expect(page.locator('[data-summary="budget"]')).not.toHaveAttribute("data-value", String(budgetBefore));
  const rise = (await budgetOf(page)) - budgetBefore;
  expect(rise).toBeGreaterThan(0);
  expect(offer).toContain(formatMoney(rise));
});

test("keeps showing proposals but lets nobody sign or sell while the window is closed", async ({ page }) => {
  await createLyonSave(page);
  const saveId = saveIdOf(page);
  // The day after the summer window. Nothing here reads more than the date: no need to simulate August.
  await setSaveDate(saveId, new Date(Date.UTC(2026, 8, 1)));

  await page.goto(`/saves/${saveId}/transfers`);
  const note = page.getByTestId("window-closed-note");
  await expect(note).toHaveText("Mercato fermé : signatures et offres reprendront le 1er janvier 2027.");
  await expect(page.getByTestId("market-proposal")).toBeVisible();
  await expect(page.getByTestId("market-recruit")).toBeDisabled();
  await expect(page.getByTestId("market-pass")).toBeEnabled();
  await expect(page.getByTestId("market-sale-offer")).toHaveCount(0);

  // The substitutes stay listed, without an offer: no club buys while the window is closed.
  await page.getByTestId("market-tab-sell").click();
  await expect(page.getByTestId("market-sell")).toBeVisible();
  await expect(page.getByTestId("market-tab-sell")).toHaveText("Vendre · aucune offre");
  await expect(note).toBeVisible();
  await expect(page.getByTestId("market-sale-row").first()).toBeVisible();
  await expect(page.getByTestId("market-sale-offer")).toHaveCount(0);
  await expect(page.getByTestId("sell-player")).toHaveCount(0);
});

test.describe("on a phone, in English", () => {
  test.use({ locale: "en-GB", viewport: PHONE });

  test("speaks English, stays within the screen, and keeps the main button clear of the navigation", async ({ page }) => {
    await createLyonSave(page);
    await openScreen(page, "transfers");

    await expect(page.getByTestId("transfers-title")).toHaveText("Market");
    await expect(page.getByTestId("market-tab-buy")).toHaveText("Buy");
    await expect(page.getByTestId("market-tab-sell")).toHaveText(/^Sell · \d+ offers?$/);
    await expect(page.getByTestId("market-intro")).toHaveText(/^Your weak spot: .+ \(rated \d+\)\. Here's who would fix it\.$/);
    await expect(page.getByTestId("market-pass")).toHaveText("Pass");
    const sign = page.getByTestId("market-recruit");
    await expect(sign).toHaveText("Sign");
    await expectNoSidewaysScroll(page, "buying");

    // The budget alone over the card, and nothing beside it: both are a computer's.
    await expect(page.locator('[data-summary="budget"]')).toBeVisible();
    await expect(page.locator('[data-summary="wage-room"]')).toBeHidden();
    await expect(page.getByTestId("market-spotted-player").first()).toBeHidden();
    await expect(page.getByTestId("market-sale-offer")).toBeHidden();

    // Scrolled to the middle of the screen: toBeInViewport alone would pass for a button under the bar at its foot.
    await sign.evaluate((button) => button.scrollIntoView({ block: "center" }));
    await expect(sign).toBeInViewport({ ratio: 1 });
    await expectUncovered(sign);

    const playerName = await textOf(page.getByTestId("market-player-name"));
    await sign.click();
    const confirmation = page.getByTestId("market-recruit-dialog");
    await expect(confirmation.locator("dt")).toHaveText(["Price", "Wage per season", "Length", "Budget left"]);
    await expect(confirmation.locator("dd").nth(2)).toHaveText("3 seasons, until 30 June 2029");
    await expectNoSidewaysScroll(page, "confirmation");
    await page.getByTestId("market-recruit-confirm").click();
    const signed = page.getByTestId("market-signed");
    await expect(signed).toContainText("Signed!");
    await expect(signed).toContainText(`${playerName} joins ${LYON}`);
    await expectNoSidewaysScroll(page, "signed");
    await page.getByTestId("market-signed-continue").click();
    await expect(signed).toHaveCount(0);

    await page.getByTestId("market-tab-sell").click();
    await expect(page.getByTestId("market-sell")).toBeVisible();
    await expectNoSidewaysScroll(page, "selling");

    await page.getByTestId("market-advanced").click();
    await expect(page.getByTestId("advanced-title")).toHaveText("Advanced market");
    await expectNoSidewaysScroll(page, "advanced market");
    await page.getByTestId("market-tab-clubs").click();
    await expect(page.getByTestId("market-filters")).toBeVisible();
    await expectNoSidewaysScroll(page, "advanced market, other clubs");
  });
});
