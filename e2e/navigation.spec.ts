import { expect, test, type Page } from "@playwright/test";
import { demoSaveId, DEMO_USER_ID, deleteUsers, signedUserCookie, USER_COOKIE, userIdOf } from "./db";
import {
  ACTION_ORANGE,
  boxOf,
  createSave,
  expectNavAtFootOfScreen,
  expectNoSidewaysScroll,
  openScreen,
  saveHeader,
  type SaveScreen,
} from "./helpers";

// A save's navigation, on the demo save, which has no cup and which nothing here changes: its five entries, then the
// tabs of the three that have several. One <nav> in the DOM at every width: at the foot of the screen on a phone, in a
// column at the left of the screen on a computer. The game's actions follow it: the demo save's world has one division a
// country, so its main action is « Jouer la journée »; the last test creates a save with two, for « Prochain match ».

const COMPUTER = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };

/** On a computer, the navigation ends within this many pixels of the left of the screen. */
const MAX_COLUMN_WIDTH = 260;

/** The demo save's main action. */
const MAIN_ACTION = "play-matchday";

/** How many tabs an entry has, without a cup. */
const TABS_OF_ENTRY: Record<string, number> = { "nav-team": 2, "nav-match": 2, "nav-club": 4 };

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
  advanced: { path: "/transfers/advanced", title: "advanced-title", entry: "nav-transfers" },
  club: { path: "/club", title: "club-title", entry: "nav-club", tab: "nav-club-overview" },
  challenge: { path: "/challenge", title: "challenge-title", entry: "nav-club", tab: "nav-challenge" },
  seasons: { path: "/seasons", title: "seasons-title", entry: "nav-club", tab: "nav-seasons" },
  rewards: { path: "/rewards", title: "rewards-title", entry: "nav-club", tab: "nav-rewards" },
};

/** The market's tab of sales: the same address but for its query, known by its list rather than by the screen's title. */
const SALES: Stop = { ...STOPS.transfers, title: "market-sell" };

/** What the navigation says in a language: its name, its five entries in order, its tabs by data-testid. */
type Labels = { name: string; entries: string[]; tabs: Record<string, string> };

const FRENCH: Labels = {
  name: "Navigation de la partie",
  entries: ["Accueil", "Équipe", "Match", "Marché", "Club"],
  tabs: {
    "nav-squad": "Effectif",
    "nav-lineup": "Composition",
    "nav-fixtures": "Calendrier",
    "nav-standings": "Classement",
    "nav-club-overview": "Club",
    "nav-challenge": "Défi",
    "nav-seasons": "Palmarès",
    "nav-rewards": "Récompenses",
  },
};

const ENGLISH: Labels = {
  name: "Career navigation",
  entries: ["Home", "Squad", "Match", "Market", "Club"],
  tabs: {
    "nav-squad": "Squad",
    "nav-lineup": "Line-up",
    "nav-fixtures": "Fixtures",
    "nav-standings": "Table",
    "nav-club-overview": "Club",
    "nav-challenge": "Challenge",
    "nav-seasons": "Honours",
    "nav-rewards": "Rewards",
  },
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
    await expect(tabs.getByRole("link")).toHaveCount(TABS_OF_ENTRY[stop.entry]);
    const tab = tabs.locator('[aria-current="page"]');
    await expect(tab).toHaveAttribute("data-testid", stop.tab);
    await expect(tab).toHaveText(labels.tabs[stop.tab]);
  }
  await expect(page.getByTestId("nav-cup")).toHaveCount(0);
}

/**
 * On a phone, the navigation is at the foot of the screen, and no screen is wider than the window. The main action is in
 * the dashboard's hero and at the head of the Match screens, and shows nowhere else.
 */
async function expectBarAtFoot(page: Page, stop: Stop): Promise<void> {
  await expectNavAtFootOfScreen(page);
  await expectNoSidewaysScroll(page, stop.title);
  if (stop.path === "") {
    await expect(page.getByTestId("dashboard-next-match").getByTestId(MAIN_ACTION)).toBeVisible();
  } else if (stop.entry === "nav-match") {
    await expect(saveHeader(page).getByTestId(MAIN_ACTION)).toBeVisible();
  } else {
    await expect(page.getByTestId(MAIN_ACTION)).toBeHidden();
  }
}

/**
 * On a computer, the navigation is a column at the left of the screen, the page to its right. The main action, one in the
 * page, is the hero's on the dashboard and the sidebar's everywhere else.
 */
async function expectColumnAtLeft(page: Page, stop: Stop): Promise<void> {
  const nav = await boxOf(page.getByTestId("save-nav"));
  const title = await boxOf(page.getByTestId(stop.title));
  expect(nav.x + nav.width).toBeLessThan(MAX_COLUMN_WIDTH);
  expect(title.x).toBeGreaterThanOrEqual(nav.x + nav.width);
  const holder = stop.path === "" ? page.getByTestId("dashboard-next-match") : saveHeader(page);
  await expect(holder.getByTestId(MAIN_ACTION)).toBeVisible();
  await expect(page.getByTestId(MAIN_ACTION)).toHaveCount(1);
}

const WALKS = [
  {
    name: "on a computer, in French",
    locale: "fr-FR",
    viewport: COMPUTER,
    labels: FRENCH,
    teamHome: "lineup",
    matchHome: "standings",
    expectLayout: expectColumnAtLeft,
  },
  {
    name: "on a phone, in French",
    locale: "fr-FR",
    viewport: PHONE,
    labels: FRENCH,
    teamHome: "squad",
    matchHome: "fixtures",
    expectLayout: expectBarAtFoot,
  },
  {
    name: "on a phone, in English",
    locale: "en-GB",
    viewport: PHONE,
    labels: ENGLISH,
    teamHome: "squad",
    matchHome: "fixtures",
    expectLayout: expectBarAtFoot,
  },
] as const;

for (const { name, locale, viewport, labels, teamHome, matchHome, expectLayout } of WALKS) {
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

      // Each entry straight from the bar: Team opens on the line-up on a computer and on the squad on a phone, Match on the
      // table and on the calendar, the dashboard comes back last. Its address read first: the server answers for a phone,
      // and on a computer the entries change once the page has hydrated.
      for (const screen of [teamHome, matchHome, "transfers", "club", "dashboard"] as const) {
        const entry = page.getByTestId(STOPS[screen].entry);
        await expect(entry).toHaveAttribute("href", `/saves/${saveId}${STOPS[screen].path}`);
        await entry.click();
        await expectStop(STOPS[screen]);
      }

      // Each tab, through its entry.
      for (const screen of ["squad", "lineup", "fixtures", "standings", "challenge", "seasons"] as const) {
        await openScreen(page, screen);
        await expectStop(STOPS[screen]);
      }

      // The market's other views, under the same entry: its sales by a tab, the advanced market by a link, and back.
      await openScreen(page, "transfers");
      await expectStop(STOPS.transfers);
      await page.getByTestId("market-tab-sell").click();
      await expectStop(SALES);
      await page.getByTestId("market-advanced").click();
      await expectStop(STOPS.advanced);
      await page.getByTestId("market-back").click();
      await expectStop(STOPS.transfers);
    });
  });
}

test.describe("the game's actions, on a computer", () => {
  test.use({ viewport: COMPUTER });

  test("are in the sidebar's card but on the dashboard, whose hero alone has them, and leave the orange to the team, the market and Club", async ({
    page,
    context,
  }) => {
    try {
      // A unique name, for a career the test deletes with its user (not simulation code: the clock is fine here).
      await createSave(page, `E2E navigation ${Date.now()}`, "Olympique Lyonnais");
      const sidebar = saveHeader(page);

      // One button in the page, the hero's: the sidebar's card only names the match.
      await expect(page.getByTestId("next-match")).toHaveCount(1);
      await expect(page.getByTestId("dashboard-next-match").getByTestId("next-match")).toBeVisible();
      await expect(sidebar.getByTestId("next-match")).toHaveCount(0);
      await expect(sidebar.getByTestId("simulate-menu")).toHaveCount(0);

      // One button again, the sidebar's, beside the navigation and not in it, nor in the page.
      await openScreen(page, "standings");
      await expect(page.getByTestId("standings-title")).toBeVisible();
      await expect(sidebar.getByTestId("next-match")).toHaveText("Prochain match");
      await expect(sidebar.getByTestId("next-match")).toHaveCSS("background-color", ACTION_ORANGE);
      await expect(sidebar.getByTestId("simulate-menu")).toHaveText("Simuler jusqu'à…");
      await expect(page.getByTestId("next-match")).toHaveCount(1);
      await expect(page.getByTestId("save-nav").getByTestId("next-match")).toHaveCount(0);
      await expect(page.getByRole("main").getByTestId("next-match")).toHaveCount(0);

      // Under Team and on the market, the orange is their own action's: the sidebar's button steps back, the same one.
      for (const [screen, title] of [
        ["squad", "squad-title"],
        ["lineup", "lineup-title"],
      ] as const) {
        await openScreen(page, screen);
        await expect(page.getByTestId(title)).toBeVisible();
        await expect(sidebar.getByTestId("next-match")).toHaveText("Prochain match");
        await expect(sidebar.getByTestId("next-match")).not.toHaveCSS("background-color", ACTION_ORANGE);
        await expect(page.getByTestId("next-match")).toHaveCount(1);
      }
      await openScreen(page, "transfers");
      await expect(page.getByTestId("market-recruit")).toHaveCSS("background-color", ACTION_ORANGE);
      await expect(sidebar.getByTestId("next-match")).toBeVisible();
      await expect(sidebar.getByTestId("next-match")).not.toHaveCSS("background-color", ACTION_ORANGE);
      await openScreen(page, "club");
      await expect(page.getByTestId("club-challenge-link")).toHaveCSS("background-color", ACTION_ORANGE);
      await expect(sidebar.getByTestId("next-match")).not.toHaveCSS("background-color", ACTION_ORANGE);
    } finally {
      // Even when a step failed: the user takes their save with them.
      await deleteUsers([await userIdOf(context)]);
    }
  });
});
