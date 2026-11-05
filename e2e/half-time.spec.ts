import { expect, test, type Locator } from "@playwright/test";
import { createSave, deleteSave, EMOJI, openScreen } from "./helpers";

const LYON = "Olympique Lyonnais";

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("stops the match at half-time, makes a substitution and switches to 4-4-2, then shows both on the match sheet", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E mi-temps ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);

    await page.getByTestId("next-match").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/);
    // The way on goes to the break, not to the final whistle.
    const skip = page.getByTestId("live-skip");
    await expect(skip).toHaveText("Aller à la mi-temps");
    await skip.click();
    // The break's card, the panel shut until it is asked for.
    const card = page.locator("[data-break]");
    const halfTime = page.locator("[data-half-time]");
    await expect(card.getByRole("heading", { name: "Mi-temps" })).toBeVisible();
    await expect(halfTime).toHaveCount(0);

    // While the match waits, no main button on its page, where it would lead nowhere; from any other, it leads back to
    // the match, and the page opens on the break.
    await expect(page.getByTestId("next-match")).toHaveCount(0);
    await expect(page.getByTestId("resume-match")).toHaveCount(0);
    // The card closed first: it is modal, and keeps the sidebar out of reach.
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await openScreen(page, "dashboard");
    await expect(page.getByTestId("next-match")).toHaveCount(0);
    await page.getByTestId("resume-match").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live$/);
    await expect(card.getByRole("heading", { name: "Mi-temps" })).toBeVisible();
    await expect(skip).toHaveCount(0);

    // The panel from the card, the line-up unfolded: it opens without the pitch and the bench. The last player of the
    // 4-3-3 still on the pitch makes way for the last substitute.
    await card.getByRole("button", { name: "Coaching" }).click();
    await expect(halfTime.getByRole("heading", { name: "Mi-temps" })).toBeVisible();
    await expect(halfTime.locator("[data-substitutions]")).toHaveText("Remplacements : 0/5");
    await halfTime.getByTestId("half-time-lineup-toggle").click();
    const slotIndex = await halfTime.locator("button[data-slot-player-key]").last().getAttribute("data-slot-index");
    const striker = halfTime.locator(`button[data-slot-index="${slotIndex}"]`);
    const outgoingKey = await striker.getAttribute("data-slot-player-key");
    const substitute = halfTime.locator("[data-bench-player-key]").last();
    const incomingKey = await substitute.getAttribute("data-bench-player-key");
    await substitute.dragTo(striker);
    await expect(striker).toHaveAttribute("data-slot-player-key", incomingKey ?? "");
    await expect(halfTime.locator("[data-substitutions]")).toHaveText("Remplacements : 1/5");
    await expect(halfTime.locator(`[data-off-player-key="${outgoingKey}"]`)).toBeVisible();
    // He went off for good: he is not on the bench.
    await expect(halfTime.locator(`[data-bench-player-key="${outgoingKey}"]`)).toHaveCount(0);

    await halfTime.getByLabel("Dispositif").selectOption("4-4-2");
    await expect(halfTime.locator("[data-slot-position]")).toHaveText(["G", "DD", "DC", "DC", "DG", "MD", "MC", "MC", "MG", "BU", "BU"]);
    await expect(halfTime.locator("[data-substitutions]")).toHaveText("Remplacements : 1/5");

    // The second half on the same page, from the break: the way on leads to the result now.
    await halfTime.getByRole("button", { name: "Reprendre le match" }).click();
    await expect(halfTime).toBeHidden();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live$/);
    await expect(skip).toHaveText("Aller au résultat");
    await skip.click();
    await expect(page.getByText("Terminé", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
    await expect(page.getByTestId("next-match")).toBeVisible();

    // The match sheet: the half-time score, and the substitution at 46'.
    await page.goto(`${page.url()}/fixtures`);
    await page.getByTestId("fixture-row").getByTestId("match-sheet-trigger").first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator('[data-match-sheet="half-time"]')).toHaveText(/^Mi-temps : \d+ – \d+$/);
    // By key, not by name: two players of a match may share a name.
    const substitution = sheet.locator(`li[data-player-key="${incomingKey}"][data-related-player-key="${outgoingKey}"]`);
    await expect(substitution.filter({ hasText: "Remplacement" }).filter({ hasText: "46'" })).toHaveCount(1);
    await expect(sheet).not.toContainText(EMOJI);
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});

test("with reduced motion, goes from one stop to the next at once: its choice events, the break, the final whistle", async ({ page }) => {
  const name = `E2E mi-temps sans animation ${Date.now()}`;
  saveName = name;
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await createSave(page, name, LYON);

    // Each choice event's card, « Valider » and the match goes on at once, until half-time's card, no clock running in
    // between: the Coaching panel never opens by itself.
    await page.getByTestId("next-match").click();
    const card = page.getByTestId("choice-card");
    const panel = page.locator("[data-half-time]");
    const halfTime = page.locator("[data-break]").getByRole("heading", { name: "Mi-temps" });
    const stopsUntil = async (end: Locator): Promise<void> => {
      for (;;) {
        await expect(card.or(end).first()).toBeVisible();
        if (await end.isVisible()) {
          return;
        }
        await expect(page.getByTestId("live-skip")).toHaveCount(0);
        // The next stop may be a card too: this one has gone once its minute has.
        const kind = `${await card.getAttribute("data-choice-kind")}:${await card.locator("p.eyebrow").textContent()}`;
        await page.getByTestId("choice-validate").click();
        await expect
          .poll(async () => ((await card.isVisible()) ? `${await card.getAttribute("data-choice-kind")}:${await card.locator("p.eyebrow").textContent()}` : ""))
          .not.toBe(kind);
        await expect(panel).toHaveCount(0);
      }
    };
    await stopsUntil(halfTime);
    await expect(page.getByTestId("live-skip")).toHaveCount(0);
    await expect(panel).toHaveCount(0);

    await page.getByTestId("break-resume").click();
    await expect(halfTime).toBeHidden();
    await stopsUntil(page.getByText("Terminé", { exact: true }));
    await expect(page.getByTestId("live-skip")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Continuer" })).toBeVisible();
  } finally {
    await deleteSave(page, name);
    saveName = undefined;
  }
});
