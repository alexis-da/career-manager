import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { parse } from "dotenv";
import { createAnonymousUser, deleteUsers, signedUserCookie, USER_COOKIE } from "./db";
import { expectNoSidewaysScroll, openTodo, waitForReact } from "./helpers";

// The national coach (docs/design/selections.md § 5, N4 and N4b), on worldVersion 2 twins of the demo save at the start
// of their first season (e2e/coach-save.mts): the federation of Portugal's offer on the season's start screen, accepted;
// then, a coach up to his first match at stake, his assistant's list confirmed in one go and changed in its sheet, his
// match played live from the dashboard to its result. At 1280, 390 and 360 px.

const COMPUTER = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 360, height: 780 };

test.use({ viewport: COMPUTER });

/** A twin of the demo save in the state asked for, owned by a fresh anonymous user signed in on the page. */
async function coachSave(page: Page, baseURL: string | undefined, mode: "offer" | "coach"): Promise<{ saveId: string; userId: string }> {
  const userId = await createAnonymousUser(new Date());
  const databaseUrl = parse(readFileSync(".env.test")).DATABASE_URL_TEST;
  const [saveId] = execFileSync("npx", ["tsx", "e2e/coach-save.mts", userId, mode], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    shell: process.platform === "win32",
    timeout: 300_000,
  })
    .trim()
    .split("\n")
    .slice(-1);
  await page.context().addCookies([{ name: USER_COOKIE, value: signedUserCookie(userId), url: baseURL ?? "" }]);
  return { saveId, userId };
}

test("offers the post on the season's start screen: the nation, its objective, the club kept; accepted, the National team tab", async ({ page, baseURL }) => {
  test.setTimeout(300_000);
  const { saveId, userId } = await coachSave(page, baseURL, "offer");
  try {
    await page.goto(`/saves/${saveId}/season-start`);
    const offer = page.getByTestId("coach-offer");
    await expect(offer).toHaveAttribute("data-nation", "POR");
    await expect(offer).toContainText("Portugal");
    await expect(offer).toContainText("Tu gardes ton club");
    await expectNoSidewaysScroll(page, "season start with an offer, 1280");
    for (const viewport of [PHONE, SMALL_PHONE]) {
      await page.setViewportSize(viewport);
      await expectNoSidewaysScroll(page, `season start with an offer, ${viewport.width}`);
    }
    await page.setViewportSize(COMPUTER);

    // Not a coach yet: no tab of his own under Équipe.
    await page.goto(`/saves/${saveId}/squad`);
    await expect(page.getByTestId("nav-squad")).toBeVisible();
    await expect(page.getByTestId("nav-nation")).toHaveCount(0);

    await page.goto(`/saves/${saveId}/season-start`);
    await waitForReact(page);
    await page.getByTestId("coach-offer-view").click();
    const sheet = page.getByTestId("coach-offer-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Coupe du Vieux Continent 2028");
    await sheet.getByTestId("coach-offer-accept").click();
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/nation$`), { timeout: 60_000 });
    await expect(page.getByTestId("nation-head")).toHaveAttribute("data-nation", "POR");
    await expect(page.getByTestId("nav-nation")).toBeVisible();
    await expect(page.getByTestId("nation-session")).toBeVisible();
  } finally {
    await deleteUsers([userId]);
  }
});

test("prepares his first break: his assistant's list confirmed in one go, then changed; his qualifier played live to its result", async ({ page, baseURL }) => {
  test.setTimeout(420_000);
  const { saveId, userId } = await coachSave(page, baseURL, "coach");
  try {
    // The dashboard leads to his match at stake, before his club's next one; « À faire » has his list, after the break's
    // call-ups of his club's players: maybe behind « Voir tout ».
    await page.goto(`/saves/${saveId}`);
    const hero = page.getByTestId("dashboard-next-match");
    await expect(hero.getByTestId("hero-national")).toHaveAttribute("data-nation", "POR");
    await expect((await openTodo(page)).getByTestId("alert-coach-call-up")).toBeVisible();

    // His tab: his assistant's list, confirmed in one go.
    await page.goto(`/saves/${saveId}/nation`);
    await waitForReact(page);
    const callUp = page.getByTestId("nation-call-up");
    await expect(callUp).toHaveAttribute("data-by", "assistant");
    await callUp.getByTestId("call-up-validate").click();
    await expect(callUp).toHaveAttribute("data-by", "manager", { timeout: 30_000 });
    for (const viewport of [PHONE, SMALL_PHONE]) {
      await page.setViewportSize(viewport);
      await expectNoSidewaysScroll(page, `national team, ${viewport.width}`);
    }

    // Changed in its sheet: one player out, another in, 23 again.
    await page.getByTestId("call-up-edit").click();
    const sheet = page.getByTestId("call-up-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("call-up-count")).toContainText("23");
    const called = sheet.locator('[data-testid="call-up-candidate"][data-selected="true"]');
    const notCalled = sheet.locator('[data-testid="call-up-candidate"][data-selected="false"]:not([data-injured])');
    // An outfield player out, another one in: the goalkeepers' count stays.
    const out = await called.last().getAttribute("data-key");
    const into = await notCalled.last().getAttribute("data-key");
    // By their keys: the sheet moves a player from one list to the other as he is toggled.
    await sheet.locator(`[data-testid="call-up-candidate"][data-key="${out}"]`).click();
    await sheet.locator(`[data-testid="call-up-candidate"][data-key="${into}"]`).click();
    await expect(sheet.locator(`[data-testid="call-up-candidate"][data-key="${into}"]`)).toHaveAttribute("data-selected", "true");
    await expect(sheet.locator(`[data-testid="call-up-candidate"][data-key="${out}"]`)).toHaveAttribute("data-selected", "false");
    await expectNoSidewaysScroll(page, "call-up sheet, 360");
    await sheet.getByTestId("call-up-save").click();
    await expect(sheet).toBeHidden({ timeout: 30_000 });
    await page.setViewportSize(COMPUTER);

    // His qualifier, live from the dashboard: the national live screen, played to its result.
    await page.goto(`/saves/${saveId}`);
    await waitForReact(page);
    await page.getByTestId("dashboard-next-match").getByTestId("next-match").click();
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live/nation\\?m=.+&rejouer=1$`), { timeout: 120_000 });
    await expect(page.locator("[data-live-page]")).toBeVisible();
    await page.setViewportSize(PHONE);
    await expectNoSidewaysScroll(page, "national match live, 390");
    await page.setViewportSize(COMPUTER);
    const card = page.getByTestId("break-card");
    const choice = page.getByTestId("choice-card");
    const skip = page.getByTestId("live-skip");
    const proceed = page.getByTestId("live-continue");
    // To the result: to half-time at once, its card's « Reprendre », then on, a choice event's card answered as the
    // assistant would (each card closed before the next move: a card closing is still visible a moment).
    await skip.click();
    for (let step = 0; step < 15; step++) {
      await expect(card.or(choice).or(skip).or(proceed).first()).toBeVisible({ timeout: 90_000 });
      if (await proceed.isVisible()) {
        break;
      }
      if (await card.isVisible()) {
        const resume = page.getByTestId("break-resume");
        await expect(resume).toBeEnabled();
        await resume.click();
        await expect(card).toBeHidden({ timeout: 30_000 });
      } else if (await choice.isVisible()) {
        const validate = page.getByTestId("choice-validate");
        await expect(validate).toBeEnabled();
        await validate.click();
        await expect(choice).toBeHidden({ timeout: 30_000 });
      } else if (await skip.isVisible()) {
        await skip.click({ timeout: 10_000 }).catch(() => undefined);
      }
    }
    await expect(proceed).toBeVisible({ timeout: 90_000 });
    // Back to his tab, the qualifier played.
    await page.goto(`/saves/${saveId}/nation`);
    await expect(page.getByTestId("nation-results")).toContainText(/\d+ ?[-–] ?\d+/);
  } finally {
    await deleteUsers([userId]);
  }
});
