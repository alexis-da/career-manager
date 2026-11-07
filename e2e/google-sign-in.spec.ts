import { expect, test } from "@playwright/test";

// Nothing goes through Google: only the button a signed-out player sees on the home page, and what the page says of a
// sign-in that came back without an account (Auth.js's ?error=, src/auth/auth.ts).
test("a signed-out player is offered « Continuer avec Google » on the home page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("google-sign-in")).toHaveText("Continuer avec Google");
  await expect(page.getByTestId("sign-out")).toHaveCount(0);
  await expect(page.getByTestId("sign-in-error")).toHaveCount(0);
});

test("says on the home page why a Google sign-in came back without an account", async ({ page }) => {
  await page.goto("/?error=AccessDenied");
  await expect(page.getByTestId("sign-in-error")).toHaveText(
    "Connexion refusée : ce compte Google n'a pas d'adresse e-mail vérifiée.",
  );
  await page.goto("/?error=Configuration");
  await expect(page.getByTestId("sign-in-error")).toHaveText("La connexion avec Google a échoué. Réessaie.");
  await expect(page.getByTestId("google-sign-in")).toBeVisible();
});

test("sends the old sign-in page to the home page for good, with its query", async ({ page, request }) => {
  const response = await request.get("/login", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(new URL(response.headers().location, "http://localhost").pathname).toBe("/");

  await page.goto("/login?error=AccessDenied");
  await expect(page).toHaveURL(/\/\?error=AccessDenied$/);
  await expect(page.getByTestId("sign-in-error")).toBeVisible();
});
