import { expect, test } from "@playwright/test";
import { createSave, deleteSave } from "./helpers";

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
    await createSave(page, name, LYON);
    const nav = page.getByRole("navigation", { name: "Navigation de la partie" });

    // Three players in four have at least one: a squad of 25 always shows some.
    await nav.getByRole("link", { name: "Effectif" }).click();
    await expect(page.locator("tbody [data-secondary-position]").first()).toBeVisible();

    await nav.getByRole("link", { name: "Composition" }).click();
    await expect(page.getByLabel("Dispositif")).toHaveValue("4-3-3");

    // The 4-3-3 slots by short label, to find one matching a reserve's secondary position.
    const slotIndexByShort = new Map<string, number>();
    for (let index = 0; index < SLOT_COUNT; index++) {
      const short = (await page.locator(`[data-slot-index="${index}"] [data-slot-position]`).textContent())?.trim() ?? "";
      if (!slotIndexByShort.has(short)) {
        slotIndexByShort.set(short, index);
      }
    }

    // A reserve with a secondary position the formation has, and that slot.
    const reserves = page.locator("button[data-player-key]");
    let choice: { key: string; slotIndex: number } | undefined;
    for (let index = 0; index < (await reserves.count()) && choice === undefined; index++) {
      const reserve = reserves.nth(index);
      for (const position of await reserve.locator("[data-secondary-position]").evaluateAll((badges) =>
        badges.map((badge) => badge.getAttribute("data-secondary-position") ?? ""),
      )) {
        const slotIndex = slotIndexByShort.get(SHORT[position]);
        if (slotIndex !== undefined) {
          choice = { key: (await reserve.getAttribute("data-player-key")) ?? "", slotIndex };
          break;
        }
      }
    }
    if (choice === undefined) {
      throw new Error("No reserve with a secondary position of the 4-3-3");
    }

    const reserve = page.locator(`button[data-player-key="${choice.key}"]`);
    const fullName = ((await reserve.locator("[data-reserve-name]").textContent()) ?? "").trim();
    const lastName = fullName.split(" ").slice(1).join(" ");
    const slot = page.locator(`[data-slot-index="${choice.slotIndex}"]`);
    await slot.click();
    await reserve.click();

    await expect(slot.locator("[data-slot-player]")).toHaveText(lastName);
    await expect(slot.locator("[data-position]")).toHaveAttribute("data-fit", "secondary");
    await expect(page.locator("[data-lineup-summary]")).not.toContainText(`${lastName} (`);

    // Transfers: « Inclure les postes secondaires » adds the players with ST as a secondary position.
    await nav.getByRole("link", { name: "Transferts" }).click();
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
