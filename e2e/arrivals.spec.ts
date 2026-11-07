import { devices, expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { ARRIVAL_COOKIE } from "../src/lib/arrival";
import { arrivalOfUser, deleteUsers, deleteVisits, userIdOf, visitsOf } from "./db";
import { fillCreateSaveForm } from "./helpers";

// Where the players come from (src/lib/arrival.ts): a visitor's first visit of a public page keeps its source in the
// lw_src cookie and is counted once (VisitDay), a crawler's never; the career created afterwards gives its player that
// arrival, their language and their device. Sources made up for this run, their counts deleted at the end.

const RUN = `e2e-${Date.now().toString(36)}`;
const LYON = "Olympique Lyonnais";
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;
// Not simulation code: the day the server counts a visit on.
const today = () => new Date().toISOString().slice(0, 10);

const arrivalCookieOf = async (context: BrowserContext) => (await context.cookies()).find(({ name }) => name === ARRIVAL_COOKIE);

/** A browser of its own, a computer's in French unless told otherwise. */
const newVisitor = (browser: Browser, options: Parameters<Browser["newContext"]>[0] = {}) =>
  browser.newContext({ ...devices["Desktop Chrome"], locale: "fr-FR", ...options });

test.afterAll(async () => {
  await deleteVisits(RUN);
});

test("keeps a first visit's source in lw_src for 30 days and counts it once, a crawler's never", async ({ browser }) => {
  const source = `${RUN}-visit`;
  const visitor = await newVisitor(browser);
  const page = await visitor.newPage();

  await page.goto(`/fr/defi?ref=${source}`, { referer: "https://www.reddit.com/r/WebGames/comments/abc/" });
  const cookie = await arrivalCookieOf(visitor);
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  expect(new URLSearchParams(decodeURIComponent(cookie?.value ?? "")).toString()).toBe(
    new URLSearchParams({ s: source, r: "reddit.com", p: "/fr/defi" }).toString(),
  );
  // Not simulation code: the cookie's end, thirty days from now, give or take the test's own time.
  expect(Math.abs((cookie?.expires ?? 0) - (Date.now() / 1000 + THIRTY_DAYS_S))).toBeLessThan(120);
  await expect.poll(() => visitsOf(today(), source)).toEqual([{ page: "/fr/defi", visits: 1 }]);

  // Back on another page, the same visitor: their arrival stays the first one.
  await page.goto(`/fr?ref=${source}-again`);
  await page.goto("/how-to-play");
  expect((await arrivalCookieOf(visitor))?.value).toBe(cookie?.value);
  await visitor.close();

  // A crawler gets no cookie, and is not counted.
  const crawler = await newVisitor(browser, { userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  const crawled = await crawler.newPage();
  await crawled.goto(`/fr?ref=${source}`);
  expect(await arrivalCookieOf(crawler)).toBeUndefined();
  await crawler.close();

  // Another visitor's first visit is: counted after the crawler's and the first visitor's returns, which were not.
  const other = await newVisitor(browser);
  await (await other.newPage()).goto(`/fr?ref=${source}`);
  await expect.poll(() => visitsOf(today(), source)).toEqual([
    { page: "/fr", visits: 1 },
    { page: "/fr/defi", visits: 1 },
  ]);
  expect(await visitsOf(today(), `${source}-again`)).toEqual([]);
  await other.close();
});

test("gives the career created after a first visit its player's source, page of arrival, language and device", async ({ browser }) => {
  const source = `${RUN}-career`;
  // A phone, in French.
  const player = await browser.newContext({ ...devices["Pixel 7"], locale: "fr-FR" });
  const page = await player.newPage();
  try {
    await page.goto(`/fr?ref=${source}`);
    await fillCreateSaveForm(page, `Arrivée ${RUN}`, LYON);
    await page.getByTestId("create-save").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+$/);

    const userId = await userIdOf(player);
    expect(userId).not.toBeNull();
    expect(await arrivalOfUser(userId ?? "")).toEqual({
      source,
      referrerDomain: null,
      landingPage: "/fr",
      locale: "fr",
      device: "PHONE",
    });
  } finally {
    // The player and their career.
    await deleteUsers([await userIdOf(player)]);
    await player.close();
  }
});
