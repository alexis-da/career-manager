import { expect, test } from "@playwright/test";

// Nothing goes through Google: only the button a signed-out player sees, on the home page and on /login.
test("a signed-out player is offered « Continuer avec Google » on the home page and on /login", async ({ page }) => {
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Continuer avec Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toHaveCount(0);
  }
});
