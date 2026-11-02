import { expect, test } from "@playwright/test";
import { deleteUsers, userIdOf } from "./db";
import { createSave, saveRow } from "./helpers";

const LYON = "Olympique Lyonnais";

test("a save is seen by the player who created it only: another one gets neither its row nor its page", async ({ browser }) => {
  // Two players: two browser contexts, each with its own cookies.
  const creator = await browser.newContext();
  const other = await browser.newContext();
  const userIds: (string | null)[] = [];
  try {
    const creatorPage = await creator.newPage();
    const otherPage = await other.newPage();
    // A unique name to find this save again (not simulation code: the clock is fine here).
    const name = `E2E accès ${Date.now()}`;

    await createSave(creatorPage, name, LYON);
    const saveUrl = creatorPage.url();
    userIds.push(await userIdOf(creator));
    expect(userIds[0]).not.toBeNull();

    // The creator finds the save on the home page and opens it.
    await creatorPage.goto("/");
    await expect(saveRow(creatorPage, name)).toHaveCount(1);
    expect((await creatorPage.goto(saveUrl))?.status()).toBe(200);

    // The other player sees no row of it, and its address answers 404, as a save that does not exist.
    await otherPage.goto("/");
    await expect(otherPage.getByTestId("public-home")).toBeVisible();
    await expect(saveRow(otherPage, name)).toHaveCount(0);
    expect((await otherPage.goto(saveUrl))?.status()).toBe(404);
    expect((await otherPage.goto(`${saveUrl}/squad`))?.status()).toBe(404);
    userIds.push(await userIdOf(other)); // none: looking creates no user
    expect(userIds[1]).toBeNull();
  } finally {
    // The creator's user goes, and their save with it.
    await deleteUsers(userIds);
    await creator.close();
    await other.close();
  }
});
