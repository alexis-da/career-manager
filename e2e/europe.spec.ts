import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { parse } from "dotenv";
import { createAnonymousUser, deleteUsers, signedUserCookie, USER_COOKIE } from "./db";
import { createSave, deleteSave, expectNoSidewaysScroll, fullOrangeActions, openScreen, saveIdOf } from "./helpers";

// The European competitions (docs/design/europe.md): the Europe screen under Match of a new worldVersion 2 save, at 1280,
// 390 and 360 px, its European matches in the calendar; then a European final played live, on neutral ground, to its
// shoot-out, on a worldVersion 1 twin of the demo save given a Laurel Cup final by hand (e2e/europe-final-save.mts).

const LYON = "Olympique Lyonnais";

const COMPUTER = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 360, height: 780 };

test.use({ viewport: COMPUTER });

/** The Europe screen is open on a competition, and no wider than the window. */
async function expectEurope(page: Page, code: string, clubs: number, step: string): Promise<void> {
  await expect(page.getByTestId("europe-title")).toBeVisible();
  await expect(page.getByTestId("europe-competition")).toHaveAttribute("data-competition", code);
  await expect(page.getByTestId("europe-table-row")).toHaveCount(clubs);
  await expectNoSidewaysScroll(page, step);
}

test("opens the European competitions of a new worldVersion 2 save: « Europe » under Match, both league phases, the calendar", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E Europe ${Date.now()}`;
  try {
    await createSave(page, name, LYON);
    const saveId = saveIdOf(page);
    await openScreen(page, "europe");
    await expect(page.getByTestId("nav-europe")).toHaveText("Europe");
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/europe`));

    // Lyon, 6th of its league in the source season, plays the Pennant Cup: the screen opens on it, its row lit.
    await expectEurope(page, "eu.2", 15, "Pennant Cup, 1280");
    await expect(page.locator('[data-testid="europe-table-row"][data-managed="true"]')).toHaveCount(1);
    await expect(page.getByTestId("europe-card")).toBeVisible();
    await expect(page.getByTestId("europe-bracket")).toBeVisible();
    await expect(page.getByTestId("europe-neutral")).toBeVisible();
    // No full orange action of its own: the game's action stays in the column, as on every Match screen.
    expect(await fullOrangeActions(page)).toEqual(["next-match"]);

    // The other competition, from the switch: 20 clubs, none of them Lyon.
    await page.getByTestId("europe-switch-eu1").click();
    await expectEurope(page, "eu.1", 20, "Laurel Cup, 1280");
    await expect(page.locator('[data-testid="europe-table-row"][data-managed="true"]')).toHaveCount(0);

    for (const [viewport, label] of [
      [PHONE, "390"],
      [SMALL_PHONE, "360"],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto(`/saves/${saveId}/europe`);
      await expectEurope(page, "eu.2", 15, `Pennant Cup, ${label}`);
      await page.goto(`/saves/${saveId}/europe?c=eu.1`);
      await expectEurope(page, "eu.1", 20, `Laurel Cup, ${label}`);
    }

    // The calendar: Lyon's first European match, its competition's tag beside its round (a club of the Pennant Cup rests
    // at two of the league phase's six dates, maybe both in September).
    await page.setViewportSize(COMPUTER);
    let tagged = 0;
    for (const month of ["2026-09", "2026-10", "2026-11"]) {
      await page.goto(`/saves/${saveId}/fixtures?mois=${month}`);
      await expect(page.getByTestId("fixtures-title")).toBeVisible();
      const european = page.locator('[data-testid="fixture-row"]').filter({ has: page.locator('[data-europe="eu.2"]') });
      tagged = await european.count();
      if (tagged > 0) {
        await expect(european.first().locator('[data-europe="eu.2"]')).toHaveText("Fanions");
        await expect(european.first()).toContainText("journée");
        break;
      }
    }
    expect(tagged).toBeGreaterThan(0);
  } finally {
    await deleteSave(page, name);
  }
});

test("plays a European final live, on neutral ground, through extra time to its shoot-out", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  // A worldVersion 1 twin of the demo save with a Laurel Cup final added, for a user of its own (deleted with its save).
  const userId = await createAnonymousUser(new Date());
  try {
    const databaseUrl = parse(readFileSync(".env.test")).DATABASE_URL_TEST;
    const saveId = execFileSync("npx", ["tsx", "e2e/europe-final-save.mts", userId], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
      shell: process.platform === "win32",
    })
      .trim()
      .split("\n")
      .at(-1);
    await page.context().addCookies([{ name: USER_COOKIE, value: signedUserCookie(userId), url: baseURL ?? "" }]);

    // The dashboard's hero: the competition and its round, on neutral ground rather than at home.
    await page.goto(`/saves/${saveId}`);
    const hero = page.getByTestId("dashboard-next-match");
    await expect(hero).toContainText("Coupe des Lauriers — Finale");
    await expect(hero).toContainText("Terrain neutre");

    await page.getByRole("button", { name: "Jouer la journée" }).click();
    await expect(page).toHaveURL(/\/live\?rejouer=1$/);
    await expect(page.getByText("Coupe des Lauriers — Finale · 12 août 2026 · Terrain neutre")).toBeVisible();
    const skip = page.getByTestId("live-skip");
    await expect(skip).toHaveText("Aller à la mi-temps");
    await skip.click();
    const card = page.locator("[data-break]");
    await expect(card.getByRole("heading", { name: "Mi-temps" })).toBeVisible();
    await card.getByTestId("break-resume").click();
    await expect(card).toBeHidden();

    // Level after 90 minutes: the match stops at the end of regulation time, as a cup tie does.
    await expect(skip).toHaveText("Aller au résultat");
    await skip.click();
    await expect(card.getByRole("heading", { name: "Fin du temps réglementaire" })).toBeVisible();
    await expect(card).toHaveAttribute("data-break", "REGULATION_END");
    await expect(page.getByTestId("break-resume")).toHaveText("Jouer la prolongation");
    await card.getByTestId("break-resume").click();
    await expect(card).toBeHidden();
    await skip.click();
    await expect(page.locator("[data-live-status]")).toHaveText("Terminé");
    await expect(page.locator("[data-shootout-score]")).toHaveText("3 – 4");
    await expect(page.locator('[data-score-note="extra-time"]').first()).toHaveText("a.p.");
    await expect(page.locator('[data-score-note="penalties"]').first()).toHaveText("3-4 t.a.b.");

    // The Europe screen: the final played on neutral ground, and its winner.
    await page.goto(`/saves/${saveId}/europe`);
    await expect(page.getByTestId("europe-competition")).toHaveAttribute("data-competition", "eu.1");
    await expect(page.getByTestId("europe-neutral")).toBeVisible();
    await expect(page.getByTestId("europe-winner")).toBeVisible();
    await page.setViewportSize(PHONE);
    await page.reload();
    await expect(page.getByTestId("europe-winner")).toBeVisible();
    await expectNoSidewaysScroll(page, "Europe after the final, 390");
  } finally {
    await deleteUsers([userId]);
  }
});
