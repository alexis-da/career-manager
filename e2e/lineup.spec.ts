import { expect, test } from "@playwright/test";
import { FORMATION_NAMES } from "../src/engine/formations";
import { createSave, deleteSave, expectLineupSaved, openScreen, pickFormation } from "./helpers";

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

/** The status line while the assistant makes the eleven. */
const ASSISTANT = "Onze de ton adjoint · il le refait avant chaque match";

test("switches to a 4-4-2 for the assistant, brings a substitute on, both saved at once, undoes, finds them after a reload, hands it back", async ({
  page,
}) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);

    await openScreen(page, "lineup");
    await expect(page.getByRole("heading", { name: "Composition" })).toBeVisible();
    const formation = page.getByTestId("lineup-formation");
    await expect(formation).toHaveAttribute("data-formation", "4-3-3");
    await expect(formation).toHaveText("4-3-3 sentinelle");

    // Its sheet: the three recommended for the squad, the 4-3-3 under them unless it is one of them, then the fourteen
    // others behind a button that unfolds them in place, by family, none of the three again.
    await formation.click();
    const picker = page.getByTestId("formation-picker");
    const recommended = picker.getByTestId("formation-best");
    await expect(recommended).toHaveCount(3);
    const best = await recommended.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-formation")));
    await expect(picker.getByTestId("formation-current")).toHaveCount(best.includes("4-3-3") ? 0 : 1);
    const showAll = picker.getByTestId("formation-show-all");
    await expect(showAll).toHaveText(`Voir tous les dispositifs · ${FORMATION_NAMES.length - 3}`);
    await expect(showAll).toHaveAttribute("aria-expanded", "false");
    const others = picker.getByTestId("formation-choice");
    await expect(others.first()).toBeHidden();
    await showAll.click();
    await expect(showAll).toHaveAttribute("aria-expanded", "true");
    await expect(picker.locator('[data-testid="formation-choice"]:visible')).toHaveCount(FORMATION_NAMES.length - 3);
    const unfolded = await others.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-formation")));
    expect(new Set([...best, ...unfolded]).size).toBe(FORMATION_NAMES.length);
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();

    // The assistant makes a new career's eleven: the formation picked is saved at once, his eleven in it, his still. No
    // button to save, no toast: the status line says it.
    const status = page.getByTestId("lineup-status");
    await expect(status).toHaveText(ASSISTANT);
    await pickFormation(page, "4-4-2");
    await expect(formation).toHaveText("4-4-2 à plat");
    await expectLineupSaved(page);
    await expect(status).toHaveText(ASSISTANT);
    await expect(status).toHaveAttribute("data-mode", "assistant");
    await expect(page.getByTestId("lineup-save")).toHaveCount(0);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    await page.reload();
    await expect(formation).toHaveAttribute("data-formation", "4-4-2");
    await expect(status).toHaveText(ASSISTANT);

    // A substitute brought on: saved at once, the line-up taken from the assistant, which a card says once.
    const slot = page.locator(`[data-slot-index="${STRIKER_SLOT}"]`);
    // By key, not by name: Lyon has three Martins, and two of them can sit on the bench.
    const starterKey = (await slot.getAttribute("data-slot-player-key")) ?? "";
    await slot.click();
    // Its candidates in the list's place, a substitute among them.
    const substitute = page.locator('[data-testid="lineup-candidate"][data-candidate-place="substitute"]').first();
    const substituteKey = (await substitute.getAttribute("data-player-key")) ?? "";
    await substitute.click();

    await expect(slot).toHaveAttribute("data-slot-player-key", substituteKey);
    // The replaced starter is now among the substitutes.
    await expect(page.locator(`[data-bench="true"][data-player-key="${starterKey}"]`)).toHaveCount(1);
    await expectLineupSaved(page);
    await expect(status).toHaveText("Ta composition · enregistrée");
    await expect(status).toHaveAttribute("data-mode", "player");
    const tookHand = page.getByTestId("lineup-took-hand");
    await expect(tookHand).toContainText("C'est ta composition : ton adjoint ne la changera plus, sauf pour un blessé ou un suspendu.");
    await expect(tookHand.getByTestId("lineup-hand-back")).toBeVisible();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);

    // « Annuler » goes back one gesture: the one that took the line-up gives it back to the assistant, his eleven again.
    await page.getByTestId("lineup-cancel").click();
    await expect(page.getByText("Ton adjoint fait la composition.")).toBeVisible();
    await expect(status).toHaveText(ASSISTANT);
    await expect(slot).toHaveAttribute("data-slot-player-key", starterKey);
    await expect(tookHand).toHaveCount(0);

    // The same gesture again, then a reload: his own from then on, the card said once, at the gesture.
    await slot.click();
    await page.locator(`[data-testid="lineup-candidate"][data-player-key="${substituteKey}"]`).first().click();
    await expect(slot).toHaveAttribute("data-slot-player-key", substituteKey);
    await expectLineupSaved(page);
    await page.reload();
    await expect(page.getByTestId("lineup-formation")).toHaveAttribute("data-formation", "4-4-2");
    await expect(page.locator(`[data-slot-index="${STRIKER_SLOT}"]`)).toHaveAttribute("data-slot-player-key", substituteKey);
    await expect(page.locator(`[data-player-key="${substituteKey}"]`)).toHaveCount(0);
    await expect(status).toHaveText("Ta composition · enregistrée");
    await expect(tookHand).toHaveCount(0);

    // Handed back to the assistant: his eleven again, the saved one kept, unread.
    await page.getByTestId("lineup-hand-back").click();
    await expect(page.getByText("Ton adjoint fait la composition.")).toBeVisible();
    await expect(status).toHaveText(ASSISTANT);
    await expect(page.locator(`[data-slot-index="${STRIKER_SLOT}"]`)).toHaveAttribute("data-slot-player-key", starterKey);
    await expect(page.getByTestId("lineup-assistant")).toBeVisible();
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});

test("drags a substitute onto a slot and a starter to the bench, keeps an incomplete eleven unsaved, then saves it complete", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);
    await openScreen(page, "lineup");
    await expect(page.getByTestId("lineup-formation")).toHaveAttribute("data-formation", "4-3-3");

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
    const status = page.getByTestId("lineup-status");
    await expectLineupSaved(page);
    await expect(status).toHaveText("Ta composition · enregistrée");

    // A starter dragged onto the bench leaves the eleven: his slot stays empty, and nothing is sent while it is.
    const centreBackKey = (await centreBack.getAttribute("data-slot-player-key")) ?? "";
    await centreBack.dragTo(bench);
    await expect(centreBack.locator("[data-slot-player]")).toHaveText("Vide");
    await expect(page.locator(`[data-player-key="${centreBackKey}"]`)).toHaveAttribute("data-bench", "true");
    await expect(status).toHaveText("Poste vide : choisis un joueur pour l'enregistrer");
    await expect(status).toHaveAttribute("data-save", "incomplete");
    await expect(status).toHaveAttribute("data-busy", "false");
    await expect(page.getByTestId("lineup-warning")).toContainText("Onze incomplet : 1 poste vide.");

    // A reserve dragged onto the empty slot completes the eleven: saved then.
    const reserve = page.locator('[data-bench="false"]').first();
    const reserveKey = (await reserve.getAttribute("data-player-key")) ?? "";
    await reserve.dragTo(centreBack);
    await expect(centreBack).toHaveAttribute("data-slot-player-key", reserveKey);
    await expectLineupSaved(page);
    await expect(status).toHaveText("Ta composition · enregistrée");

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
    await openScreen(page, "lineup");
    await expect(page.getByTestId("lineup-formation")).toHaveAttribute("data-formation", "4-3-3");

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
    // Under his name, what it costs him, in red: his rating, then his rating up front, lower.
    const gap = striker.locator("[data-rating-gap]");
    await expect(gap).toHaveClass(/text-loss/);
    const [overall, rating] = ((await gap.getAttribute("data-rating-gap")) ?? "").split(":").map(Number);
    expect(rating).toBeLessThan(overall);
    await expect(striker).toHaveAttribute("aria-label", new RegExp(`DC ${overall} · joue BU : ${rating}, hors poste`));

    const summary = page.locator("[data-lineup-summary]");
    await expect(summary).toContainText("hors poste");
    await expect(summary.locator(`[data-off-position="${centreBackKey}"]`)).toHaveText(/ \(DC en BU\)$/);
  } finally {
    await deleteSave(page, name);
    saveName = undefined;
  }
});
