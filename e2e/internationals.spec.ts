import { expect, test, type Page } from "@playwright/test";
import { createSave, deleteSave, expectNoSidewaysScroll, openScreen, openTodo, saveIdOf } from "./helpers";

// The national teams (docs/design/selections.md, N1 and N2): the first international break of a new save, as the
// manager lives it. The week before, its call-ups in « À faire », the hero and the squad; « Passer la trêve » plays it as
// a step of its own; after it, who comes back injured or tired, the caps on the sheets, the break in the calendar, the
// 14 nations under Match. At 1280, 390 and 360 px. Paris Saint-Germain lends many players: its alerts are sure to show.

const PSG = "Paris Saint-Germain FC";

const COMPUTER = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 360, height: 780 };

test.use({ viewport: COMPUTER });

const heroOf = (page: Page) => page.getByTestId("dashboard-next-match");

test("plays the first international break of a new save as a step of its own: who goes, who comes back, the caps", async ({ page }) => {
  test.setTimeout(300_000);
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E Sélections ${Date.now()}`;
  try {
    await createSave(page, name, PSG);
    const saveId = saveIdOf(page);

    // Simulated to the window's close, 31 August: the club's three first matchdays, the break next, before its match of
    // 12 September (« Fin du mois » would stop on 31 July, before the season's first match).
    await heroOf(page).getByTestId("simulate-menu").click();
    await page.getByTestId("simulate-window-close").click();
    const dialog = page.locator('[data-simulation="dialog"]');
    await expect(dialog.getByRole("button", { name: "Continuer" })).toBeVisible({ timeout: 120_000 });
    await dialog.getByRole("button", { name: "Continuer" }).click();
    await page.goto(`/saves/${saveId}`);

    // The week before: the hero says the break comes first, the main action plays it, « À faire » names the players called
    // (after the market's lines while the window is open: maybe behind « Voir tout »).
    await expect(page.getByTestId("hero-break")).toHaveAttribute("data-state", "upcoming");
    await expect(page.getByTestId("hero-break")).toContainText(/Trêve internationale du 4 sept\. au 8 sept\. avant ce match · \d+ de tes joueurs appelés?/);
    await expect(heroOf(page).getByTestId("next-match")).toHaveText("Passer la trêve");
    const callUps = (await openTodo(page)).getByTestId("alert-international-callups");
    await expect(callUps).toBeVisible();
    await expect(callUps).toContainText(/Trêve du 4 sept\. au 8 sept\. : \d+ joueurs? appelés? en sélection/);
    await expectNoSidewaysScroll(page, "dashboard before the break, 1280");

    // The squad marks them, and a sheet says it.
    await openScreen(page, "squad");
    const called = page.getByTestId("squad-row").filter({ has: page.getByTestId("player-badge-called-up") });
    await expect(called.first()).toBeVisible();
    const calledNames = await called.getByTestId("squad-player-open").allTextContents();
    await called.first().getByTestId("squad-player-open").click();
    await expect(page.getByTestId("player-called-up")).toContainText("Appelé pour la trêve du 4 sept. au 8 sept.");

    // « Passer la trêve »: the break alone, then the dashboard tells who comes back, before the club's match.
    await page.goto(`/saves/${saveId}`);
    await heroOf(page).getByTestId("next-match").click();
    await expect(page.getByTestId("hero-break")).toHaveAttribute("data-state", "back", { timeout: 60_000 });
    await expect(page.getByTestId("hero-break")).toHaveText("Après la trêve internationale");
    await expect(heroOf(page).getByTestId("next-match")).toHaveText("Jouer le match");
    const returns = (await openTodo(page)).getByTestId("alert-international-returns");
    await expect(returns).toBeVisible();
    await expect(returns).toContainText(/^Retour de sélection : /);
    await expect(page.getByTestId("header-date")).toHaveText("mar. 8 sept. 2026");

    // The sheet of a player called who played: his caps now. One left on his nation's bench has none to show, nor any
    // line about the break once it is over.
    await openScreen(page, "squad");
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/squad$`));
    let capped = false;
    for (const calledName of calledNames) {
      await page.getByTestId("squad-row").filter({ hasText: calledName }).first().getByTestId("squad-player-open").click();
      await expect(page.getByTestId("player-sheet-name")).toHaveText(calledName);
      if ((await page.getByTestId("player-sheet-international").count()) > 0) {
        capped = true;
        break;
      }
    }
    expect(capped).toBe(true);
    await expect(page.getByTestId("player-caps")).toContainText(/ · \d+ sélections? · \d+ buts?$/);
    await expect(page.getByTestId("player-called-up")).toHaveCount(0);

    // The calendar has the break among September's matches, played, with the club's players called.
    await page.goto(`/saves/${saveId}/fixtures?mois=2026-09`);
    const breakRow = page.getByTestId("fixtures-break");
    await expect(breakRow).toHaveCount(1);
    await expect(breakRow).toHaveAttribute("data-played", "true");
    await expect(breakRow).toContainText(/Trêve internationale · 4 sept\. – 8 sept\./);
    await expect(breakRow).toContainText(/\d+ joueurs? appelés?/);

    // The 14 nations under Match, by strength, with the last break's 14 results.
    await breakRow.click();
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/internationals$`));
    await expect(page.getByTestId("nav-internationals")).toHaveText("Sélections");
    await expect(page.getByTestId("internationals-nation")).toHaveCount(14);
    await expect(page.getByTestId("internationals-last").getByTestId("internationals-result")).toHaveCount(14);
    // The cycle's qualifiers: Europe's first matchday played, the Old Continent Cup 2028's six places.
    await expect(page.getByTestId("internationals-campaign-line")).toContainText("Coupe du Vieux Continent 2028 · Éliminatoires · 1 trêve jouée sur 8");
    const zone = page.getByTestId("internationals-zone");
    await expect(zone).toHaveCount(1);
    await expect(zone.getByTestId("internationals-zone-row")).toHaveCount(9);
    await expect(zone.locator('[data-testid="internationals-zone-row"][data-qualified="true"]')).toHaveCount(6);
    await expect(page.getByTestId("internationals-last").getByText("Éliminatoires, 1re journée").first()).toBeVisible();
    await expect(page.getByTestId("internationals-last").getByText("Match amical").first()).toBeVisible();
    await expectNoSidewaysScroll(page, "internationals, 1280");

    for (const [viewport, label] of [
      [PHONE, "390"],
      [SMALL_PHONE, "360"],
    ] as const) {
      await page.setViewportSize(viewport);
      for (const path of ["", "/internationals", "/fixtures?mois=2026-09"]) {
        await page.goto(`/saves/${saveId}${path}`);
        await expectNoSidewaysScroll(page, `${path || "dashboard"}, ${label}`);
      }
      await expect(page.getByTestId("fixtures-break")).toBeVisible();
    }
  } finally {
    await page.setViewportSize(COMPUTER);
    await deleteSave(page, name);
  }
});
