import { expect, test, type Page, type Route } from "@playwright/test";
import { createSave, deleteSave, expectLineupSaved, expectNoSidewaysScroll, expectOrangeActions, openScreen, saveIdOf } from "./helpers";

// The line-up saved by itself (docs/design/effectif-adjoint.md § 1): each gesture saved at once, without a button. Two
// tabs never overwrite each other unseen; a save the network lost is tried again, then left to « Réessayer »; leaving
// the screen right after a gesture loses nothing; and while a match waits live, the screen is read only.

const LYON = "Olympique Lyonnais";

/** Slots of the 4-3-3: GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW. */
const STRIKER_SLOT = 9;

/** The line-up's status lines, in French. */
const STATUS = {
  assistant: "Onze de ton adjoint · il le refait avant chaque match",
  saved: "Ta composition · enregistrée",
  conflict: "Changée dans un autre onglet",
  failed: "Pas enregistrée : pas de réseau",
};

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

// Also runs when the test exceeds its timeout: Playwright then abandons the test body, finally block included.
test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test.describe.configure({ timeout: 240_000 });

/** Creates a Lyon of its own for the test, deleted at its end, and opens its line-up. */
async function lyonLineup(page: Page, label: string): Promise<void> {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E ${label} ${Date.now()}`;
  saveName = name;
  await createSave(page, name, LYON);
  await openScreen(page, "lineup");
  await expect(page.getByTestId("lineup-status")).toHaveText(STATUS.assistant);
}

/**
 * Brings the first substitute of the bench on at the striker's slot, as a player does in two touches: the slot, then
 * him among its candidates. Returns his key.
 */
async function bringSubstituteOn(page: Page, rank = 0): Promise<string> {
  const slot = page.locator(`[data-slot-index="${STRIKER_SLOT}"]`);
  await slot.click();
  const substitute = page.locator('[data-testid="lineup-candidate"][data-candidate-place="substitute"]').nth(rank);
  const key = (await substitute.getAttribute("data-player-key")) ?? "";
  await substitute.click();
  await expect(slot).toHaveAttribute("data-slot-player-key", key);
  return key;
}

const strikerOf = (page: Page): Promise<string | null> => page.locator(`[data-slot-index="${STRIKER_SLOT}"]`).getAttribute("data-slot-player-key");

test("never overwrites a line-up changed in another tab: its gesture refused, « Voir la dernière » shows the other's", async ({ page }) => {
  await lyonLineup(page, "deux onglets");
  // A second tab of the same player, on the same line-up, opened before the first one changes it.
  const other = await page.context().newPage();
  try {
    await other.goto(page.url());
    await expect(other.getByTestId("lineup-status")).toHaveText(STATUS.assistant);

    // The first tab brings a substitute on: saved, the line-up the player's own.
    const first = await bringSubstituteOn(page);
    await expectLineupSaved(page);
    await expect(page.getByTestId("lineup-status")).toHaveText(STATUS.saved);

    // The second, still on the assistant's eleven, brings on another: refused, nothing written, its gesture shown until
    // the player chooses; « Voir la dernière » in place of « Annuler ».
    const second = await bringSubstituteOn(other, 1);
    expect(second).not.toBe(first);
    const status = other.getByTestId("lineup-status");
    await expect(status).toHaveText(STATUS.conflict);
    await expect(status).toHaveAttribute("data-save", "conflict");
    await expect(status).toHaveAttribute("role", "alert");
    await expect(other.getByTestId("lineup-cancel")).toHaveCount(0);
    await expect(other.getByTestId("lineup-took-hand")).toHaveCount(0);

    // « Voir la dernière »: the line-up the first tab saved, the player's, which a gesture changes again.
    await other.getByTestId("lineup-reload").click();
    await expect(other.locator(`[data-slot-index="${STRIKER_SLOT}"]`)).toHaveAttribute("data-slot-player-key", first);
    await expect(status).toHaveText(STATUS.saved);
    await expect(other.getByTestId("lineup-reload")).toHaveCount(0);
    const third = await bringSubstituteOn(other);
    await expectLineupSaved(other);
    await expect(status).toHaveText(STATUS.saved);

    // The first tab's next gesture is refused in its turn: it still believes its own line-up. Another gesture than the
    // second's: the same one, from the same line-up, would only be what is saved already (`unchanged`). Reloaded, it
    // shows the second's.
    await bringSubstituteOn(page, 1);
    await expect(page.getByTestId("lineup-status")).toHaveText(STATUS.conflict);
    await page.reload();
    await expect(page.locator(`[data-slot-index="${STRIKER_SLOT}"]`)).toHaveAttribute("data-slot-player-key", third);
  } finally {
    await other.close();
  }
});

test("tries a save the network lost again, then offers « Réessayer », and saves once the network is back", async ({ page }) => {
  await lyonLineup(page, "réseau");
  // The network cut for the page's saves, as Chromium says when it is offline: every Server Action aborted.
  const offline = (route: Route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"] !== undefined
      ? route.abort("internetdisconnected")
      : route.continue();
  await page.route("**/*", offline);

  // The gesture shows at once; its save, lost, says « enregistrement… » while it is tried again at 2, 5 then 15 s.
  const key = await bringSubstituteOn(page);
  const status = page.getByTestId("lineup-status");
  await expect(status).toHaveAttribute("data-busy", "true");
  await expect(status).toHaveText("Ta composition · enregistrement…");
  // Then not saved, never silently: « Réessayer », and the page asks before it is left.
  await expect(status).toHaveText(STATUS.failed, { timeout: 40_000 });
  await expect(status).toHaveAttribute("data-save", "failed");
  await expect(status).toHaveAttribute("data-busy", "true");
  await expect(page.getByTestId("lineup-retry")).toBeVisible();
  expect(await strikerOf(page)).toBe(key);

  // The network back: « Réessayer » saves the line-up shown.
  await page.unroute("**/*", offline);
  await page.getByTestId("lineup-retry").click();
  await expectLineupSaved(page);
  await expect(status).toHaveText(STATUS.saved);
  await expect(page.getByTestId("lineup-retry")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(`[data-slot-index="${STRIKER_SLOT}"]`)).toHaveAttribute("data-slot-player-key", key);
  await expect(status).toHaveText(STATUS.saved);
});

test("keeps a gesture made just before leaving the screen", async ({ page }) => {
  await lyonLineup(page, "départ");
  const key = await bringSubstituteOn(page);
  // Straight to the squad, the save maybe still on its way: a navigation does not cancel it.
  await page.getByTestId("nav-squad").click();
  await expect(page.getByTestId("squad-table")).toBeVisible();
  await expect
    .poll(async () => {
      await page.goto(`/saves/${saveIdOf(page)}/lineup`);
      return strikerOf(page);
    })
    .toBe(key);
  await expect(page.getByTestId("lineup-status")).toHaveText(STATUS.saved);
});

test.describe("while a match waits live", () => {
  test("is read only, the way back to the match its only orange, on a phone and on a computer", async ({ page }) => {
    await lyonLineup(page, "direct");
    const saveId = saveIdOf(page);
    // The next match started live, then left at its first pause.
    await page.getByTestId("nav-dashboard").click();
    await page.getByTestId("dashboard-next-match").getByTestId("next-match").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });

    // On a computer: why, and no status, no gesture; the sidebar's « Match en cours — reprendre » is the screen's orange.
    await page.goto(`/saves/${saveId}/lineup`);
    const live = page.getByTestId("lineup-live");
    await expect(live).toContainText("Ta composition est figée jusqu'au coup de sifflet final.");
    await expect(page.getByTestId("lineup-status")).toHaveCount(0);
    await expect(page.getByTestId("lineup-live-resume")).toBeHidden();
    await expectOrangeActions(page, ["resume-match"]);
    const striker = page.locator(`[data-slot-index="${STRIKER_SLOT}"]`);
    const before = await striker.getAttribute("data-slot-player-key");
    await striker.click({ force: true });
    await expect(striker).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("lineup-candidates")).toHaveCount(0);
    expect(await striker.getAttribute("data-slot-player-key")).toBe(before);

    // On a phone, at 390 and 360 px: the way back to the match in the panel, the screen's only orange, within the screen.
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await page.reload();
      const resume = page.getByTestId("lineup-live-resume");
      await expect(resume).toBeVisible();
      await expectOrangeActions(page, ["lineup-live-resume"]);
      await expectNoSidewaysScroll(page, `${width} px`);
    }
    await page.getByTestId("lineup-live-resume").click();
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live`));
  });
});
