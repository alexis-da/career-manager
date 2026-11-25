import { expect, test, type Locator, type Page } from "@playwright/test";
import { createSave, deleteSave, expectLineupSaved, expectNoSidewaysScroll, expectThumbTarget, openScreen } from "./helpers";

// A change made on a phone, 390 × 844: a slot touched opens its candidates over the page, best rated at the slot first,
// each with how he fits it; one touch places a player from outside the eleven, another exchanges two starters, each
// saved at once, the line-up the player's own from the first (docs/design/simplification.md § 3.3,
// docs/design/effectif-adjoint.md § 1).

const LYON = "Olympique Lyonnais";
const PHONE = { width: 390, height: 844 };

/** The line-up's status: the assistant's eleven, then the player's own, saved at each gesture. */
const STATUS = {
  assistant: "Onze de ton adjoint · il le refait avant chaque match",
  saved: "Ta composition · enregistrée",
};

/** Slots of the 4-3-3: GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW. */
const STRIKER_SLOT = 9;
const LEFT_WING_SLOT = 10;

/** The label of each fit, as a candidate's line and the pitch say it. */
const FIT_LABELS: Record<string, string> = {
  exact: "À son poste",
  secondary: "Poste secondaire",
  line: "Dépanne",
  "other-line": "Hors poste",
};

test.use({ viewport: PHONE, hasTouch: true });

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

const slotAt = (page: Page, index: number): Locator => page.locator(`[data-slot-index="${index}"]`);

const sheetOf = (page: Page): Locator => page.getByTestId("lineup-candidates-sheet");

/** A player among the candidates of the sheet. */
const candidateOf = (page: Page, key: string): Locator =>
  sheetOf(page).getByTestId("lineup-candidate").and(page.locator(`[data-player-key="${key}"]`));

/** Each slot's player by key, in the order of the slots. */
const elevenOf = (page: Page): Promise<string[]> =>
  page.getByTestId("pitch-slot").evaluateAll((slots) => slots.map((slot) => slot.getAttribute("data-slot-player-key") ?? ""));

/** The bench in its order, by key. */
const benchOf = (page: Page): Promise<string[]> =>
  page.getByTestId("lineup-bench-player").evaluateAll((players) => players.map((player) => player.getAttribute("data-bench-player-key") ?? ""));

test("lists a slot's candidates over the page, places a reserve and exchanges two starters in a touch each, and keeps it", async ({
  page,
}) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E candidats ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, LYON);
    await openScreen(page, "lineup");
    await expect(page.getByTestId("lineup-formation")).toHaveAttribute("data-formation", "4-3-3");
    // A new career's: the assistant's eleven, nothing to save.
    await expect(page.getByTestId("lineup-assistant")).toBeVisible();
    await expect(page.getByTestId("lineup-status")).toHaveText(STATUS.assistant);
    await expect(page.getByTestId("lineup-save")).toHaveCount(0);
    const eleven = await elevenOf(page);
    const squadSize = 11 + (await page.getByTestId("lineup-reserve").count());

    // The striker's slot touched: its candidates over the page, every player but its own, under him and his actions.
    const striker = slotAt(page, STRIKER_SLOT);
    const outgoing = eleven[STRIKER_SLOT];
    await striker.tap();
    await expect(striker).toHaveAttribute("aria-pressed", "true");
    const sheet = sheetOf(page);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("lineup-selection")).toBeVisible();
    await expect(sheet.getByTestId("lineup-send-to-bench")).toBeVisible();
    const rows = sheet.getByTestId("lineup-candidate");
    await expect(rows).toHaveCount(squadSize - 1);
    const candidates = await rows.evaluateAll((elements) =>
      elements.map((element) => ({
        key: element.getAttribute("data-player-key") ?? "",
        rating: Number(element.getAttribute("data-candidate-rating")),
        fit: element.getAttribute("data-candidate-fit") ?? "",
        place: element.getAttribute("data-candidate-place") ?? "",
        label: element.querySelector("[data-fit-label]")?.textContent ?? "",
      })),
    );
    expect(candidates.map(({ key }) => key)).not.toContain(outgoing);

    // Those who can play first, best rated at the slot first; each with the label of his fit, the defenders out of
    // position up front.
    const playable = await sheet
      .getByTestId("lineup-candidates")
      .locator("ul")
      .first()
      .getByTestId("lineup-candidate")
      .evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-candidate-rating"))));
    expect(playable.length).toBeGreaterThan(0);
    expect(playable).toEqual([...playable].sort((a, b) => b - a));
    for (const { fit, label } of candidates) {
      expect(label).toBe(FIT_LABELS[fit]);
    }
    expect(candidates.map(({ fit }) => fit)).toContain("other-line");
    for (const row of await rows.all()) {
      await expectThumbTarget(row);
    }
    await expectNoSidewaysScroll(page, "a slot's candidates");

    // One touch on the best of those outside the eleven: he takes the slot, its player sits on the bench, the sheet
    // closes and the slot lets go.
    const reserve = candidates.find(({ place }) => place !== "starter");
    if (reserve === undefined) {
      throw new Error("No candidate outside the eleven");
    }
    await candidateOf(page, reserve.key).tap();
    await expect(striker).toHaveAttribute("data-slot-player-key", reserve.key);
    await expect(striker).toHaveAttribute("aria-pressed", "false");
    await expect(sheet).toHaveCount(0);
    await expect(page.locator(`[data-bench-player-key="${outgoing}"]`)).toHaveCount(1);
    // A gesture on a player: saved at once, the line-up his own from then on. « Annuler » under the status, and the card
    // that says it once with the way back to the assistant, thumbs' targets; nothing to save.
    await expectLineupSaved(page);
    await expect(page.getByTestId("lineup-status")).toHaveText(STATUS.saved);
    await expect(page.getByTestId("lineup-save")).toHaveCount(0);
    await expectThumbTarget(page.getByTestId("lineup-cancel"));
    await expectThumbTarget(page.getByTestId("lineup-took-hand").getByTestId("lineup-hand-back"));
    await expectNoSidewaysScroll(page, "a reserve placed");

    // The left wing's slot: the newcomer is among its candidates as the starter he now is, and one touch on him exchanges
    // the two; the bench does not move.
    const wing = slotAt(page, LEFT_WING_SLOT);
    const winger = (await elevenOf(page))[LEFT_WING_SLOT];
    const bench = await benchOf(page);
    await wing.tap();
    await expect(sheet).toBeVisible();
    const starter = candidateOf(page, reserve.key);
    await expect(starter).toHaveAttribute("data-candidate-place", "starter");
    await expect(starter).toContainText("Titulaire en BU");
    const fitAtWing = (await starter.getAttribute("data-candidate-fit")) ?? "";
    await starter.tap();
    await expect(wing).toHaveAttribute("data-slot-player-key", reserve.key);
    await expect(striker).toHaveAttribute("data-slot-player-key", winger);
    await expect(sheet).toHaveCount(0);
    expect(await benchOf(page)).toEqual(bench);
    // Away from his own position, the slot says what it costs him under his name.
    await expect(wing.locator("[data-rating-gap]")).toHaveCount(fitAtWing === "exact" ? 0 : 1);
    await expectNoSidewaysScroll(page, "two starters exchanged");

    // Escape lets a slot go, the sheet with it.
    await wing.tap();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(wing).toHaveAttribute("aria-pressed", "false");

    // Both saved, his own, and found again after a reload, the assistant's card gone, the way back to him there.
    const changed = await elevenOf(page);
    await expectLineupSaved(page);
    await expect(page.getByTestId("lineup-status")).toHaveText(STATUS.saved);
    await page.reload();
    await expect(slotAt(page, LEFT_WING_SLOT)).toHaveAttribute("data-slot-player-key", reserve.key);
    expect(await elevenOf(page)).toEqual(changed);
    expect(await benchOf(page)).toEqual(bench);
    await expect(page.getByTestId("lineup-status")).toHaveText(STATUS.saved);
    await expect(page.getByTestId("lineup-assistant")).toHaveCount(0);
    await expect(page.getByTestId("lineup-save")).toHaveCount(0);
    await expect(page.getByTestId("lineup-took-hand")).toHaveCount(0);
    await expectThumbTarget(page.getByTestId("lineup-hand-back"));
    await expectNoSidewaysScroll(page, "his own line-up saved");
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
