import { expect, test, type Cookie, type Locator, type Page } from "@playwright/test";
import { demoSaveId, DEMO_USER_ID, deleteUsers, signedUserCookie, USER_COOKIE, userIdOf } from "./db";
import {
  ACTION_ORANGE,
  boxOf,
  createSave,
  expectNoSidewaysScroll,
  expectUncovered,
  fullOrangeActions,
  openScreen,
  saveHeader,
  saveIdOf,
  sidewaysOverflow,
  textOf,
} from "./helpers";

// The screens of the Match entry on a Lyon just created: 1 July 2026, nothing played, its first match on 15 August. A world
// of 198 clubs takes some 20 seconds, so the tests share one, in the order of this file: those that only read it, then the
// one that plays its first match, the one that simulates past the cup's preliminary round, those that read the screens
// with results and a draw on them, and the one that ends the season. Its user goes at the end, and the save with them.
// After a failure, Playwright starts a new worker, which creates its own: a test that needs matches played plays them
// itself.

const LYON = "Olympique Lyonnais";

const COMPUTER = { width: 1280, height: 720 };
const LAPTOP = { width: 1100, height: 800 };
const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 360, height: 780 };

test.use({ viewport: COMPUTER });

/** The leagues' countries, by the code of their tab: each has two divisions. */
const COUNTRIES = ["de", "en", "es", "fr", "it"];

/** A season of France's first division, 18 clubs. */
const FRENCH_CLUBS = 18;
const FRENCH_MATCHDAYS = 2 * (FRENCH_CLUBS - 1);

/** The months of a season with matches: its first on 15 August, its last in May. */
const MATCH_MONTHS = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"];

// The palette, as the browser computes it.
const BRIGHT_BLUE = "rgb(31, 59, 255)"; // the title's and the promotion's rank
const PAGE_BACKGROUND = "rgb(11, 19, 64)"; // a rank outside the zones
const HIGHLIGHTED_LINE = "rgb(42, 54, 120)"; // the managed club's row, and the next match's
const CARD_BACKGROUND = "rgb(22, 32, 90)"; // any other match's row
const SECOND_ACCENT = "rgb(143, 160, 255)"; // the tag of a league
const NO_BACKGROUND = "rgba(0, 0, 0, 0)";

/** A result as the French screens say it. */
const RESULTS = {
  W: { letter: "V", label: "Victoire", points: 3, color: "rgb(74, 222, 128)" },
  D: { letter: "N", label: "Match nul", points: 1, color: "rgb(163, 163, 163)" },
  L: { letter: "D", label: "Défaite", points: 0, color: "rgb(248, 113, 113)" },
};

type Result = keyof typeof RESULTS;

const isResult = (value: string | null): value is Result => value !== null && value in RESULTS;

let saveId = "";
let ownerId: string | null = null;
let ownerCookies: Cookie[] = [];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    // A unique name (not simulation code: the clock is fine here).
    await createSave(page, `E2E match ${Date.now()}`, LYON);
    saveId = saveIdOf(page);
    ownerCookies = (await context.cookies()).filter(({ name }) => name === USER_COOKIE);
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    ownerId = await userIdOf(context);
    await context.close();
  }
});

test.afterAll(async () => {
  await deleteUsers([ownerId]);
});

/**
 * A screen of the shared save, opened by its owner in the test's own browser, once React has committed the page: a click
 * while it hydrates goes nowhere, and the table's page hydrates for long enough to lose one. Next writes its state to the
 * history at that commit, at every width.
 */
async function openSave(page: Page, path = ""): Promise<void> {
  await page.context().addCookies(ownerCookies);
  await page.goto(`/saves/${saveId}${path}`);
  await page.waitForFunction(() => window.history.state?.__NA === true);
}

/** The table shown: one at a time, by country and division. */
const tableOf = (page: Page): Locator => page.locator('[data-testid="standings-table"]:visible');

const managedRowOf = (page: Page): Locator => tableOf(page).locator("tr[data-managed]");

/** The rank's square in rows of a table. */
const ranksOf = (rows: Locator): Locator => rows.locator("td:first-child > span:first-child");

const cellOf = (row: Locator, column: string): Locator => row.locator(`td[data-column="${column}"]`);

/** The rows of the calendar's list. */
const listRowsOf = (page: Page): Locator => page.getByTestId("fixtures-list").getByTestId("fixture-row");

/** What each element says for an attribute, in the page's order. */
const attributesOf = (locator: Locator, name: string): Promise<(string | null)[]> =>
  locator.evaluateAll((elements, attribute) => elements.map((element) => element.getAttribute(attribute)), name);

/** The managed club's league results in the month the list shows, oldest first. */
async function leagueResultsOf(page: Page): Promise<Result[]> {
  const pills = listRowsOf(page).filter({ hasText: "D1 · Journée" }).locator("[data-result]");
  return (await attributesOf(pills, "data-result")).filter(isResult);
}

/** The managed club's league results over some months, read in the list of each. */
async function seasonResultsOf(page: Page, months: readonly string[]): Promise<Result[]> {
  const results: Result[] = [];
  for (const month of months) {
    await openSave(page, `/fixtures?mois=${month}`);
    await expect(listRowsOf(page).first()).toBeVisible();
    results.push(...(await leagueResultsOf(page)));
  }
  return results;
}

/** Lyon's row and the summary above it say what its results say. */
async function expectTableToSay(page: Page, results: readonly Result[]): Promise<void> {
  const managed = managedRowOf(page);
  const points = results.reduce((sum, result) => sum + RESULTS[result].points, 0);
  await expect(cellOf(managed, "played")).toHaveText(`${results.length}`);
  await expect(cellOf(managed, "points")).toHaveText(`${points}`);

  // Its last five, oldest first: a letter each, in the colour of its result.
  const recent = results.slice(-5);
  const letters = cellOf(managed, "form").locator("span[title]");
  await expect(letters).toHaveText(recent.map((result) => RESULTS[result].letter));
  for (const [index, result] of recent.entries()) {
    await expect(letters.nth(index)).toHaveAttribute("title", RESULTS[result].label);
    await expect(letters.nth(index)).toHaveCSS("color", RESULTS[result].color);
  }

  const rank = Number(await textOf(ranksOf(managed)));
  const place = rank === 1 ? "1er" : `${rank}e`;
  await expect(page.getByTestId("standings-summary")).toHaveText(
    `Journée ${results.length} sur ${FRENCH_MATCHDAYS} · ${place} · ${points} ${points > 1 ? "pts" : "pt"}`,
  );
}

/** Every table of the save, by its tabs, its country's and its division's. */
async function forEachTable(page: Page, check: (table: string) => Promise<void>): Promise<void> {
  for (const country of COUNTRIES) {
    await page.getByTestId(`standings-country-${country}`).click();
    for (const tier of [1, 2]) {
      const division = page.getByTestId(`standings-division-${tier}`);
      await division.click();
      await expect(division).toHaveAttribute("aria-selected", "true");
      await check(`${country}.${tier}`);
    }
  }
}

/** Every screen of the entry, the calendar in both its views, every table in both its forms: never wider than the window. */
async function expectMatchScreensWithinWidth(page: Page): Promise<void> {
  // The first matches, and the month of the cup's tie once it is drawn.
  for (const month of ["2026-08", "2026-12"]) {
    await openSave(page, `/fixtures?mois=${month}`);
    await expect(listRowsOf(page).first()).toBeVisible();
    await expectNoSidewaysScroll(page, `list of ${month}`);
    await page.getByTestId("fixtures-view-calendar").click();
    await expect(page.getByTestId("fixtures-calendar")).toBeVisible();
    await expectNoSidewaysScroll(page, `grid of ${month}`);
  }

  await openScreen(page, "cup");
  await expect(page.getByTestId("cup-card")).toBeVisible();
  await expectNoSidewaysScroll(page, "cup");
  // Six rounds side by side: each name holds in its part.
  for (const round of await page.getByTestId("cup-progress").locator("li").all()) {
    expect(await sidewaysOverflow(round)).toBeLessThanOrEqual(0);
  }

  await openScreen(page, "standings");
  await expect(page.getByTestId("standings-title")).toBeVisible();
  const frame = tableOf(page).locator("xpath=..");
  await forEachTable(page, async (table) => {
    expect(await sidewaysOverflow(frame), `compact ${table}`).toBeLessThanOrEqual(0);
    await expectNoSidewaysScroll(page, `compact ${table}`);
  });
  await page.getByTestId("standings-full-toggle").click();
  await expect(cellOf(tableOf(page).locator("tbody tr").first(), "won")).toBeVisible();
  await forEachTable(page, async (table) => {
    expect(await sidewaysOverflow(frame), `full ${table}`).toBeGreaterThan(0);
    await expectNoSidewaysScroll(page, `full ${table}`);
  });
}

test("leads to the table on a computer, the calendar and the cup in two fifths of the page at its right", async ({ page }) => {
  await openSave(page);
  await expect(page.getByTestId("dashboard-title")).toBeVisible();

  // Its address read first: the server answers for a phone, and the entry changes once the page has hydrated.
  const entry = page.getByTestId("nav-match");
  await expect(entry).toHaveAttribute("href", `/saves/${saveId}/standings`);
  await entry.click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/standings$`));
  await expect(page.getByTestId("standings-title")).toHaveText("Classement");
  await expect(page.getByTestId("section-tabs").getByRole("link")).toHaveText(["Calendrier", "Classement", "Coupe", "Europe", "Sélections"]);
  await expect(page.getByTestId("nav-standings")).toHaveAttribute("aria-current", "page");

  // The page asks for them once it knows its width.
  await expect(page.getByTestId("cup-card")).toBeVisible();
  const title = await boxOf(page.getByTestId("standings-title"));
  const table = await boxOf(tableOf(page));
  const calendar = await boxOf(page.getByTestId("match-calendar-card"));
  const cup = await boxOf(page.getByTestId("cup-card"));

  // At the right of the table and level with it, the calendar above the cup, in one column.
  expect(calendar.x).toBeGreaterThan(table.x + table.width);
  expect(calendar.y).toBeLessThan(table.y + table.height);
  expect(cup.x).toBeCloseTo(calendar.x, 0);
  expect(cup.width).toBeCloseTo(calendar.width, 0);
  expect(cup.y).toBeGreaterThan(calendar.y + calendar.height);

  // From the title's left edge to the cards' right edge, three fifths for the table and two for the cards.
  const width = calendar.x + calendar.width - title.x;
  expect((calendar.x - title.x) / width).toBeCloseTo(3 / 5, 1);
  expect(calendar.width / width).toBeCloseTo(2 / 5, 1);

  // A new save's first six matches, the next one first.
  const rows = page.getByTestId("match-calendar-card").getByTestId("fixture-row");
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toHaveAttribute("data-next", "true");
  await expect(page.getByTestId("match-calendar-card").locator("[data-next]")).toHaveCount(1);
});

test("gives the full table the cards' room, at the same address, on the country and the division chosen", async ({ page }) => {
  await openSave(page, "/standings");
  const table = tableOf(page);
  const toggle = page.getByTestId("standings-full-toggle");
  const calendar = page.getByTestId("match-calendar-card");
  const cup = page.getByTestId("cup-card");
  const headers = table.locator("thead th:visible");
  const won = cellOf(table.locator("tbody tr").first(), "won");
  const country = page.getByTestId("standings-country-de");
  const division = page.getByTestId("standings-division-2");

  /** Germany's second division is still the one shown: Lyon's is France's first. */
  const expectChosenTable = async (): Promise<void> => {
    await expect(country).toHaveAttribute("aria-selected", "true");
    await expect(division).toHaveAttribute("aria-selected", "true");
    await expect(table.locator("tr[data-zone]")).toHaveCount(2);
    await expect(table.locator("tr[data-managed]")).toHaveCount(0);
  };

  await country.click();
  await division.click();
  await expectChosenTable();
  const address = page.url();
  await expect(headers).toHaveText(["#", "Club", "J", "Diff", "Forme", "Pts"]);
  await expect(won).toBeHidden();
  await expect(toggle).toHaveText("Classement complet");

  await expect(calendar).toBeVisible();
  const title = await boxOf(page.getByTestId("standings-title"));
  const compact = await boxOf(table);
  const cards = await boxOf(calendar);

  await toggle.click();
  await expect(won).toBeVisible();
  await expect(headers).toHaveText(["#", "Club", "J", "G", "N", "P", "BP", "BC", "Diff", "Forme", "Pts"]);
  await expect(calendar).toBeHidden();
  await expect(cup).toBeHidden();
  await expect(toggle).toHaveText("Classement réduit");
  await expectChosenTable();
  expect(page.url()).toBe(address);

  // To where the cards ended, but for its card's padding, the same on both sides, and no need to scroll here.
  const padding = compact.x - title.x;
  const full = await boxOf(table);
  expect(full.x).toBeCloseTo(compact.x, 0);
  expect(full.x + full.width + padding).toBeCloseTo(cards.x + cards.width, 0);
  expect(await sidewaysOverflow(table.locator("xpath=.."))).toBeLessThanOrEqual(0);

  await toggle.click();
  await expect(won).toBeHidden();
  await expect(headers).toHaveText(["#", "Club", "J", "Diff", "Forme", "Pts"]);
  await expect(calendar).toBeVisible();
  await expect(cup).toBeVisible();
  await expect(toggle).toHaveText("Classement complet");
  await expectChosenTable();
  expect(page.url()).toBe(address);
  expect((await boxOf(table)).width).toBeCloseTo(compact.width, 0);
});

test("gives the title and the places going down or up the colour of their rank, and says so in its legend", async ({ page }) => {
  await openSave(page, "/standings");
  const table = tableOf(page);
  const rows = table.locator("tbody tr");
  const legend = page.getByTestId("standings-legend");
  const zone = (name: string): Locator => table.locator(`tr[data-zone="${name}"]`);

  // Lyon's table: France's first division, ranks in order, two places going down.
  await expect(page.getByTestId("standings-country-fr")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("standings-division-1")).toHaveAttribute("aria-selected", "true");
  await expect(rows).toHaveCount(FRENCH_CLUBS);
  await expect(ranksOf(rows)).toHaveText(Array.from({ length: FRENCH_CLUBS }, (_, index) => `${index + 1}`));
  await expect(ranksOf(zone("title"))).toHaveText(["1"]);
  await expect(ranksOf(zone("title"))).toHaveCSS("background-color", BRIGHT_BLUE);
  await expect(zone("title").locator("td").first()).toContainText("place de champion");
  await expect(ranksOf(zone("relegation"))).toHaveText(["17", "18"]);
  await expect(ranksOf(zone("relegation")).first()).toHaveCSS("background-color", ACTION_ORANGE);
  await expect(ranksOf(zone("relegation")).last()).toHaveCSS("background-color", ACTION_ORANGE);
  await expect(zone("relegation").first().locator("td").first()).toContainText("place de descente");
  await expect(zone("promotion")).toHaveCount(0);

  // The others on the page's own background.
  await expect(table.locator("tbody tr:not([data-zone])")).toHaveCount(FRENCH_CLUBS - 3);
  await expect(ranksOf(rows.nth(1))).toHaveCSS("background-color", PAGE_BACKGROUND);

  // Its legend: a square of each colour.
  await expect(legend.locator("> span")).toHaveText(["Champion", "Descente en Division 2"]);
  await expect(legend.locator("[aria-hidden]").first()).toHaveCSS("background-color", BRIGHT_BLUE);
  await expect(legend.locator("[aria-hidden]").last()).toHaveCSS("background-color", ACTION_ORANGE);

  // The managed club's row: one, highlighted, said to a screen reader, the others plain.
  const managed = managedRowOf(page);
  await expect(managed).toHaveCount(1);
  await expect(managed).toContainText(LYON);
  await expect(managed).toContainText("(ton club)");
  await expect(managed).toHaveCSS("background-color", HIGHLIGHTED_LINE);
  await expect(table.locator("tbody tr:not([data-managed])").first()).toHaveCSS("background-color", NO_BACKGROUND);

  // The second division: two places going up, in blue, and nothing going down from it.
  await page.getByTestId("standings-division-2").click();
  await expect(ranksOf(zone("promotion"))).toHaveText(["1", "2"]);
  await expect(ranksOf(zone("promotion")).first()).toHaveCSS("background-color", BRIGHT_BLUE);
  await expect(ranksOf(zone("promotion")).last()).toHaveCSS("background-color", BRIGHT_BLUE);
  await expect(zone("promotion").first().locator("td").first()).toContainText("place de montée");
  await expect(zone("relegation")).toHaveCount(0);
  await expect(zone("title")).toHaveCount(0);
  await expect(legend.locator("> span")).toHaveText(["Montée en Division 1"]);
  await expect(legend.locator("[aria-hidden]")).toHaveCSS("background-color", BRIGHT_BLUE);
  await expect(table.locator("tr[data-managed]")).toHaveCount(0);

  // England: 20 and 24 clubs, three places each way.
  await page.getByTestId("standings-country-en").click();
  await expect(rows).toHaveCount(20);
  await expect(ranksOf(zone("relegation"))).toHaveText(["18", "19", "20"]);
  await page.getByTestId("standings-division-2").click();
  await expect(rows).toHaveCount(24);
  await expect(ranksOf(zone("promotion"))).toHaveText(["1", "2", "3"]);
});

test("opens the calendar on a list of the next match's month, that match alone set apart", async ({ page }) => {
  await openSave(page, "/standings");
  await page.getByTestId("match-calendar-all").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/fixtures$`));

  // A new save is on 1 July: the list goes on to August, its first match.
  await expect(page.getByTestId("fixtures-month")).toHaveText("août 2026");
  await expect(page.getByTestId("fixtures-view-list")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("fixtures-calendar")).toHaveCount(0);

  const rows = listRowsOf(page);
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId("fixtures-list").locator("[data-next]")).toHaveCount(1);
  const next = rows.first();
  await expect(next).toHaveAttribute("data-next", "true");
  await expect(next).toContainText(/^sam15/);
  await expect(next).toContainText("D1 · Journée 1");
  await expect(next).toContainText("Suivant");
  await expect(next.getByTestId("upcoming-match-trigger")).toHaveCSS("background-color", HIGHLIGHTED_LINE);

  const after = rows.nth(1);
  await expect(after).toContainText(/^sam22/);
  await expect(after).toContainText("D1 · Journée 2");
  await expect(after).not.toContainText("Suivant");
  await expect(after.getByTestId("upcoming-match-trigger")).toHaveCSS("background-color", CARD_BACKGROUND);

  // The tag of the league, in the second accent; the month's landmark under the list.
  await expect(next.getByText("D1", { exact: true })).toHaveCSS("color", SECOND_ACCENT);
  await expect(page.getByTestId("fixtures-landmarks")).toContainText("Fermeture du mercato");
});

test("says when a month has no match, and goes through the season's months with its arrows, in the list", async ({ page }) => {
  await openSave(page, "/fixtures");
  const month = page.getByTestId("fixtures-month");
  const list = page.getByTestId("fixtures-list");
  const landmarks = page.getByTestId("fixtures-landmarks");
  const previous = page.getByTestId("fixtures-previous-month");
  const next = page.getByTestId("fixtures-next-month");
  await expect(month).toHaveText("août 2026");

  // July, the season's first month: the window opens, no match, and no month before it.
  await previous.click();
  await expect(page).toHaveURL(/\/fixtures\?mois=2026-07$/);
  await expect(month).toHaveText("juillet 2026");
  await expect(list).toHaveText("Aucun match ce mois-ci.");
  await expect(list.getByTestId("fixture-row")).toHaveCount(0);
  await expect(landmarks).toContainText("Ouverture du mercato");
  await expect(previous).toHaveCount(0);

  // On to September: its matches, in the list still, without the next one, in August.
  await next.click();
  await expect(month).toHaveText("août 2026");
  await next.click();
  await expect(page).toHaveURL(/\/fixtures\?mois=2026-09$/);
  await expect(month).toHaveText("septembre 2026");
  await expect(listRowsOf(page).first()).toBeVisible();
  await expect(list.locator("[data-next]")).toHaveCount(0);
  await expect(page.getByTestId("fixtures-calendar")).toHaveCount(0);

  // June, the last one: the season ends, no match, and no month after it.
  await page.goto(`/saves/${saveId}/fixtures?mois=2027-06`);
  await expect(month).toHaveText("juin 2027");
  await expect(list).toHaveText("Aucun match ce mois-ci.");
  await expect(landmarks).toContainText("Fin de saison");
  await expect(next).toHaveCount(0);
});

test("opens the opponent from anywhere on a row to come", async ({ page }) => {
  await openSave(page, "/fixtures");
  const row = listRowsOf(page).first();
  const trigger = row.getByTestId("upcoming-match-trigger");
  const sheet = page.getByTestId("upcoming-match-sheet");

  // One button, as wide as its row: the whole row is its name, and its far end opens the panel.
  await expect(trigger).toHaveAccessibleName(/D1 · Journée 1.*Suivant$/);
  const box = await boxOf(trigger);
  expect(box.width).toBeCloseTo((await boxOf(row)).width, 0);
  await trigger.click({ position: { x: box.width - 4, y: box.height / 2 } });

  // The sidebar's card names the same club.
  const title = sheet.getByTestId("opponent-title");
  await expect(title).not.toBeEmpty();
  const opponent = await textOf(title);
  expect(opponent).not.toBe(LYON);
  await expect(row).toContainText(opponent);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(saveHeader(page)).toContainText(`vs ${opponent}`);
});

test("switches to the grid and back, each view on its own month until the player chooses one", async ({ page }) => {
  await openSave(page, "/fixtures");
  const month = page.getByTestId("fixtures-month");
  const toGrid = page.getByTestId("fixtures-view-calendar");
  const toList = page.getByTestId("fixtures-view-list");
  const grid = page.getByTestId("fixtures-calendar");
  await expect(listRowsOf(page)).toHaveCount(3);

  // The grid opens on the save's date, the list on the next match.
  await toGrid.click();
  await expect(page).toHaveURL(/\/fixtures\?vue=grille$/);
  await expect(grid).toBeVisible();
  await expect(page.getByTestId("fixtures-list")).toHaveCount(0);
  await expect(toGrid).toHaveAttribute("aria-current", "page");
  await expect(month).toHaveText("juillet 2026");
  await expect(page.locator('[role="gridcell"][aria-current="date"]')).toHaveAttribute("data-day", "2026-07-01");

  await toList.click();
  await expect(page).toHaveURL(/\/fixtures$/);
  await expect(grid).toHaveCount(0);
  await expect(toList).toHaveAttribute("aria-current", "page");
  await expect(month).toHaveText("août 2026");

  // A month the player went to stays from one view to the other, and the arrows keep the view.
  await page.getByTestId("fixtures-next-month").click();
  await expect(page).toHaveURL(/\/fixtures\?mois=2026-09$/);
  await toGrid.click();
  await expect(page).toHaveURL(/\/fixtures\?vue=grille&mois=2026-09$/);
  await expect(month).toHaveText("septembre 2026");
  await page.getByTestId("fixtures-previous-month").click();
  await expect(page).toHaveURL(/\/fixtures\?vue=grille&mois=2026-08$/);
  await expect(month).toHaveText("août 2026");

  // The same three matches in August's grid.
  const days = page.locator('[role="gridcell"]:has([data-testid="upcoming-match-trigger"])');
  await expect(days).toHaveCount(3);
  expect(await attributesOf(days, "data-day")).toEqual(["2026-08-15", "2026-08-22", "2026-08-29"]);

  await toList.click();
  await expect(page).toHaveURL(/\/fixtures\?mois=2026-08$/);
  await expect(listRowsOf(page)).toHaveCount(3);
});

test("opens the grid to pick a day, from the list and from the table, and gives up without a trace", async ({ page }) => {
  await openSave(page, "/fixtures");
  const banner = page.getByTestId("fixtures-pick-banner");
  const days = page.getByTestId("calendar-day-pick");
  await expect(listRowsOf(page)).toHaveCount(3);

  const pickDate = async (): Promise<void> => {
    await page.getByTestId("simulate-menu").click();
    await page.getByTestId("simulate-pick-date").click();
    await expect(page).toHaveURL(/\/fixtures\?vue=grille$/);
    await expect(banner).toBeVisible();
    await expect(page.getByTestId("fixtures-calendar")).toBeVisible();
    await expect(page.getByTestId("fixtures-month")).toHaveText("juillet 2026");
    // Every day of July after the save's date.
    await expect(days).toHaveCount(30);
  };

  await pickDate();
  await page.getByTestId("fixtures-pick-cancel").click();
  await expect(banner).toHaveCount(0);
  await expect(days).toHaveCount(0);

  // From another screen too; Escape gives up as well.
  await openScreen(page, "standings");
  await expect(page.getByTestId("standings-title")).toBeVisible();
  await pickDate();
  await page.keyboard.press("Escape");
  await expect(banner).toHaveCount(0);
  await expect(days).toHaveCount(0);
});

test("sums the club's cup up at the head of its page, from the table's card", async ({ page }) => {
  await openSave(page, "/standings");
  const card = page.getByTestId("cup-card");
  await expect(card.getByTestId("cup-status")).toHaveText("ENCORE EN LICE");
  await expect(card.getByTestId("cup-prize")).toHaveCount(0);

  await card.getByTestId("cup-card-link").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/cup$`));
  await expect(page.getByTestId("cup-title")).toBeVisible();
  await expect(page.getByTestId("nav-cup")).toHaveAttribute("aria-current", "page");
  await expect(card.getByRole("heading")).toHaveText("France — Coupe");
  await expect(card.getByTestId("cup-card-link")).toHaveCount(0);
  await expect(card.getByTestId("cup-status")).toHaveText("ENCORE EN LICE");

  // Lyon is exempt from the preliminary round: the round of 32 is its next, five rounds ahead of it.
  const rounds = card.getByTestId("cup-progress").locator("li");
  await expect(rounds).toHaveCount(6);
  await expect(card.locator('li[data-state="current"]')).toHaveCount(1);
  expect(await attributesOf(rounds, "data-state")).toEqual(["exempt", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  await expect(card.locator('li[data-state="current"]')).toContainText("16es");

  // The round to come, on the date of its panel, its draw to come.
  const next = card.getByTestId("cup-next-round");
  await expect(next).toContainText("16es");
  await expect(next).toContainText(await textOf(page.getByTestId("cup-round-2").locator("p").first()));
  await expect(next).toContainText("Tirage à venir");
  await expect(next).not.toContainText("Tirage fait");
  await expect(card.getByTestId("cup-prize")).toHaveText("Prime en jeu : 5 M€ au vainqueur");

  // Under the card, its run and the rounds, as before.
  await expect(page.getByTestId("cup-run")).toContainText("Exempté du tour préliminaire");
  await expect(page.locator("[data-cup-round]")).toHaveCount(6);
});

test("has one full orange action on each screen of the entry, the sidebar's", async ({ page }) => {
  await openSave(page, "/standings");
  await expect(page.getByTestId("standings-title")).toBeVisible();
  expect(await fullOrangeActions(page)).toEqual(["next-match"]);

  await openScreen(page, "fixtures");
  await expect(page.getByTestId("fixtures-list")).toBeVisible();
  expect(await fullOrangeActions(page)).toEqual(["next-match"]);

  await page.getByTestId("fixtures-view-calendar").click();
  await expect(page.getByTestId("fixtures-calendar")).toBeVisible();
  expect(await fullOrangeActions(page)).toEqual(["next-match"]);

  await openScreen(page, "cup");
  await expect(page.getByTestId("cup-title")).toBeVisible();
  expect(await fullOrangeActions(page)).toEqual(["next-match"]);
});

test.describe("between 1024 and 1280 px", () => {
  test.use({ viewport: LAPTOP });

  test("stays on the table, the two cards side by side under it, and goes back to the calendar under 1024 px", async ({ page }) => {
    await openSave(page, "/standings");
    const entry = page.getByTestId("nav-match");
    await expect(entry).toHaveAttribute("href", `/saves/${saveId}/standings`);
    await expect(page.getByTestId("cup-card")).toBeVisible();

    const table = await boxOf(tableOf(page));
    const calendar = await boxOf(page.getByTestId("match-calendar-card"));
    const cup = await boxOf(page.getByTestId("cup-card"));
    expect(calendar.y).toBeGreaterThan(table.y + table.height);
    expect(cup.y).toBeCloseTo(calendar.y, 0);
    expect(cup.x).toBeGreaterThan(calendar.x + calendar.width);
    expect(cup.width).toBeCloseTo(calendar.width, 0);
    await expectNoSidewaysScroll(page, "table and its cards");

    // The full table takes their place here too.
    await page.getByTestId("standings-full-toggle").click();
    await expect(page.getByTestId("match-calendar-card")).toBeHidden();
    await expect(page.getByTestId("cup-card")).toBeHidden();
    await page.getByTestId("standings-full-toggle").click();
    await expect(page.getByTestId("match-calendar-card")).toBeVisible();

    // The entry and the cards follow the width, without a reload.
    await page.setViewportSize({ width: 1023, height: 800 });
    await expect(entry).toHaveAttribute("href", `/saves/${saveId}/fixtures`);
    await expect(page.getByTestId("match-calendar-card")).toBeHidden();
    await expect(page.getByTestId("cup-card")).toBeHidden();
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(entry).toHaveAttribute("href", `/saves/${saveId}/standings`);
    await expect(page.getByTestId("match-calendar-card")).toBeVisible();
  });
});

test.describe("on a phone, in English", () => {
  test.use({ locale: "en-GB", viewport: PHONE });

  test("opens on the calendar, the game's action at its head, every control a thumb high", async ({ page }) => {
    await openSave(page);
    const entry = page.getByTestId("nav-match");
    await expect(entry).toHaveAttribute("href", `/saves/${saveId}/fixtures`);
    await entry.click();
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/fixtures$`));
    await expect(page.getByTestId("fixtures-title")).toHaveText("Fixtures");
    await expect(page.getByTestId("fixtures-month")).toHaveText("August 2026");
    await expect(page.getByTestId("section-tabs").getByRole("link")).toHaveText(["Fixtures", "Table", "Cup", "Europe", "Internationals"]);

    // Above the tabs, in view, nothing over it, and the only orange of the screen.
    const action = page.getByTestId("next-match");
    await expect(action).toHaveText("Next match");
    await expect(action).toBeInViewport({ ratio: 1 });
    await expectUncovered(action);
    const button = await boxOf(action);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.y + button.height).toBeLessThanOrEqual((await boxOf(page.getByTestId("section-tabs"))).y);
    expect(await fullOrangeActions(page)).toEqual(["next-match"]);

    const rows = listRowsOf(page);
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText(/^Sat15/);
    await expect(rows.first()).toContainText("D1 · Matchday 1");
    await expect(rows.first()).toContainText("Next");
    for (const row of await rows.all()) {
      expect((await boxOf(row)).height).toBeGreaterThanOrEqual(44);
    }
    for (const control of ["fixtures-previous-month", "fixtures-next-month", "fixtures-view-list", "fixtures-view-calendar"]) {
      expect((await boxOf(page.getByTestId(control))).height, control).toBeGreaterThanOrEqual(44);
    }

    // A row opens the opponent over the whole screen.
    await rows.first().getByTestId("upcoming-match-trigger").click();
    const sheet = page.getByTestId("upcoming-match-sheet");
    await expect(sheet.getByTestId("opponent-title")).not.toBeEmpty();
    expect((await boxOf(sheet)).width).toBeCloseTo(PHONE.width, 0);
    await expectNoSidewaysScroll(page, "opponent's panel");
  });

  test("leaves the cards to their tabs, holds the compact table in its frame, and scrolls the full one there, not the page", async ({ page }) => {
    // Not hidden but never read: the page asks the server for nothing.
    const asked: string[] = [];
    page.on("request", (request) => {
      if (request.headers()["next-action"] !== undefined) {
        asked.push(request.url());
      }
    });
    await openSave(page, "/standings");
    await expect(page.getByTestId("standings-title")).toHaveText("Table");
    await expect(page.getByTestId("match-calendar-card")).toHaveCount(0);
    await expect(page.getByTestId("cup-card")).toHaveCount(0);
    expect(asked).toEqual([]);
    expect(await fullOrangeActions(page)).toEqual(["next-match"]);

    const table = tableOf(page);
    const frame = table.locator("xpath=..");
    const first = table.locator("tbody tr").first();
    await expect(table.locator("thead th:visible")).toHaveText(["#", "Club", "P", "GD", "Form", "Pts"]);
    await expect(cellOf(first, "form")).toBeVisible();
    expect(await sidewaysOverflow(frame)).toBeLessThanOrEqual(0);
    await expectNoSidewaysScroll(page, "compact table");

    const toggle = page.getByTestId("standings-full-toggle");
    for (const control of ["standings-country-fr", "standings-division-1", "standings-division-2", "standings-full-toggle"]) {
      expect((await boxOf(page.getByTestId(control))).height, control).toBeGreaterThanOrEqual(44);
    }
    await toggle.click();
    await expect(toggle).toHaveText("Compact table");
    await expect(cellOf(first, "won")).toBeVisible();
    await expect(table.locator("thead th:visible")).toHaveText(["#", "Club", "P", "W", "D", "L", "GF", "GA", "GD", "Form", "Pts"]);
    expect(await sidewaysOverflow(frame)).toBeGreaterThan(0);
    await expectNoSidewaysScroll(page, "full table");

    // Scrolled to its end: the rank and the club stay at the frame's left, the points at its right, and the page where it was.
    await frame.evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
    await expect.poll(() => frame.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const { x, width } = await boxOf(frame);
    const rank = await boxOf(first.locator("td").first());
    const club = await boxOf(first.locator("td").nth(1));
    const points = await boxOf(cellOf(first, "points"));
    expect(rank.x).toBeCloseTo(x, 0);
    expect(club.x).toBeCloseTo(rank.x + rank.width, 0);
    expect(points.x + points.width).toBeCloseTo(x + width, 0);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    await expectNoSidewaysScroll(page, "full table, scrolled");
  });

  test("says the cup in English, and has one orange action there", async ({ page }) => {
    await openSave(page, "/cup");
    const card = page.getByTestId("cup-card");
    await expect(page.getByTestId("cup-title")).toHaveText("Cup");
    await expect(card.getByRole("heading")).toHaveText("France — Cup");
    await expect(card.getByTestId("cup-status")).toHaveText("STILL IN");
    await expect(card.getByTestId("cup-progress").locator('li[data-state="current"]')).toContainText("R32");
    await expect(card.getByTestId("cup-next-round")).toContainText("Round of 32");
    await expect(card.getByTestId("cup-next-round")).toContainText("Draw to come");
    await expect(card.getByTestId("cup-prize")).toHaveText("Prize at stake: €5m for the winners");
    expect(await fullOrangeActions(page)).toEqual(["next-match"]);
  });
});

for (const viewport of [PHONE, SMALL_PHONE]) {
  test.describe(`a new save, ${viewport.width} px wide, in English`, () => {
    test.use({ locale: "en-GB", viewport });

    test("never scrolls sideways on the entry's screens", async ({ page }) => {
      await expectMatchScreensWithinWidth(page);
    });
  });
}

test("has no zones, no legend and no cup card in a save of one division a country", async ({ page, context, baseURL }) => {
  const demo = await demoSaveId();
  // The demo user's cookie, as the server signs it: the save opens for its owner only.
  await context.addCookies([{ name: USER_COOKIE, value: signedUserCookie(DEMO_USER_ID), url: baseURL ?? "" }]);
  await page.goto(`/saves/${demo}/standings`);
  await expect(tableOf(page).locator("tbody tr").first()).toBeVisible();
  await expect(tableOf(page).locator("tr[data-zone]")).toHaveCount(0);
  await expect(page.getByTestId("standings-legend")).toHaveCount(0);
  await expect(page.getByTestId("match-calendar-card")).toBeVisible();
  await expect(page.getByTestId("cup-card")).toHaveCount(0);
  await expect(page.getByTestId("nav-cup")).toHaveCount(0);
});

test("after the club's first match, the calendar, the table, its form and its summary all say the same", async ({ page }) => {
  // A matchday played, then its match live, to the break and on to the final whistle.
  test.setTimeout(240_000);

  // Before it: no summary, no form.
  await openSave(page, "/standings");
  await expect(managedRowOf(page)).toContainText(LYON);
  await expect(page.getByTestId("standings-summary")).toHaveCount(0);
  await expect(cellOf(managedRowOf(page), "form")).toContainText("—");
  await expect(cellOf(managedRowOf(page), "form")).toContainText("Aucun match joué");

  await openSave(page);
  await page.getByTestId("dashboard-next-match").getByTestId("next-match").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live\\?rejouer=1$`), { timeout: 120_000 });
  await page.getByTestId("live-skip").click();
  await page.getByTestId("break-resume").click();
  await page.getByTestId("live-skip").click();
  await page.getByTestId("live-continue").click();
  await expect(page.getByTestId("dashboard-last-result")).toBeVisible();

  // The list: the match played first, then the next one, alone set apart.
  await openScreen(page, "fixtures");
  await expect(page.getByTestId("fixtures-month")).toHaveText("août 2026");
  const rows = listRowsOf(page);
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toHaveAttribute("data-next", "true");
  await expect(page.getByTestId("fixtures-list").locator("[data-next]")).toHaveCount(1);
  const played = rows.first();
  const pill = played.locator("[data-result]");
  const [result] = await leagueResultsOf(page);
  expect(result).toBeDefined();
  await expect(pill).toHaveAttribute("title", RESULTS[result].label);

  // Its score home first, as everywhere, whichever side the club was on.
  const [, home, away] = /(\d+) – (\d+)$/.exec(await textOf(pill)) ?? [];
  const [scored, conceded] = (await textOf(played)).includes("Dom.") ? [home, away] : [away, home];

  // The same match in its sheet.
  await played.getByTestId("match-sheet-trigger").click();
  const sheet = page.getByTestId("match-sheet");
  await expect(sheet).toContainText(`${home} – ${away}`);
  await expect(sheet).toContainText("France — Division 1 · Journée 1 · 15 août 2026");
  await expect(sheet.locator('[data-match-sheet="half-time"]')).toHaveText(/^Mi-temps : \d+ – \d+$/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // The table says the same, its card too, with every club's first result.
  await openScreen(page, "standings");
  await expectTableToSay(page, [result]);
  await expect(tableOf(page).locator('td[data-column="form"] span[title]')).toHaveCount(FRENCH_CLUBS);
  const inCard = page.getByTestId("match-calendar-card").locator("[data-result]");
  await expect(inCard).toHaveCount(1);
  await expect(inCard).toHaveAttribute("data-result", result);

  // In the full table, the record behind them.
  await page.getByTestId("standings-full-toggle").click();
  const managed = managedRowOf(page);
  await expect(cellOf(managed, "won")).toHaveText(result === "W" ? "1" : "0");
  await expect(cellOf(managed, "drawn")).toHaveText(result === "D" ? "1" : "0");
  await expect(cellOf(managed, "lost")).toHaveText(result === "L" ? "1" : "0");
  await expect(cellOf(managed, "goalsFor")).toHaveText(scored);
  await expect(cellOf(managed, "goalsAgainst")).toHaveText(conceded);
  const difference = Number(scored) - Number(conceded);
  await expect(cellOf(managed, "goalDifference")).toHaveText(difference > 0 ? `+${difference}` : `${difference}`);
});

test("draws the club's tie once the preliminary round is played: the cup names it, the calendar tags it, the form follows", async ({ page }) => {
  // Six weeks of every competition.
  test.setTimeout(300_000);

  // With the grid already open, picking stays on its month.
  await openSave(page, "/fixtures?vue=grille&mois=2026-09");
  await page.getByTestId("simulate-menu").click();
  await page.getByTestId("simulate-pick-date").click();
  await expect(page.getByTestId("fixtures-pick-banner")).toBeVisible();
  await expect(page).toHaveURL(/\/fixtures\?vue=grille&mois=2026-09$/);
  await expect(page.getByTestId("fixtures-month")).toHaveText("septembre 2026");
  await page.locator('[data-day="2026-09-30"]').getByTestId("calendar-day-pick").click();
  await page.getByTestId("simulation-dialog").getByTestId("simulation-continue").click({ timeout: 240_000 });
  await expect(page.getByTestId("dashboard-title")).toBeVisible();

  // The dashboard's report opens on the month of the last match, not on the next one's, in October.
  await page.getByTestId("dashboard-match-report").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/fixtures\\?mois=2026-09$`));
  await expect(page.getByTestId("fixtures-month")).toHaveText("septembre 2026");
  await expect(listRowsOf(page).last().locator("[data-result]")).toBeVisible();
  await expect(page.getByTestId("fixtures-list").locator("[data-next]")).toHaveCount(0);

  // The cup: the same six rounds, the second drawn. Lyon's tie, in its panel, is the one the card names.
  await openScreen(page, "cup");
  const card = page.getByTestId("cup-card");
  await expect(card.getByTestId("cup-status")).toHaveText("ENCORE EN LICE");
  const rounds = card.getByTestId("cup-progress").locator("li");
  await expect(rounds).toHaveCount(6);
  expect(await attributesOf(rounds, "data-state")).toEqual(["exempt", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  await expect(page.getByTestId("cup-round-1").locator("[data-cup-tie]")).toHaveCount(4);
  await expect(page.getByTestId("cup-round-2").locator("[data-cup-tie]")).toHaveCount(16);
  const tie = page.getByTestId("cup-round-2").locator("[data-cup-tie][data-managed]");
  await expect(tie).toContainText(LYON);
  const [home, , away] = await tie.locator("> span").allTextContents();
  const atHome = home === LYON;
  const opponent = atHome ? away : home;
  const next = card.getByTestId("cup-next-round");
  await expect(next).toContainText(`vs ${opponent} · ${atHome ? "domicile" : "extérieur"}`);
  await expect(next).toContainText("Tirage fait");
  await expect(next).toContainText(await textOf(page.getByTestId("cup-round-2").locator("p").first()));
  await expect(page.getByTestId("cup-run")).toContainText("Exempté du tour préliminaire · En lice : 16es de finale");
  expect(await fullOrangeActions(page)).toEqual(["next-match"]);

  // The list opens on the next match, in October; December has the tie among the league's matches, each with its tag
  // (the round of 32 on 2 December, the November break taking the week it had).
  await openScreen(page, "fixtures");
  const month = page.getByTestId("fixtures-month");
  await expect(month).toHaveText("octobre 2026");
  await expect(page.getByTestId("fixtures-list").locator("[data-next]")).toHaveCount(1);
  await page.getByTestId("fixtures-next-month").click();
  await expect(month).toHaveText("novembre 2026");
  await page.getByTestId("fixtures-next-month").click();
  await expect(month).toHaveText("décembre 2026");
  const rows = listRowsOf(page);
  const cupRow = rows.filter({ hasText: "Coupe — 16es" });
  await expect(cupRow).toHaveCount(1);
  await expect(cupRow).toContainText(/^mer2\D/);
  await expect(cupRow).toContainText(opponent);
  await expect(cupRow).toContainText(atHome ? "Dom." : "Ext.");
  const cupTag = cupRow.getByText("Coupe", { exact: true });
  await expect(cupTag).toHaveCSS("text-transform", "uppercase");
  await expect(cupTag).toHaveCSS("color", ACTION_ORANGE);
  const leagueRow = rows.filter({ hasText: "D1 · Journée" }).first();
  await expect(leagueRow.getByText("D1", { exact: true })).toHaveCSS("color", SECOND_ACCENT);
  // The rest: the league's matches, and the Pennant Cup's, Lyon's European competition, when it plays it that month.
  const europeRows = await rows.filter({ has: page.locator('[data-europe="eu.2"]') }).count();
  await expect(rows).toHaveCount((await rows.filter({ hasText: "D1 · Journée" }).count()) + 1 + europeRows);

  // The same day in the grid.
  await page.getByTestId("fixtures-view-calendar").click();
  await expect(page).toHaveURL(/\/fixtures\?vue=grille&mois=2026-12$/);
  await expect(page.locator('[data-day="2026-12-02"] [data-cup-stage]')).toHaveText("Coupe — 16es");

  // Lyon's league results, month by month: its row sums them up, its form is their last five, oldest first.
  const results = await seasonResultsOf(page, ["2026-08", "2026-09"]);
  expect(results.length).toBeGreaterThan(5);
  await openScreen(page, "standings");
  await expect(page.getByTestId("standings-title")).toBeVisible();
  await expectTableToSay(page, results);
  expect(await fullOrangeActions(page)).toEqual(["next-match"]);

  // The card around the next match: three played, then the next, then two more.
  const calendar = page.getByTestId("match-calendar-card");
  await expect(calendar.getByTestId("fixture-row")).toHaveCount(6);
  await expect(calendar.locator("[data-result]")).toHaveCount(3);
  await expect(calendar.getByTestId("fixture-row").nth(3)).toHaveAttribute("data-next", "true");
});

for (const locale of ["fr-FR", "en-GB"]) {
  test.describe(`with results and a draw, ${SMALL_PHONE.width} px wide, in ${locale}`, () => {
    test.use({ locale, viewport: SMALL_PHONE });

    test("never scrolls sideways on the entry's screens, nor in a match's sheet", async ({ page }) => {
      await expectMatchScreensWithinWidth(page);

      await openSave(page, "/fixtures?mois=2026-08");
      await listRowsOf(page).first().getByTestId("match-sheet-trigger").click();
      await expect(page.getByTestId("match-sheet")).toBeVisible();
      await expectNoSidewaysScroll(page, "match sheet");
    });
  });
}

// Last: nothing is left to play after it.
test("closes a finished season: every league result counted, no next match, and the cup over", async ({ page }) => {
  // The rest of the season, simulated.
  test.setTimeout(300_000);
  await openSave(page, "/standings");
  await page.getByTestId("simulate-menu").click();
  await page.getByTestId("simulate-season-end").click();
  await page.getByTestId("simulation-dialog").getByTestId("simulation-continue").click({ timeout: 240_000 });
  await expect(page.getByTestId("dashboard-title")).toBeVisible();

  // All 34 matchdays, month by month, in the table's row and summary.
  const results = await seasonResultsOf(page, MATCH_MONTHS);
  expect(results).toHaveLength(FRENCH_MATCHDAYS);
  await openScreen(page, "standings");
  await expect(page.getByTestId("standings-title")).toBeVisible();
  await expectTableToSay(page, results);

  // The card's last six, all played. Nothing to simulate any more, and the way on is the one orange action.
  const calendar = page.getByTestId("match-calendar-card");
  await expect(calendar.getByTestId("fixture-row")).toHaveCount(6);
  await expect(calendar.locator("[data-result]")).toHaveCount(6);
  await expect(calendar.locator("[data-next]")).toHaveCount(0);
  await expect(page.getByTestId("simulate-menu")).toHaveCount(0);
  expect(await fullOrangeActions(page)).toEqual(["next-season"]);

  // The list opens on the month of the save's date, without a next match.
  await openScreen(page, "fixtures");
  await expect(page.getByTestId("fixtures-month")).toHaveText("mai 2027");
  await expect(listRowsOf(page).last().locator("[data-result]")).toBeVisible();
  await expect(page.getByTestId("fixtures-list").locator("[data-next]")).toHaveCount(0);
  expect(await fullOrangeActions(page)).toEqual(["next-season"]);

  // Beaten in a round, the rounds after it out of reach, or through them all; nothing to come either way.
  await openScreen(page, "cup");
  const card = page.getByTestId("cup-card");
  const progress = card.getByTestId("cup-progress").locator("li");
  await expect(progress).toHaveCount(6);
  const rounds = (await attributesOf(progress, "data-state")).join(" ");
  expect(rounds).toMatch(/^exempt( passed)*( lost( unreached)*)?$/);
  await expect(card.getByTestId("cup-status")).toHaveText(rounds.includes("lost") ? "ÉLIMINÉ" : "VAINQUEUR");
  await expect(card.getByTestId("cup-next-round")).toHaveCount(0);
  await expect(card.getByTestId("cup-prize")).toHaveCount(0);
  await expect(page.getByTestId("cup-winner")).toBeVisible();
  await expect(page.getByTestId("cup-run")).toContainText(/Éliminé|Vainqueur/);
  expect(await fullOrangeActions(page)).toEqual(["next-season"]);
});
