import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { parse } from "dotenv";
import { createAnonymousUser, deleteUsers, signedUserCookie, USER_COOKIE } from "./db";
import { ACTION_ORANGE, createSave, deleteSave, openScreen } from "./helpers";

const LYON = "Olympique Lyonnais";

test("opens the cup of a new worldVersion 2 save: « Coupe » in the navigation, the preliminary round drawn", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E coupe ${Date.now()}`;
  try {
    await createSave(page, name, LYON);
    await openScreen(page, "cup");
    await expect(page.getByTestId("nav-cup")).toHaveText("Coupe");

    await expect(page.getByRole("heading", { name: "Coupe", level: 1 })).toBeVisible();
    await expect(page.getByText("France — Coupe · Saison 2026-27")).toBeVisible();
    // Lyon, in the first division, is exempt from the preliminary round: four ties between second division clubs.
    await expect(page.locator("[data-cup-run]")).toContainText("Exempté du tour préliminaire");
    const preliminary = page.locator('[data-cup-round="1"]');
    await expect(preliminary.getByRole("heading", { name: "Tour préliminaire" })).toBeVisible();
    await expect(preliminary.getByText("Mer. 23 sept.")).toBeVisible();
    await expect(preliminary.locator("[data-cup-tie]")).toHaveCount(4);
    await expect(page.locator('[data-cup-round="2"]')).toContainText("Tirage à l'issue du tour précédent.");
    await expect(page.locator('[data-cup-round="6"]').getByRole("heading", { name: "Finale" })).toBeVisible();
  } finally {
    await deleteSave(page, name);
  }
});

test("plays a cup final live: half-time, the end of regulation time, extra time and the shoot-out, then its match sheet", async ({
  page,
  baseURL,
}) => {
  // A worldVersion 1 twin of the demo save with a final added, for a user of its own (deleted with its save).
  const userId = await createAnonymousUser(new Date());
  try {
    const databaseUrl = parse(readFileSync(".env.test")).DATABASE_URL_TEST;
    const saveId = execFileSync("npx", ["tsx", "e2e/cup-final-save.mts", userId], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
      shell: process.platform === "win32",
    })
      .trim()
      .split("\n")
      .at(-1);
    await page.context().addCookies([{ name: USER_COOKIE, value: signedUserCookie(userId), url: baseURL ?? "" }]);
    await page.goto(`/saves/${saveId}`);
    await expect(page.getByText("Coupe — Finale · Mercato ouvert")).toBeVisible();

    await page.getByRole("button", { name: "Jouer la journée" }).click();
    await expect(page).toHaveURL(/\/live\?rejouer=1$/);
    await expect(page.getByText("Coupe — Finale · 12 août 2026")).toBeVisible();
    const skip = page.getByTestId("live-skip");
    await expect(skip).toHaveText("Coaching à la mi-temps");
    await skip.click();
    const pause = page.locator("[data-half-time]");
    await expect(pause.getByRole("heading", { name: "Mi-temps" })).toBeVisible();
    await pause.getByRole("button", { name: "Reprendre sans changement" }).click();

    // Level after 90 minutes: a second break, the way on says so, and it is the screen's main action once more.
    await expect(page).toHaveURL(/\/live\?reprise=1$/);
    await expect(skip).toHaveText("Coaching à la pause");
    await expect(skip).toHaveCSS("background-color", ACTION_ORANGE);
    await skip.click();
    await expect(pause.getByRole("heading", { name: "Fin du temps réglementaire" })).toBeVisible();
    await expect(pause).toHaveAttribute("data-half-time", "REGULATION_END");
    // The panel of that break: one substitution more, the assistant on what follows, and extra time on its button.
    await expect(pause.locator("[data-substitutions]")).toContainText("/6 · un de plus pour la prolongation");
    await expect(page.getByTestId("half-time-advice")).toContainText("À égalité après 90 minutes : prolongation, puis tirs au but");
    await expect(page.getByTestId("half-time-resume")).toHaveText("Jouer la prolongation");
    await expect(page.locator("[data-live-status]")).toHaveText("Fin du temps réglementaire");
    await expect(page.getByTestId("live-events").locator("li").first()).toContainText("Fin du temps réglementaire");
    // The match waits there: the page opens on it again, nothing left to skip.
    await page.reload();
    await expect(pause.getByRole("heading", { name: "Fin du temps réglementaire" })).toBeVisible();
    await expect(skip).toHaveCount(0);
    await pause.getByRole("button", { name: "Reprendre sans changement" }).click();

    await expect(page).toHaveURL(/\/live\?reprise=2$/);
    await expect(skip).toHaveText("Aller au résultat");
    await skip.click();
    await expect(page.locator("[data-live-status]")).toHaveText("Terminé");
    await expect(page.locator("[data-shootout-score]")).toHaveText("5 – 3");
    await expect(page.locator("[data-shootout] li")).toHaveCount(9);
    await expect(page.locator('[data-score-note="extra-time"]').first()).toHaveText("a.p.");
    await expect(page.locator('[data-score-note="penalties"]').first()).toHaveText("5-3 t.a.b.");

    // The match sheet: « a.p. », « t.a.b. », extra time and the shoot-out kick by kick.
    await page.goto(`/saves/${saveId}/fixtures`);
    const row = page.getByTestId("fixture-row").filter({ hasText: "Coupe — Finale" });
    await expect(row).toContainText("a.p. · 5-3 t.a.b.");
    await expect(row.locator("[data-result]")).toContainText("2 – 2");
    await row.getByTestId("match-sheet-trigger").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator('[data-score-note="extra-time"]')).toHaveText("a.p.");
    await expect(sheet.locator('[data-score-note="penalties"]')).toHaveText("5-3 t.a.b.");
    await expect(sheet.getByRole("heading", { name: "Prolongation" })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Tirs au but" })).toBeVisible();
    await expect(sheet.locator("[data-kick]")).toHaveCount(9);
    await expect(sheet.locator('[data-kick="missed"]')).toHaveCount(1);
  } finally {
    await deleteUsers([userId]);
  }
});
