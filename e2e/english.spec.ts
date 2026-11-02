import { expect, test, type Page } from "@playwright/test";
import { createSave, deleteSave, openScreen, saveRow } from "./helpers";

// The game in English, for a browser that prefers it (Accept-Language en-GB): the public pages, the language switcher
// and its cookie, a career created and found again on the home page, then played up to its live match and its table.
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
  await expect(page.getByTestId("create-save")).toHaveText("Start my career");
  await expect(page.getByTestId("google-sign-in")).toHaveText("Continue with Google");
  await expect(page.getByTestId("privacy-link")).toHaveText("Privacy");

  // The creation form's refusals come from the server, in English too. A club is ticked from the start and the career's
  // name follows it: the other two refusals take a form emptied by hand.
  await page.getByTestId("create-save").click();
  await expect(page.getByText("Enter the manager's name.")).toBeVisible();
  await page.getByTestId("create-save-options").click();
  await page.getByTestId("save-name").fill("");
  await page.locator('input[name="clubId"]').evaluate((input: HTMLInputElement) => {
    input.value = "";
  });
  await page.getByTestId("create-save").click();
  await expect(page.getByText("Give the career a name.")).toBeVisible();
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
  await expect(page.getByTestId("challenge-week")).toHaveText(/^Week \d+ · ends Monday \d{2}:\d{2}$/);
  await expect(page.getByTestId("challenge-managers")).toHaveText(/(^E|· e)nds Monday \d+ \w+ at 0\d:00 \(Paris time\)$/);
  await expect(page.getByTestId("challenge-competition")).toHaveText(/^(England|France|Germany|Italy|Spain) — Division [12]$/);
  await expect(page.getByTestId("challenge-play")).toHaveText("Play the challenge");

  await page.goto("/login");
  await expect(page).toHaveTitle("Sign in · Late Winner");
  await expect(page.getByText("Find your careers on all your devices.")).toBeVisible();

  // The privacy page in full in English, not the French one and its summary.
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy · Late Winner");
  await expect(page.getByRole("heading", { name: "Your rights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "English summary" })).toHaveCount(0);

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
  await expect(page.getByTestId("create-save")).toHaveText("Lancer ma carrière");

  await page.getByTestId("language-en").click();
  await expect(pageLanguage(page)).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("create-save")).toHaveText("Start my career");
  expect((await context.cookies()).find((cookie) => cookie.name === "lw_lang")?.value).toBe("en");
});

test("creates a career in English and finds it on the home page, its date in British English", async ({ page }) => {
  // A unique name to find this save again (not simulation code: the clock is fine here).
  const name = `E2E English ${Date.now()}`;
  saveName = name;

  await createSave(page, name, LYON);
  // The language switcher is in the career's settings too.
  await openScreen(page, "club");
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

test("plays a career in English up to its live match, then reads the table", async ({ page }) => {
  // A world of 198 clubs created, then a match played live.
  test.setTimeout(240_000);
  // A unique name to find this save again (not simulation code: the clock is fine here).
  const name = `E2E English match ${Date.now()}`;
  saveName = name;
  await createSave(page, name, LYON);

  // The save's screens in English: header, navigation, dashboard.
  await expect(pageLanguage(page)).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("dashboard-title")).toHaveText("Dashboard");
  await expect(page.getByTestId("header-competition")).toHaveText("France — Division 1 · Season 2026-27");
  await expect(page.getByTestId("nav-dashboard")).toHaveText("Home");
  await expect(page.getByTestId("nav-team")).toHaveText("Squad");
  await expect(page.getByTestId("nav-match")).toHaveText("Match");
  await expect(page.getByTestId("nav-transfers")).toHaveText("Market");
  await expect(page.getByTestId("nav-club")).toHaveText("Club");
  await expect(page.getByTestId("next-match")).toHaveText("Play the match");

  // The next match, live: half-time, then the end of the match.
  await page.getByTestId("next-match").click();
  await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/);
  await expect(page.getByTestId("live-caption")).toHaveText(/^France — Division 1 · Matchday 1 · \d{1,2} August 2026$/);
  await expect(page.getByTestId("live-skip")).toHaveText("Coach at half-time");
  await page.getByTestId("live-skip").click();
  await expect(page.getByTestId("half-time-title")).toHaveText("Half-time");
  await expect(page.getByTestId("half-time-substitutions")).toContainText("Substitutions: 0/5");
  await expect(page.getByTestId("half-time-resume-unchanged")).toHaveText("Resume without changes");
  await expect(page.getByTestId("half-time-resume")).toHaveText("Resume the match");
  await page.getByTestId("half-time-resume-unchanged").click();
  await expect(page.getByTestId("live-skip")).toHaveText("Go to the result");
  await page.getByTestId("live-skip").click();
  await expect(page.getByTestId("live-status")).toHaveText("Full time");
  await page.getByTestId("live-continue").click();
  await expect(page.getByTestId("dashboard-title")).toHaveText("Dashboard");
  await expect(page.getByTestId("dashboard-last-result")).toContainText("Last result");

  // The table: France's, its first division, in English.
  await openScreen(page, "standings");
  await expect(page.getByTestId("nav-standings")).toHaveText("Table");
  await expect(page.getByTestId("standings-title")).toHaveText("Table");
  await expect(page.getByTestId("standings-country-fr")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("standings-division-1")).toHaveText("Division 1");
  const table = page.locator('[data-testid="standings-table"]:visible');
  await expect(table.locator("thead")).toContainText("GD");
  await expect(table.locator("tbody tr")).toHaveCount(18);

  // Away from the dashboard, the game's actions are the sidebar's, under their own names.
  await expect(page.getByTestId("next-match")).toHaveText("Next match");
  await expect(page.getByTestId("simulate-menu")).toHaveText("Simulate until…");

  // The squad's tab, in English: tabs exist only under their entry.
  await openScreen(page, "squad");
  await expect(page.getByTestId("nav-squad")).toHaveText("Squad");
});
