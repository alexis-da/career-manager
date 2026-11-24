import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { parse } from "dotenv";
import { Client } from "pg";
import { assertLocalDatabase, pgConnection } from "../src/db/database-url";
import { createSave, deleteSave, expectNoSidewaysScroll, expectOrangeActions, openTodo, saveIdOf, textOf } from "./helpers";

// The sales the assistant proposes (docs/design/simplification.md § 5), on a Lyon just created then moved to a January:
// twelve of its league matches marked played, none of its players given a minute in them. The Sell tab proposes those
// the assistant needs neither in his eleven nor on his bench, « Garder » sets one aside until the window closes,
// « Vendre » sells another at once at the offer shown, and « À faire » points to the tab. At 390 and 1280 px.

const LYON = "Olympique Lyonnais";
const JANUARY = "2027-01-12T00:00:00.000Z";
const PLAYED = 12;

/** One statement on the end-to-end tests' database (DATABASE_URL_TEST, .env.test), as e2e/db.ts reaches it. */
async function sql(query: string, values: unknown[]): Promise<void> {
  const url = parse(readFileSync(".env.test")).DATABASE_URL_TEST;
  if (url === undefined || url === "") {
    throw new Error(".env.test has no DATABASE_URL_TEST");
  }
  assertLocalDatabase(url, "DATABASE_URL_TEST");
  const client = new Client(pgConnection(url));
  await client.connect();
  try {
    await client.query(query, values);
  } finally {
    await client.end();
  }
}

/**
 * A January of the save's first season without playing it: the managed club's first twelve league matches played 1-0,
 * and its players' league statistics at nothing. The fixtures in between stay unplayed: the test plays nothing.
 */
async function toJanuaryWithoutMinutes(saveId: string): Promise<void> {
  await sql(`UPDATE "Save" SET "currentDate" = $1::timestamp(3) WHERE "id" = $2`, [JANUARY, saveId]);
  await sql(
    `UPDATE "Fixture" SET "played" = true, "status" = 'PLAYED', "homeGoals" = 1, "awayGoals" = 0, "homeHalfTimeGoals" = 0,
       "awayHalfTimeGoals" = 0
     WHERE "id" IN (
       SELECT f."id" FROM "Fixture" f
       JOIN "ClubSave" c ON c."saveId" = f."saveId" AND c."isManaged" AND f."seasonId" IN (
         SELECT s."id" FROM "Season" s WHERE s."saveId" = $1 AND s."competitionId" = c."competitionId")
       WHERE f."saveId" = $1 AND (f."homeClubSaveId" = c."id" OR f."awayClubSaveId" = c."id")
       ORDER BY f."scheduledAt", f."id" LIMIT $2)`,
    [saveId, PLAYED],
  );
  await sql(
    `DELETE FROM "PlayerSeasonStats" st USING "PlayerSave" p, "ClubSave" c
     WHERE st."saveId" = $1 AND p."id" = st."playerSaveId" AND c."id" = p."clubSaveId" AND c."isManaged"`,
    [saveId],
  );
}

let saveName: string | undefined;

test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

async function januarySave(page: Page): Promise<string> {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  saveName = `E2E ventes proposées ${Date.now()}`;
  await createSave(page, saveName, LYON);
  const saveId = saveIdOf(page);
  await toJanuaryWithoutMinutes(saveId);
  return saveId;
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`proposes the players who never play, keeps one, sells another at once (${viewport.width} px)`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    const saveId = await januarySave(page);

    // « À faire » points to the Sell tab, with what the proposals would bring.
    await page.goto(`/saves/${saveId}`);
    const todo = await openTodo(page);
    const line = todo.getByTestId("alert-sale-proposals");
    await expect(line).toBeVisible();
    await expect(line).toContainText("Ton adjoint propose");
    await line.getByTestId("alert-action").click();
    await expect(page).toHaveURL(/\/transfers\?tab=sell$/);

    const proposals = page.getByTestId("market-sale-proposals");
    await expect(proposals).toBeVisible();
    const cards = proposals.getByTestId("market-sale-proposal");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(3);
    await expect(page.getByTestId("market-tab-sell")).toContainText(count === 1 ? "Vendre · 1 proposée" : `Vendre · ${count} proposées`);
    await expect(cards.first().getByTestId("sale-proposal-why")).toHaveText(
      "Aucun match cette saison · ni titulaire ni remplaçant pour ton adjoint",
    );
    // The first card's sale is the screen's orange, the best offer's card then outlined.
    await expectOrangeActions(page, ["sale-proposal-accept"]);
    await expectNoSidewaysScroll(page, "proposals");

    // « Vendre · … » sells the first at once, at the offer shown, without a dialog.
    const sold = cards.first();
    const soldId = await sold.getAttribute("data-player-id");
    const fee = (await textOf(sold.getByTestId("sale-proposal-accept"))).replace(/^Vendre · /, "");
    await sold.getByTestId("sale-proposal-accept").click();
    await expect(page.getByTestId("sell-dialog")).toHaveCount(0);
    // The toast: « Petit vendu à Fulham pour 3,4 M€. »
    await expect(page.getByText(` pour ${fee}.`)).toBeVisible();
    await expect(page.locator(`[data-testid="market-sale-proposal"][data-player-id="${soldId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="market-sale-row"][data-player-id="${soldId}"]`)).toHaveCount(0);

    // « Garder » sets the next one aside until the window closes, when the squad leaves room for one.
    if ((await cards.count()) > 0) {
      const kept = cards.first();
      const keptId = await kept.getAttribute("data-player-id");
      await kept.getByTestId("sale-proposal-keep").click();
      await expect(page.getByText(/reste : ton adjoint ne le proposera plus avant la fin du mercato\.$/)).toBeVisible();
      await expect(proposals.locator(`[data-player-id="${keptId}"]`)).toHaveCount(0);
    }
  });
}
