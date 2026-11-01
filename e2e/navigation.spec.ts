import { expect, test, type Page } from "@playwright/test";
import { demoSaveId, DEMO_USER_ID, signedUserCookie, USER_COOKIE } from "./db";
import { boxOf, expectNavAtFootOfScreen, expectNoSidewaysScroll, openScreen, type SaveScreen } from "./helpers";

// A save's navigation, on the demo save, which has no cup and which nothing here changes: its five entries, then the
// tabs of the two that have several. One <nav> in the DOM at every width: at the foot of the screen on a phone, in a
// column at the left of the screen on a computer.

const COMPUTER = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };

/** On a computer, the navigation ends within this many pixels of the left of the screen. */
const MAX_COLUMN_WIDTH = 260;

/** Where a screen is, and how the navigation shows it. */
type Stop = {
  path: string; // within the save
  title: string; // data-testid of the screen's title
  entry: string; // data-testid of its entry
  tab?: string; // data-testid of its tab, under an entry that has several
};

const STOPS: Record<Exclude<SaveScreen, "cup">, Stop> = {
  dashboard: { path: "", title: "dashboard-title", entry: "nav-dashboard" },
  squad: { path: "/squad", title: "squad-title", entry: "nav-team", tab: "nav-squad" },
  lineup: { path: "/lineup", title: "lineup-title", entry: "nav-team", tab: "nav-lineup" },
  fixtures: { path: "/fixtures", title: "fixtures-title", entry: "nav-match", tab: "nav-fixtures" },
  standings: { path: "/standings", title: "standings-title", entry: "nav-match", tab: "nav-standings" },
  transfers: { path: "/transfers", title: "transfers-title", entry: "nav-transfers" },
  club: { path: "/seasons", title: "seasons-title", entry: "nav-club" },
};

/** What the navigation says in a language: its name, its five entries in order, its tabs by data-testid. */
type Labels = { name: string; entries: string[]; tabs: Record<string, string> };

const FRENCH: Labels = {
  name: "Navigation de la partie",
  entries: ["Accueil", "Équipe", "Match", "Marché", "Club"],
  tabs: { "nav-squad": "Effectif", "nav-lineup": "Composition", "nav-fixtures": "Calendrier", "nav-standings": "Classement" },
};

const ENGLISH: Labels = {
  name: "Career navigation",
  entries: ["Home", "Squad", "Match", "Market", "Club"],
  tabs: { "nav-squad": "Squad", "nav-lineup": "Line-up", "nav-fixtures": "Fixtures", "nav-standings": "Table" },
};

/** The screen is open, and the navigation says so. */
async function expectNavigationOn(page: Page, saveId: string, stop: Stop, labels: Labels): Promise<void> {
  await expect(page).toHaveURL((url) => url.pathname === `/saves/${saveId}${stop.path}`);
  await expect(page.getByTestId(stop.title)).toBeVisible();

  // One navigation in the DOM, whatever the width: its five entries, none of the tabs, and one entry current.
  await expect(page.getByTestId("save-nav")).toHaveCount(1);
  const nav = page.getByRole("navigation", { name: labels.name });
  await expect(nav).toHaveAttribute("data-testid", "save-nav");
  await expect(nav.locator('[data-testid^="nav-"]')).toHaveText(labels.entries);
  await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("data-testid", stop.entry);

  // Tabs in the page under an entry that has several, none elsewhere; a save without a cup has no « Coupe » among them.
  if (stop.tab === undefined) {
    await expect(page.getByTestId("section-tabs")).toHaveCount(0);
  } else {
    const tabs = page.getByRole("main").getByTestId("section-tabs");
    await expect(tabs.getByRole("link")).toHaveCount(2);
    const tab = tabs.locator('[aria-current="page"]');
    await expect(tab).toHaveAttribute("data-testid", stop.tab);
    await expect(tab).toHaveText(labels.tabs[stop.tab]);
  }
  await expect(page.getByTestId("nav-cup")).toHaveCount(0);
}

/** On a phone, the navigation is at the foot of the screen, and no screen is wider than the window. */
async function expectBarAtFoot(page: Page, stop: Stop): Promise<void> {
  await expectNavAtFootOfScreen(page);
  await expectNoSidewaysScroll(page, stop.title);
}

/** On a computer, the navigation is a column at the left of the screen, the page to its right. */
async function expectColumnAtLeft(page: Page, stop: Stop): Promise<void> {
  const nav = await boxOf(page.getByTestId("save-nav"));
  const title = await boxOf(page.getByTestId(stop.title));
  expect(nav.x + nav.width).toBeLessThan(MAX_COLUMN_WIDTH);
  expect(title.x).toBeGreaterThanOrEqual(nav.x + nav.width);
}

const WALKS = [
  { name: "on a computer, in French", locale: "fr-FR", viewport: COMPUTER, labels: FRENCH, expectLayout: expectColumnAtLeft },
  { name: "on a phone, in French", locale: "fr-FR", viewport: PHONE, labels: FRENCH, expectLayout: expectBarAtFoot },
  { name: "on a phone, in English", locale: "en-GB", viewport: PHONE, labels: ENGLISH, expectLayout: expectBarAtFoot },
];

for (const { name, locale, viewport, labels, expectLayout } of WALKS) {
  test.describe(`a save's navigation, ${name}`, () => {
    test.use({ locale, viewport });

    test("opens every entry and every tab, with one bar in the page and no cup in a save without one", async ({
      page,
      context,
      baseURL,
    }) => {
      const saveId = await demoSaveId();
      // The demo user's cookie, as the server signs it: the save opens for its owner only.
      await context.addCookies([{ name: USER_COOKIE, value: signedUserCookie(DEMO_USER_ID), url: baseURL ?? "" }]);

      const expectStop = async (stop: Stop): Promise<void> => {
        await expectNavigationOn(page, saveId, stop, labels);
        await expectLayout(page, stop);
      };

      await page.goto(`/saves/${saveId}`);
      await expectStop(STOPS.dashboard);

      // Each entry straight from the bar: Team opens on the squad, Match on the calendar, the dashboard comes back last.
      for (const screen of ["squad", "fixtures", "transfers", "club", "dashboard"] as const) {
        await page.getByTestId(STOPS[screen].entry).click();
        await expectStop(STOPS[screen]);
      }

      // Each tab, through its entry.
      for (const screen of ["squad", "lineup", "fixtures", "standings"] as const) {
        await openScreen(page, screen);
        await expectStop(STOPS[screen]);
      }
    });
  });
}
