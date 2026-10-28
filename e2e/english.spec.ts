import { expect, test, type Page } from "@playwright/test";
import { createSave, deleteSave, saveRow } from "./helpers";

// The game in English, for a browser that prefers it (Accept-Language en-GB): the public pages, the language switcher
// and its cookie, and a career created up to its dashboard. The save's own screens are not translated yet.
test.use({ locale: "en-GB" });

const LYON = "Olympique Lyonnais";

/** The language of the page: its <html lang>. */
const pageLanguage = (page: Page) => page.locator("html");

// Name of the save the running test created, until it is deleted.
let saveName: string | undefined;

test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("speaks English to a browser that prefers it, on every public page", async ({ page }) => {
  await page.goto("/");
  await expect(pageLanguage(page)).toHaveAttribute("lang", "en");
  await expect(page.getByText("Playable in English and French.")).toBeVisible();
  await expect(page.getByText("The 2026-27 season starts on 1 July 2026.")).toBeVisible();
  await expect(page.getByTestId("create-save")).toHaveText("Start the career");
  await expect(page.getByTestId("google-sign-in")).toHaveText("Continue with Google");
  await expect(page.getByTestId("privacy-link")).toHaveText("Privacy");

  // The creation form's refusals come from the server, in English too.
  await page.getByTestId("create-save").click();
  await expect(page.getByText("Give the career a name.")).toBeVisible();
  await expect(page.getByText("Enter the manager's name.")).toBeVisible();
  await expect(page.getByText("Choose a club.")).toBeVisible();

  // The countries in English, sorted in English, each with its two divisions.
  await page.getByTestId("club").click();
  const clubs = page.getByRole("listbox");
  await expect(clubs.getByRole("group", { name: /^[A-Za-z]+$/ })).toHaveText([/^England/, /^France/, /^Germany/, /^Italy/, /^Spain/]);
  await expect(clubs.getByRole("group", { name: "England", exact: true }).getByRole("group", { name: "Division 2" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("challenge-teaser").click();
  await expect(page).toHaveURL(/\/challenge$/);
  await expect(pageLanguage(page)).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Weekly challenge");
  await expect(page).toHaveTitle("Weekly challenge · Late Winner");
  await expect(page.getByText(/^Week \d+ · ends Monday \d+ \w+ at 0\d:00 \(Paris time\)$/)).toBeVisible();
  await expect(page.getByTestId("challenge-competition")).toHaveText(/^(England|France|Germany|Italy|Spain) — Division [12]$/);
  await expect(page.getByTestId("challenge-play")).toHaveText("Play the challenge");

  await page.goto("/login");
  await expect(page).toHaveTitle("Sign in · Late Winner");
  await expect(page.getByText("Find your careers on all your devices.")).toBeVisible();

  const missing = await page.goto("/no-such-page");
  expect(missing?.status()).toBe(404);
  await expect(pageLanguage(page)).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");

  // Looking creates nothing: no cookie, the language included, before the player chooses one.
  expect((await page.context().cookies()).map((cookie) => cookie.name)).toEqual([]);
});

test("keeps the language the player chooses, whatever the browser prefers, until they choose again", async ({ page, context }) => {
  await page.goto("/challenge");
  await expect(page.getByTestId("language-en")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("language-fr").click();
  await expect(pageLanguage(page)).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Défi de la semaine");
  await expect(page.getByTestId("language-fr")).toHaveAttribute("aria-pressed", "true");
  const chosen = (await context.cookies()).find((cookie) => cookie.name === "lw_lang");
  expect(chosen).toMatchObject({ value: "fr", httpOnly: true, sameSite: "Lax" });
  // About a year (not simulation code: the clock is fine here).
  expect(chosen?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 360 * 86_400);

  // The browser still prefers English: the cookie wins, on every page.
  await page.goto("/");
  await expect(pageLanguage(page)).toHaveAttribute("lang", "fr");
  await expect(page.getByTestId("create-save")).toHaveText("Créer la partie");

  await page.getByTestId("language-en").click();
  await expect(pageLanguage(page)).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("create-save")).toHaveText("Start the career");
  expect((await context.cookies()).find((cookie) => cookie.name === "lw_lang")?.value).toBe("en");
});

test("creates a career in English and finds it on the home page, its date in British English", async ({ page }) => {
  // A unique name to find this save again (not simulation code: the clock is fine here).
  const name = `E2E English ${Date.now()}`;
  saveName = name;

  await createSave(page, name, LYON);
  // The save's screens: the language switcher is in their header, the rest is still French.
  await expect(page.getByTestId("language-en")).toHaveAttribute("aria-pressed", "true");

  await page.goto("/");
  await expect(page.getByText("1 career", { exact: true })).toBeVisible();
  const row = saveRow(page, name);
  await expect(row).toContainText("1 July 2026");
  await expect(row.getByTestId("delete-save")).toHaveText("Delete");
  const notice = page.getByTestId("save-limit");
  await expect(notice).toContainText("You already have a career under way. Sign in with Google to run up to three.");
  await expect(notice.getByTestId("google-sign-in")).toHaveText("Continue with Google");
});
