import { expect, test } from "@playwright/test";

test("shows the privacy page without a cookie, and links to it from the home page and /login", async ({ page }) => {
  const response = await page.goto("/privacy");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Confidentialité");
  await expect(page.getByRole("heading", { name: "English summary" })).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);

  for (const path of ["/", "/login"]) {
    await page.goto(path);
    await page.getByRole("link", { name: "Confidentialité" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
  }
});
