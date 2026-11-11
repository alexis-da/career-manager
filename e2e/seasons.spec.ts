import { expect, test, type Page } from "@playwright/test";
import { demoSaveId, DEMO_USER_ID, signedUserCookie, USER_COOKIE } from "./db";
import { boxOf, openScreen } from "./helpers";

/**
 * The objectives of the demo's season, when the demo save was made since the season objectives (an older one has none,
 * and shows no block): its ranking, then the one its assistant chose before the first match, its owner never choosing,
 * and no cup in its world. « Objectifs : N/2 », N the ones not missed; beside the card on a computer.
 */
async function expectSeasonObjectives(page: Page): Promise<void> {
  const block = page.getByTestId("season-objectives");
  if ((await block.count()) === 0) {
    return;
  }
  const lines = block.locator("[data-objective]");
  await expect(lines).toHaveCount(2);
  await expect(lines.first()).toHaveAttribute("data-objective", "RANKING");
  await expect(lines.first().getByTestId("season-objective-assistant")).toHaveCount(0);
  await expect(lines.nth(1).getByTestId("season-objective-assistant")).toHaveText("Choisi par l'adjoint");
  for (const line of await lines.all()) {
    await expect(line).toHaveAttribute("data-outcome", /^(EXCEEDED|ACHIEVED|MISSED)$/);
    await expect(line).toContainText(/(Dépassé|Atteint|Manqué)$/);
  }
  const met = await block.locator('[data-objective]:not([data-outcome="MISSED"])').count();
  await expect(block).toHaveAttribute("data-total", "2");
  await expect(block).toHaveAttribute("data-met", String(met));
  await expect(block.getByRole("heading")).toHaveText(`Objectifs : ${met}/2`);

  const card = await boxOf(page.getByTestId("season-card"));
  expect((await boxOf(block)).x).toBeGreaterThanOrEqual(card.x + card.width);
}

test("shows the demo save's palmarès, its completed season and the season's card", async ({ page, context, request, baseURL }) => {
  const saveId = await demoSaveId();
  // The demo user's cookie, as the server signs it: the save opens for its owner only.
  await context.addCookies([{ name: USER_COOKIE, value: signedUserCookie(DEMO_USER_ID), url: baseURL ?? "" }]);

  await page.goto(`/saves/${saveId}`);
  await openScreen(page, "seasons");
  await expect(page.getByRole("heading", { name: "Palmarès" })).toBeVisible();
  const season = page.locator('tr[data-season="2026"]');
  await expect(season).toContainText("2026-27");
  await expect(season).toContainText("France — Division 1");
  await expect(season.locator('td[data-column="rank"]')).toHaveText(/^(Champion|\d+e)$/);

  await season.getByRole("link", { name: "Voir la carte de la saison 2026-27" }).click();
  await expect(page.getByRole("heading", { name: "Saison terminée" })).toBeVisible();
  await expectSeasonObjectives(page);
  // The demo stands on the first day of 2027-28: the way on leads to that season's start.
  await expect(page.getByTestId("season-next")).toHaveAttribute("href", `/saves/${saveId}/season-start`);

  // Square by default, previewed and downloaded; landscape from the quieter link.
  const download = page.getByRole("link", { name: "Enregistrer l'image" });
  await expect(download).toHaveAttribute("download", "late-winner-saison-2026-27.png");
  await expect(download).toHaveAttribute("href", /\?lang=fr&v=\d+&format=square$/);
  const landscape = page.getByRole("link", { name: "Version paysage" });
  await expect(landscape).toHaveAttribute("download", "late-winner-saison-2026-27-paysage.png");
  await expect(landscape).toHaveAttribute("href", /\?lang=fr&v=\d+$/);
  const card = page.getByRole("img", { name: /^Carte de la saison/ });
  await expect(card).toBeVisible();
  await expect
    .poll(() => card.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]))
    .toEqual([1080, 1080]);

  // The cards themselves: PNGs for their owner, 404 for a visitor without the cookie.
  for (const link of [download, landscape]) {
    const cardUrl = (await link.getAttribute("href")) ?? "";
    const owned = await page.request.get(cardUrl);
    expect(owned.status()).toBe(200);
    expect(owned.headers()["content-type"]).toBe("image/png");
    const anonymous = await request.get(cardUrl); // the request fixture shares no cookie with the page
    expect(anonymous.status()).toBe(404);
  }
});
