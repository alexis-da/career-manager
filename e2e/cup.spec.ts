import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { parse } from "dotenv";
import { createAnonymousUser, deleteUsers, signedUserCookie, USER_COOKIE } from "./db";
import { createSave, deleteSave } from "./helpers";

const LYON = "Olympique Lyonnais";

test("opens the cup of a new worldVersion 2 save: « Coupe » in the navigation, the preliminary round drawn", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E coupe ${Date.now()}`;
  try {
    await createSave(page, name, LYON);
    await page.getByRole("navigation", { name: "Navigation de la partie" }).getByRole("link", { name: "Coupe" }).click();

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
    await page.getByRole("button", { name: "Passer" }).click();
    const pause = page.locator("[data-half-time]");
    await expect(pause.getByRole("heading", { name: "Mi-temps" })).toBeVisible();
    await pause.getByRole("button", { name: "Reprendre sans changement" }).click();

    // Level after 90 minutes: a second break, one substitution more.
    await expect(page).toHaveURL(/\/live\?reprise=1$/);
    await page.getByRole("button", { name: "Passer" }).click();
    await expect(pause.getByRole("heading", { name: "Fin du temps réglementaire" })).toBeVisible();
    await expect(pause.locator("[data-substitutions]")).toContainText("/6 · un de plus pour la prolongation");
    // The match waits there: the page opens on it again.
    await page.reload();
    await expect(pause.getByRole("heading", { name: "Fin du temps réglementaire" })).toBeVisible();
    await pause.getByRole("button", { name: "Reprendre sans changement" }).click();

    await expect(page).toHaveURL(/\/live\?reprise=2$/);
    await page.getByRole("button", { name: "Passer" }).click();
    await expect(page.locator("[data-live-status]")).toHaveText("Terminé");
    await expect(page.locator("[data-shootout-score]")).toHaveText("5 – 3");
    await expect(page.locator("[data-shootout] li")).toHaveCount(9);
    await expect(page.locator('[data-score-note="extra-time"]').first()).toHaveText("a.p.");
    await expect(page.locator('[data-score-note="penalties"]').first()).toHaveText("5-3 t.a.b.");

    // The match sheet: « a.p. », « t.a.b. », extra time and the shoot-out kick by kick.
    await page.goto(`/saves/${saveId}/fixtures?vue=liste`);
    const row = page.getByRole("row").filter({ hasText: "Coupe — Finale" });
    await expect(row).toContainText("a.p. · 5-3 t.a.b.");
    await row.getByRole("button", { name: "2 – 2" }).click();
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
