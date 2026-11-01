import { expect, test } from "@playwright/test";
import { createSave, deleteSave, openScreen } from "./helpers";

const LYON = "Olympique Lyonnais";

/** Short labels of the positions, as the slots of the pitch show them. */
const SHORT: Record<string, string> = {
  GK: "G",
  RB: "DD",
  CB: "DC",
  LB: "DG",
  CDM: "MDC",
  CM: "MC",
  CAM: "MOC",
  RM: "MD",
  LM: "MG",
  RW: "AD",
  LW: "AG",
  ST: "BU",
};
const SLOT_COUNT = 11;

/**
 * A Lyon whose automatic 4-3-3 starts a player off position (a right midfielder in central midfield) and two at a
 * secondary position: fixed, so that the test plays the same squad every run; it finds them by their keys.
 */
const SEED = "e2e-postes-1";

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("shows secondary positions in the squad, and a player at his secondary position is not off position", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E postes ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON, SEED);

    // Three players in four have at least one: a squad of 25 always shows some.
    await openScreen(page, "squad");
    await expect(page.locator("tbody [data-secondary-position]").first()).toBeVisible();

    await openScreen(page, "lineup");
    await expect(page.getByLabel("Dispositif")).toHaveValue("4-3-3");

    // The eleven as the pitch shows it: each slot's position, its starter's key and how he fits it.
    const slots: { index: number; short: string; key: string; fit: string }[] = [];
    for (let index = 0; index < SLOT_COUNT; index++) {
      const slot = page.locator(`[data-slot-index="${index}"]`);
      slots.push({
        index,
        short: ((await slot.locator("[data-slot-position]").textContent()) ?? "").trim(),
        key: (await slot.getAttribute("data-slot-player-key")) ?? "",
        fit: (await slot.locator("[data-position]").getAttribute("data-fit")) ?? "",
      });
    }
    const offStarter = slots.find((slot) => slot.fit === "line" || slot.fit === "other-line");
    const secondaryStarter = slots.find((slot) => slot.fit === "secondary");
    if (offStarter === undefined || secondaryStarter === undefined) {
      throw new Error(`The seed ${SEED} no longer starts a player off position and another at a secondary position`);
    }
    // The summary names the first, never the second: by their keys, as two players of a squad may share a last name.
    const summary = page.locator("[data-lineup-summary]");
    await expect(summary.locator(`[data-off-position="${offStarter.key}"]`)).toHaveCount(1);
    await expect(summary.locator(`[data-off-position="${secondaryStarter.key}"]`)).toHaveCount(0);

    // A reserve with a secondary position the formation has, into a slot held by another than the starter off position.
    const reserves = page.locator("button[data-player-key]");
    let choice: { key: string; slotIndex: number } | undefined;
    for (let index = 0; index < (await reserves.count()) && choice === undefined; index++) {
      const reserve = reserves.nth(index);
      for (const position of await reserve.locator("[data-secondary-position]").evaluateAll((badges) =>
        badges.map((badge) => badge.getAttribute("data-secondary-position") ?? ""),
      )) {
        const slot = slots.find((candidate) => candidate.short === SHORT[position] && candidate.key !== offStarter.key);
        if (slot !== undefined) {
          choice = { key: (await reserve.getAttribute("data-player-key")) ?? "", slotIndex: slot.index };
          break;
        }
      }
    }
    if (choice === undefined) {
      throw new Error(`The seed ${SEED} no longer has a reserve with a secondary position of the 4-3-3`);
    }

    const slot = page.locator(`[data-slot-index="${choice.slotIndex}"]`);
    await slot.click();
    await page.locator(`button[data-player-key="${choice.key}"]`).click();

    await expect(slot).toHaveAttribute("data-slot-player-key", choice.key);
    await expect(slot.locator("[data-position]")).toHaveAttribute("data-fit", "secondary");
    await expect(summary.locator(`[data-off-position="${choice.key}"]`)).toHaveCount(0);
    await expect(summary.locator(`[data-off-position="${offStarter.key}"]`)).toHaveCount(1);

    // Transfers: « Inclure les postes secondaires » adds the players with ST as a secondary position.
    await openScreen(page, "transfers");
    await page.getByRole("link", { name: "Autres clubs" }).click();
    await page.getByLabel("Poste", { exact: true }).selectOption("ST");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL(/position=ST/);
    const totalOf = async () => Number(/^(\d+)/.exec((await page.getByText(/^\d+ joueurs?( · page \d+ sur \d+)?$/).textContent()) ?? "")?.[1]);
    const strikersOnly = await totalOf();

    await page.getByLabel("Inclure les postes secondaires").check();
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL(/withSecondary=1/);
    await expect(page.getByLabel("Inclure les postes secondaires")).toBeChecked();
    expect(await totalOf()).toBeGreaterThan(strikersOnly);
    const rows = page.locator("tbody tr[data-player-id]");
    const playsStriker = await rows.evaluateAll((trs) =>
      trs.map(
        (tr) =>
          tr.querySelector("[data-primary-position]")?.textContent === "BU" ||
          tr.querySelector('[data-secondary-position="ST"]') !== null,
      ),
    );
    expect(playsStriker.length).toBeGreaterThan(0);
    expect(playsStriker.every(Boolean)).toBe(true);
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
