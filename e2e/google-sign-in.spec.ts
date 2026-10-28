import { expect, test } from "@playwright/test";

// Nothing goes through Google: only the button a signed-out player sees, on the home page and on /login.
test("a signed-out player is offered « Continuer avec Google » on the home page and on /login", async ({ page }) => {
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    await expect(page.getByTestId("google-sign-in")).toHaveText("Continuer avec Google");
    await expect(page.getByTestId("sign-out")).toHaveCount(0);
  }
});
