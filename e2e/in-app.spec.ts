import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { deleteUsers, userIdOf } from "./db";
import { createSave, expectNoSidewaysScroll, waitForReact } from "./helpers";

// An app's browser (src/lib/in-app-browser.ts), simulated by its user agent at 390 px: the notice on the home page and the
// dashboard, Chrome offered on Android, the steps on an iPhone, Google gone; then the resume link copied there and spent
// in another browser (src/db/resume-links.ts), which opens the same career, once. The players go at the end, their saves
// and links with them.

const LYON = "Olympique Lyonnais";
const PHONE = { width: 390, height: 844 };

const INSTAGRAM_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 Instagram 337.0.0.35.102 Android (34/14; 450dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; fr_FR; 614462440)";
const INSTAGRAM_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; fr_FR; fr-FR; scale=3.00; 1170x2532; 614462468; IABMV/1)";

const TITLE = "Ouvre Late Winner dans ton navigateur pour garder ta carrière";

const users: (string | null)[] = [];

test.afterAll(async () => {
  await deleteUsers(users);
});

/** A phone's browser at 390 px, in French: an app's when a user agent is given, the clipboard allowed. */
function phone(browser: Browser, userAgent?: string): Promise<BrowserContext> {
  return browser.newContext({
    ...(userAgent === undefined ? {} : { userAgent }),
    viewport: PHONE,
    hasTouch: true,
    locale: "fr-FR",
    permissions: ["clipboard-read", "clipboard-write"],
  });
}

test("the home page tells an app's browser to open the game in the phone's browser: Chrome on Android, the steps on an iPhone, no Google", async ({
  browser,
}) => {
  for (const [userAgent, android] of [
    [INSTAGRAM_ANDROID, true],
    [INSTAGRAM_IPHONE, false],
  ] as const) {
    const context = await phone(browser, userAgent);
    const page = await context.newPage();
    await page.goto("/fr");
    await waitForReact(page);
    const notice = page.getByTestId("in-app-notice");
    await expect(notice).toBeVisible();
    await expect(notice.getByRole("heading", { name: TITLE })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-in-app", "instagram");
    await expect(page.locator("html")).toHaveAttribute("data-in-app-platform", android ? "android" : "ios");
    if (android) {
      await expect(notice.getByTestId("in-app-chrome")).toBeEnabled();
      await expect(notice.getByTestId("in-app-steps")).toBeHidden();
    } else {
      await expect(notice.getByTestId("in-app-chrome")).toBeHidden();
      await expect(notice.getByTestId("in-app-steps")).toHaveText(/Touche le menu ⋯ de l'appli/);
    }
    // No career yet: nothing to copy; and Google, which refuses an app's browser, is gone.
    await expect(notice.getByTestId("resume-link-copy")).toHaveCount(0);
    await expect(page.getByTestId("google-sign-in")).toBeHidden();
    await expect(page.getByTestId("create-save")).toBeVisible();
    await expectNoSidewaysScroll(page, `home in ${android ? "Android" : "iPhone"} Instagram`);
    await context.close();
  }

  // Any other browser: nothing of it, Google there.
  const context = await phone(browser);
  const page = await context.newPage();
  await page.goto("/fr");
  await waitForReact(page);
  await expect(page.locator("html")).not.toHaveAttribute("data-in-app", /.*/);
  await expect(page.getByTestId("in-app-notice")).toBeHidden();
  await expect(page.getByTestId("google-sign-in")).toBeVisible();
  await context.close();
});

test("a career begun in Instagram goes to another browser by its resume link, which opens it once", async ({ browser }) => {
  test.setTimeout(120_000);
  const inApp = await phone(browser, INSTAGRAM_ANDROID);
  const page = await inApp.newPage();
  await createSave(page, `E2E reprise ${Date.now()}`, LYON);
  const player = await userIdOf(inApp);
  users.push(player);
  const career = page.url();

  // The dashboard's notice: the link asked for as it opens, Chrome and the copy ready.
  const notice = page.getByTestId("in-app-notice");
  await expect(notice).toBeVisible();
  await expect(notice.getByTestId("in-app-chrome")).toBeEnabled();
  const copy = notice.getByTestId("resume-link-copy");
  await expect(copy).toHaveText("Copier mon lien de reprise");
  await expectNoSidewaysScroll(page, "dashboard in Instagram");
  await copy.click();
  await expect(notice.getByTestId("resume-link-status")).toHaveText(/Lien copié · il sert une fois, pendant 7 jours/);
  const link = await notice.getByTestId("resume-link-value").inputValue();
  expect(link).toMatch(/^http:\/\/localhost:\d+\/resume\?t=[A-Za-z0-9_-]{43}$/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  // Nothing of the player's id in it.
  expect(link).not.toContain(player ?? "none");

  // The Club screen's settings give the link too, in place of Google.
  await page.goto(`${career}/club`);
  const account = page.getByTestId("settings-account");
  await expect(account.getByTestId("resume-link-copy")).toBeVisible();
  await expect(account.getByTestId("google-sign-in")).toBeHidden();

  // The phone's browser: the link's page names the career, and its button brings it, the same player.
  const safari = await phone(browser);
  const other = await safari.newPage();
  await other.goto(link);
  const resume = other.getByTestId("resume");
  await expect(resume).toHaveAttribute("data-view", "ready");
  await expect(other.getByTestId("resume-career")).toContainText("Olympique Lyonnais · Test E2E");
  await expectNoSidewaysScroll(other, "resume page");
  await other.getByTestId("resume-submit").click();
  await expect(other).toHaveURL(career);
  await expect(other.getByTestId("dashboard-title")).toBeAttached();
  await expect(other.getByTestId("in-app-notice")).toBeHidden();
  expect(await userIdOf(safari)).toBe(player);

  // Once: in a third browser, the link has served; where the career already is, it opens it.
  const third = await phone(browser);
  const thirdPage = await third.newPage();
  await thirdPage.goto(link);
  await expect(thirdPage.getByTestId("resume")).toHaveAttribute("data-view", "used");
  await expect(thirdPage.getByTestId("resume-submit")).toHaveCount(0);
  await other.goto(link);
  await expect(other.getByTestId("resume")).toHaveAttribute("data-view", "here");
  await expect(other.getByTestId("resume-open")).toHaveAttribute("href", new URL(career).pathname);

  // A link that never was.
  await thirdPage.goto(`/resume?t=${"A".repeat(43)}`);
  await expect(thirdPage.getByTestId("resume")).toHaveAttribute("data-view", "unknown");

  await Promise.all([inApp.close(), safari.close(), third.close()]);
});
