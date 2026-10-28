import { expect, test } from "@playwright/test";
import { createSave, deleteSave } from "./helpers";

const LYON = "Olympique Lyonnais";

/** Second striker of the 4-4-2: slots are GK, RB, CB, CB, LB, RM, CM, CM, LM, ST, ST. */
const STRIKER_SLOT = 10;

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("switches to a 4-4-2, brings a substitute on, saves, and finds both after a reload", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);

    await page.getByRole("navigation", { name: "Navigation de la partie" }).getByRole("link", { name: "Composition" }).click();
    await expect(page.getByRole("heading", { name: "Composition" })).toBeVisible();
    const formation = page.getByLabel("Dispositif");
    await expect(formation).toHaveValue("4-3-3");

    await formation.selectOption("4-4-2");
    await expect(page.getByText("Modifications non enregistrées")).toBeVisible();

    const slot = page.locator(`[data-slot-index="${STRIKER_SLOT}"]`);
    // By key, not by name: Lyon has three Martins, and two of them can sit on the bench.
    const starterKey = (await slot.getAttribute("data-slot-player-key")) ?? "";
    await slot.click();
    const substitute = page.locator('[data-bench="true"]').first();
    const substituteKey = (await substitute.getAttribute("data-player-key")) ?? "";
    await substitute.click();

    await expect(slot).toHaveAttribute("data-slot-player-key", substituteKey);
    // The replaced starter is now among the substitutes.
    await expect(page.locator(`[data-bench="true"][data-player-key="${starterKey}"]`)).toHaveCount(1);

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Composition en 4-4-2 enregistrée.")).toBeVisible();
    await expect(page.getByText("Composition enregistrée", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Dispositif")).toHaveValue("4-4-2");
    await expect(page.locator(`[data-slot-index="${STRIKER_SLOT}"]`)).toHaveAttribute("data-slot-player-key", substituteKey);
    await expect(page.locator(`[data-player-key="${substituteKey}"]`)).toHaveCount(0);
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});

test("drags a substitute onto a slot and a starter to the bench, refuses an incomplete eleven, then saves", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);
    await page.getByRole("navigation", { name: "Navigation de la partie" }).getByRole("link", { name: "Composition" }).click();
    await expect(page.getByLabel("Dispositif")).toHaveValue("4-3-3");

    // 4-3-3 slots: GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW.
    const striker = page.locator('[data-slot-index="9"]');
    const centreBack = page.locator('[data-slot-index="3"]');
    const bench = page.getByRole("region", { name: "Banc" });

    // A substitute dragged onto the striker's slot takes it; the striker goes to the bench.
    const substitute = page.locator('[data-bench="true"]').first();
    const substituteKey = (await substitute.getAttribute("data-player-key")) ?? "";
    const strikerKey = (await striker.getAttribute("data-slot-player-key")) ?? "";
    await substitute.dragTo(striker);
    await expect(striker).toHaveAttribute("data-slot-player-key", substituteKey);
    await expect(page.locator(`[data-player-key="${strikerKey}"]`)).toHaveAttribute("data-bench", "true");

    // A starter dragged onto the bench leaves the eleven: his slot stays empty.
    const centreBackKey = (await centreBack.getAttribute("data-slot-player-key")) ?? "";
    await centreBack.dragTo(bench);
    await expect(centreBack.locator("[data-slot-player]")).toHaveText("Vide");
    await expect(page.locator(`[data-player-key="${centreBackKey}"]`)).toHaveAttribute("data-bench", "true");

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(/^Onze incomplet : 1 poste est vide/)).toBeVisible();

    // A reserve dragged onto the empty slot completes the eleven.
    const reserve = page.locator('[data-bench="false"]').first();
    const reserveKey = (await reserve.getAttribute("data-player-key")) ?? "";
    await reserve.dragTo(centreBack);
    await expect(centreBack).toHaveAttribute("data-slot-player-key", reserveKey);

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Composition en 4-3-3 enregistrée.")).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-slot-index="9"]')).toHaveAttribute("data-slot-player-key", substituteKey);
    await expect(page.locator('[data-slot-index="3"]')).toHaveAttribute("data-slot-player-key", reserveKey);
    await expect(page.locator(`[data-player-key="${strikerKey}"]`)).toHaveAttribute("data-bench", "true");
    await expect(page.locator(`[data-player-key="${centreBackKey}"]`)).toHaveAttribute("data-bench", "true");
  } finally {
    await deleteSave(page, name);
    saveName = undefined;
  }
});

test("shows a centre-back dragged up front with his DC badge outlined in red, and lists him as off position", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);
    await page.getByRole("navigation", { name: "Navigation de la partie" }).getByRole("link", { name: "Composition" }).click();
    await expect(page.getByLabel("Dispositif")).toHaveValue("4-3-3");

    // 4-3-3 slots: GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW. Take a centre-back slot held by a real centre-back.
    const centreBackSlots = [page.locator('[data-slot-index="2"]'), page.locator('[data-slot-index="3"]')];
    const badges = await Promise.all(centreBackSlots.map((slot) => slot.locator("[data-position]").getAttribute("data-position")));
    const centreBack = centreBackSlots[badges.indexOf("CB")];
    await expect(centreBack.locator("[data-position]")).toHaveAttribute("data-fit", "exact");
    // By key, not by name: two players of a squad may share a last name.
    const centreBackKey = (await centreBack.getAttribute("data-slot-player-key")) ?? "";

    const striker = page.locator('[data-slot-index="9"]');
    await centreBack.dragTo(striker);

    await expect(striker.locator("[data-slot-position]")).toHaveText("BU");
    await expect(striker).toHaveAttribute("data-slot-player-key", centreBackKey);
    const badge = striker.locator("[data-position]");
    await expect(badge).toHaveText("DC");
    await expect(badge).toHaveAttribute("data-fit", "other-line");
    await expect(badge).toHaveClass(/ring-loss/);

    const summary = page.locator("[data-lineup-summary]");
    await expect(summary).toContainText("hors poste");
    await expect(summary.locator(`[data-off-position="${centreBackKey}"]`)).toHaveText(/ \(DC en BU\)$/);
  } finally {
    await deleteSave(page, name);
    saveName = undefined;
  }
});
