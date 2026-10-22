import { expect, test } from "@playwright/test";
import { demoSaveId, DEMO_USER_ID, signedUserCookie, USER_COOKIE } from "./db";

test("shows the demo save's palmarès, its completed season and the season's card", async ({ page, context, request, baseURL }) => {
  const saveId = await demoSaveId();
  // The demo user's cookie, as the server signs it: the save opens for its owner only.
  await context.addCookies([{ name: USER_COOKIE, value: signedUserCookie(DEMO_USER_ID), url: baseURL ?? "" }]);

  await page.goto(`/saves/${saveId}`);
  await page.getByRole("link", { name: "Palmarès" }).click();
  await expect(page.getByRole("heading", { name: "Palmarès" })).toBeVisible();
  const season = page.locator('tr[data-season="2026"]');
  await expect(season).toContainText("2026-27");
  await expect(season).toContainText("France — Division 1");
  await expect(season.locator('td[data-column="rank"]')).toHaveText(/^(Champion|\d+e)$/);

  await season.getByRole("link", { name: "Voir la carte de la saison 2026-27" }).click();
  await expect(page.getByRole("heading", { name: "Saison terminée" })).toBeVisible();
  const download = page.getByRole("link", { name: "Télécharger" });
  await expect(download).toHaveAttribute("download", "late-winner-saison-2026-27.png");
  const card = page.getByRole("img", { name: /^Carte de la saison/ });
  await expect(card).toBeVisible();
  await expect.poll(() => card.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1200);

  // The card itself: a PNG for its owner, 404 for a visitor without the cookie.
  const cardUrl = (await download.getAttribute("href")) ?? "";
  const owned = await page.request.get(cardUrl);
  expect(owned.status()).toBe(200);
  expect(owned.headers()["content-type"]).toBe("image/png");
  const anonymous = await request.get(cardUrl); // the request fixture shares no cookie with the page
  expect(anonymous.status()).toBe(404);
});
