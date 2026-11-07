import { expect, test } from "@playwright/test";

test("shows the privacy page without a cookie, and links to it from the home page", async ({ page }) => {
  const response = await page.goto("/privacy");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Confidentialité");
  await expect(page.getByRole("heading", { name: "English summary" })).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);

  await page.goto("/");
  await page.getByTestId("privacy-link").click();
  await expect(page).toHaveURL(/\/privacy$/);
});
