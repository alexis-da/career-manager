import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { ARRIVAL_COOKIE } from "../src/lib/arrival";
import { isoWeekKey, isoWeekNumber } from "../src/lib/iso-week";
import {
  createAnonymousUser,
  createRegisteredUser,
  demoSaveId,
  DEMO_USER_ID,
  deleteUsers,
  insertWeekChallengeSave,
  userIdOf,
} from "./db";
import {
  ACTION_ORANGE,
  boxOf,
  createSave,
  expectNoSidewaysScroll,
  expectOrangeActions,
  expectThumbTarget,
  saveRow,
  signInAs,
  textOf,
  waitForReact,
} from "./helpers";

// The pages outside a save: the home page of a first visit, where choosing a club creates nothing, the one of a player who
// comes back, and the public pages around them. A player who comes back is the demo save's owner, anonymous and at their
// limit, whose save nothing here changes, or a user made for one test, who goes at its end with their saves.

const COMPUTER = { width: 1280, height: 800 };
const SMALL_COMPUTER = { width: 1024, height: 800 };
const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 360, height: 780 };

test.use({ viewport: COMPUTER });

/** The home page in French, Playwright's language (fr-FR); in English at the site's root. */
const HOME = "/fr";

/** What a first visit's h1 says the game is, in each language; the choice the form offers comes over its cards. */
const LANDING_TITLE = {
  fr: "Jeu de carrière de football gratuit, dans ton navigateur",
  en: "Free football career game in your browser",
};
const CHOICE_TITLE = { fr: "Choisis ton défi", en: "Choose your challenge" };

const LYON = "Olympique Lyonnais";
const WOLVERHAMPTON = "Wolverhampton Wanderers FC";

/** The third card's club: the weakest of its second division whose board asks it to go up. */
const COMEBACK_CLUB = "USL Dunkerque";

/** The three cards of a French player, the recommended one chosen from the start. */
const CARDS = [
  { kind: "favourite", level: "Facile · favori", club: "Paris Saint-Germain FC" },
  { kind: "mid-table", level: "Équilibré · conseillé", club: "Toulouse FC" },
  { kind: "comeback", level: "Difficile · Division 2", club: COMEBACK_CLUB },
] as const;

type CardKind = (typeof CARDS)[number]["kind"];

const RECOMMENDED_CLUB = "Toulouse FC";
const NO_CLUB_MATCHES = "Aucun club ne correspond.";

/** The demo save, as the home page lists it: the first day of its second season. */
const DEMO_SAVE_NAME = "Partie de démo 2026-27";
const DEMO_SAVE_LINE = "Test · 1er juillet 2027";

/** Under this width, every target of a page is a thumb high. */
const THUMB_WIDTH = 640;

/**
 * What a thumb aims at on a page outside a save, the form's fields and its folded options included. The cards by their
 * label: their radio buttons are hidden and take no touch, no more than the field the club's list keeps for the form.
 */
const TARGETS = [
  "a:visible",
  "button:visible",
  "summary:visible",
  "label[data-testid]:visible",
  'input:not([type="radio"]):not([aria-hidden="true"]):visible',
].join(", ");

let demo = "";

test.beforeAll(async () => {
  demo = await demoSaveId();
});

type Box = Awaited<ReturnType<typeof boxOf>>;

const cardOf = (page: Page, kind: CardKind): Locator => page.getByTestId(`club-suggestion-${kind}`);

const clubSearch = (page: Page): Locator => page.getByTestId("club-search");

const searchResults = (page: Page): Locator => page.getByTestId("club-search-result");

/** The value the list's trigger shows: the icon beside it has a text of its own, which no one sees. */
const listedClub = (page: Page): Locator => page.getByTestId("club").locator('[data-slot="select-value"]');

const cookieNames = async (context: BrowserContext): Promise<string[]> => (await context.cookies()).map(({ name }) => name);

/** The French home page, once React has committed it: its form answers only then. */
async function openHome(page: Page): Promise<void> {
  await page.goto(HOME);
  await waitForReact(page);
}

/** Under 640 px, every link, button and field a page outside a save shows is a thumb high; a wider page has no such rule. */
async function expectThumbTargets(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) >= THUMB_WIDTH) {
    return;
  }
  // In the page: Next's development tools are beside it.
  const targets = await page.locator("main").locator(TARGETS).all();
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    await expectThumbTarget(target);
  }
}

/** The card a club has chosen: its radio button and its orange border, on it alone, and on none for a club out of the three. */
async function expectCheckedCard(page: Page, checked: CardKind | null): Promise<void> {
  for (const { kind } of CARDS) {
    const card = cardOf(page, kind);
    await expect(card.getByRole("radio")).toBeChecked({ checked: kind === checked });
    if (kind === checked) {
      await expect(card).toHaveCSS("border-top-color", ACTION_ORANGE);
    } else {
      await expect(card).not.toHaveCSS("border-top-color", ACTION_ORANGE);
    }
  }
}

/** The club the form will send, on the list's trigger, and the career's name that comes from it. */
async function expectChosenClub(page: Page, club: string): Promise<void> {
  await expect(listedClub(page)).toHaveText(club);
  await expect(page.getByTestId("save-name")).toHaveValue(`Carrière ${club}`);
}

/** Two boxes on one line: the middle of the second within the height of the first. */
function expectOnOneLine(first: Box, second: Box): void {
  const middle = second.y + second.height / 2;
  expect(middle).toBeGreaterThanOrEqual(first.y);
  expect(middle).toBeLessThanOrEqual(first.y + first.height);
}

/**
 * The style attributes of an element and of all it holds: a club's colour would be one, the game's are Tailwind's classes.
 * The game's mark aside, whose image next/image keeps transparent by a style of its own.
 */
const inlineStyles = (root: Locator): Promise<(string | null)[]> =>
  root.evaluate((element) =>
    [element, ...element.querySelectorAll("*")]
      .filter((node) => node.hasAttribute("style") && node.closest('[data-testid="public-home"]') === null)
      .map((node) => node.getAttribute("style")),
  );

/**
 * Every creation form sent to the French home page from now on, as a Server Action: its fields go with it (the clubs the
 * page asks for once in the browser are another action, with none).
 */
function formPosts(page: Page): string[] {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === HOME && (request.postData() ?? "").includes("managerName")) {
      posts.push(request.url());
    }
  });
  return posts;
}

for (const viewport of [COMPUTER, SMALL_COMPUTER, PHONE, SMALL_PHONE]) {
  test.describe(`a first visit at ${viewport.width} px`, () => {
    test.use({ viewport });

    test("offers three clubs, the recommended one chosen, « Lancer ma carrière » the one orange, and creates nothing", async ({
      page,
      context,
    }) => {
      await page.goto(HOME);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(LANDING_TITLE.fr);
      await expect(page.getByTestId("create-save-choice")).toHaveText(CHOICE_TITLE.fr);
      await expect(page.getByText(/^198 clubs, deux divisions par pays/)).toBeVisible();
      await expect(clubSearch(page)).toHaveAttribute("placeholder", "Chercher parmi les 198 clubs");

      for (const { kind, level, club } of CARDS) {
        const card = cardOf(page, kind);
        await expect(card).toContainText(level);
        await expect(card).toContainText(club);
        await expect(card).toContainText(/Réputation \d+/);
        await expect(card).toContainText(/Budget\s\d+,\d\sM€/);
        // The challenge is the week's: the third card is a comeback.
        await expect(card).not.toContainText(/défi/i);
      }
      await expectCheckedCard(page, "mid-table");
      await expectChosenClub(page, RECOMMENDED_CLUB);

      await expect(page.getByTestId("create-save")).toHaveText("Lancer ma carrière");
      // Playing takes no scrolling: the button is whole in the window as the page opens, the club already chosen.
      const submit = await boxOf(page.getByTestId("create-save"));
      expect(submit.y + submit.height).toBeLessThanOrEqual(viewport.height);
      await expectOrangeActions(page, ["create-save"]);
      await expectNoSidewaysScroll(page, "first visit");
      await expectThumbTargets(page);

      const foot = page.locator("footer");
      await expect(foot).toContainText("The football career game · Take your club to the top");
      await expect(foot).toContainText("Jouable en français et en anglais.");
      await expect(foot).toContainText("La saison 2026-27 commence le 1er juillet 2026.");

      // No user before the form is sent, and no language the player has not chosen: the arrival's cookie only.
      expect(await cookieNames(context)).toEqual([ARRIVAL_COOKIE]);
    });

    test("has two columns and the challenge and Google beside the game's mark from 1024 px, those two under one column below", async ({
      page,
    }) => {
      await page.goto(HOME);
      const mark = await boxOf(page.getByTestId("public-home"));
      const title = await boxOf(page.getByRole("heading", { level: 1 }));
      const clubs = await boxOf(cardOf(page, "favourite"));
      const submit = await boxOf(page.getByTestId("create-save"));
      for (const testId of ["challenge-teaser", "google-sign-in"]) {
        const tool = await boxOf(page.getByTestId(testId));
        if (viewport.width >= SMALL_COMPUTER.width) {
          expect(tool.x, testId).toBeGreaterThanOrEqual(mark.x + mark.width);
          expectOnOneLine(mark, tool);
        } else {
          expect(tool.y, testId).toBeGreaterThanOrEqual(submit.y + submit.height);
        }
      }
      if (viewport.width >= SMALL_COMPUTER.width) {
        expect(clubs.x).toBeGreaterThanOrEqual(title.x + title.width);
        expect(clubs.x).toBeGreaterThanOrEqual(submit.x + submit.width);
      } else {
        expect(clubs.y).toBeGreaterThanOrEqual(title.y + title.height);
        expect(submit.y).toBeGreaterThanOrEqual(clubs.y + clubs.height);
      }
      await expect(page.getByTestId("challenge-teaser")).toHaveAttribute("href", "/fr/defi");
    });

    test("has the language at the top of the page, which leads to the home page in English and back, its card following", async ({
      page,
      context,
    }) => {
      await openHome(page);
      const french = page.getByTestId("language-fr");
      const english = page.getByTestId("language-en");
      const title = page.getByRole("heading", { level: 1 });

      const mark = await boxOf(page.getByTestId("public-home"));
      const heading = await boxOf(title);
      for (const language of [await boxOf(french), await boxOf(english)]) {
        expect(language.x).toBeGreaterThanOrEqual(mark.x + mark.width);
        expectOnOneLine(mark, language);
        expect(language.y + language.height).toBeLessThanOrEqual(heading.y);
      }

      await english.click();
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(title).toHaveText(LANDING_TITLE.en);
      await expect(page.getByTestId("create-save-choice")).toHaveText(CHOICE_TITLE.en);
      await expect(page.getByTestId("create-save")).toHaveText("Start my career");
      const recommended = cardOf(page, "mid-table");
      await expect(recommended).toContainText("Balanced · recommended");
      await expect(recommended).toContainText("Fulham FC");
      await expect(listedClub(page)).toHaveText("Fulham FC");
      await expect(page.getByTestId("save-name")).toHaveValue("Fulham FC career");
      await expectCheckedCard(page, "mid-table");
      await expectNoSidewaysScroll(page, "first visit in English");
      await expectThumbTargets(page);

      await french.click();
      await expect(page).toHaveURL((url) => url.pathname === HOME);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(title).toHaveText(LANDING_TITLE.fr);
      await expect(recommended).toContainText(RECOMMENDED_CLUB);
      await expectChosenClub(page, RECOMMENDED_CLUB);

      // The language is the player's choice, kept; still no user, the arrival's cookie besides.
      expect((await cookieNames(context)).sort()).toEqual([ARRIVAL_COOKIE, "lw_lang"].sort());
    });
  });
}

/** The landing sections a first visit reads under the form, in each language. */
const LANDING = {
  fr: {
    home: HOME,
    challenge: "/fr/defi",
    sections: ["Ce que tu fais dans Late Winner", "Le jeu en images", "Le défi de la semaine", "Gratuit, sans téléchargement, sur téléphone", "Questions fréquentes"],
    questions: ["Late Winner est-il gratuit ?", "Faut-il un compte ?", "Peut-on jouer sur téléphone ?", "En quelles langues ?", "Où est gardée ma partie ?"],
  },
  en: {
    home: "/",
    challenge: "/challenge",
    sections: ["What you do in Late Winner", "The game in pictures", "The weekly challenge", "Free, no download, on your phone", "Questions"],
    questions: ["Is Late Winner free?", "Do I need an account?", "Can I play on my phone?", "Which languages is it in?", "Where is my career saved?"],
  },
} as const;

for (const { locale, language, viewport } of [
  { locale: "fr-FR", language: "fr", viewport: PHONE },
  { locale: "en-GB", language: "en", viewport: COMPUTER },
] as const) {
  test.describe(`the landing sections in ${locale} at ${viewport.width} px`, () => {
    test.use({ locale, viewport });

    test("follow the form: what one does in the game, three screenshots, the challenge, the access, the questions", async ({
      page,
    }) => {
      const { home, challenge, sections, questions } = LANDING[language];
      await page.goto(home);
      const landing = page.getByTestId("landing");
      await expect(landing.getByRole("heading", { level: 2 })).toHaveText(sections);
      // Under the form and the button, never before them.
      expect((await boxOf(landing)).y).toBeGreaterThanOrEqual((await boxOf(page.getByTestId("create-save"))).y);

      await expect(landing.getByTestId("landing-features").getByRole("listitem")).toHaveCount(6);
      const screenshots = landing.getByTestId("landing-screenshot");
      await expect(screenshots).toHaveCount(3);
      for (const screenshot of await screenshots.all()) {
        await expect(screenshot).toHaveAttribute("src", new RegExp(`^/screenshots/[a-z-]+-${language}\\.webp$`));
        expect((await screenshot.getAttribute("alt"))?.length ?? 0).toBeGreaterThan(40);
        await screenshot.scrollIntoViewIfNeeded();
        await expect.poll(() => screenshot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(720);
      }
      await expect(landing.getByTestId("landing-challenge-link")).toHaveAttribute("href", challenge);
      await expect(landing.getByTestId("landing-faq").getByRole("heading", { level: 3 })).toHaveText(questions);

      await expectNoSidewaysScroll(page, "landing sections");
      await expectThumbTargets(page);
    });
  });
}

test("finds no club in one letter, then a club by part of its name, accents and capitals aside, or says that none matches", async ({
  page,
}) => {
  await openHome(page);
  await clubSearch(page).fill("w");
  await expect(searchResults(page)).toHaveCount(0);
  await expect(page.getByText(NO_CLUB_MATCHES)).toHaveCount(0);

  // A second letter is a search.
  await clubSearch(page).fill("wo");
  await expect(searchResults(page).first()).toBeVisible();

  for (const [query, club, competition] of [
    ["wolver", WOLVERHAMPTON, "Angleterre — Division 1"],
    ["saint-etienne", "AS Saint-Étienne", "France — Division 1"],
    ["KOLN", "1. FC Köln", "Allemagne — Division 2"],
    ["preussen", "Preußen Münster", "Allemagne — Division 2"],
  ]) {
    await clubSearch(page).fill(query);
    await expect(searchResults(page)).toHaveCount(1);
    await expect(searchResults(page)).toContainText(club);
    await expect(searchResults(page)).toContainText(competition);
  }

  await clubSearch(page).fill("zzz");
  await expect(searchResults(page)).toHaveCount(0);
  await expect(page.getByText(NO_CLUB_MATCHES)).toBeVisible();
});

test("takes a result as the club: the field empties, no card stays checked, the list shows it in orange, the name follows", async ({
  page,
}) => {
  await openHome(page);
  const list = page.getByTestId("club");
  await expect(list).not.toHaveCSS("border-top-color", ACTION_ORANGE);

  await clubSearch(page).fill("wolver");
  await searchResults(page).click();
  await expect(clubSearch(page)).toHaveValue("");
  await expect(searchResults(page)).toHaveCount(0);
  await expectCheckedCard(page, null);
  await expectChosenClub(page, WOLVERHAMPTON);
  await expect(list).toHaveCSS("border-top-color", ACTION_ORANGE);

  // Back on a card, the orange goes back with it.
  await cardOf(page, "comeback").click();
  await expectCheckedCard(page, "comeback");
  await expectChosenClub(page, COMEBACK_CLUB);
  await expect(list).not.toHaveCSS("border-top-color", ACTION_ORANGE);
});

test("takes the first result on Enter, and never sends the form, valid as it is", async ({ page, context }) => {
  const posts = formPosts(page);
  try {
    await openHome(page);
    await page.getByTestId("manager-name").fill("Test E2E");

    // Nothing to take yet: the field keeps its text, the club stays.
    for (const query of ["w", "zzz"]) {
      await clubSearch(page).fill(query);
      await clubSearch(page).press("Enter");
      await expect(clubSearch(page)).toHaveValue(query);
      await expectChosenClub(page, RECOMMENDED_CLUB);
    }

    await clubSearch(page).fill("wolver");
    await clubSearch(page).press("Enter");
    await expect(clubSearch(page)).toHaveValue("");
    await expectChosenClub(page, WOLVERHAMPTON);

    await page.waitForLoadState("networkidle");
    expect(posts).toEqual([]);
    expect(new URL(page.url()).pathname).toBe(HOME);
    expect(await cookieNames(context)).toEqual([ARRIVAL_COOKIE]);
  } finally {
    // Even when a step failed: a form sent would have made a player of this browser, and their save.
    await deleteUsers([await userIdOf(context)]);
  }
});

test.describe("the search at 390 px", () => {
  test.use({ viewport: PHONE });

  test("gives every result a thumb's height, and holds in the window with the game's longest name", async ({ page }) => {
    await openHome(page);
    await clubSearch(page).fill("fc");
    await expect(searchResults(page)).toHaveCount(6);
    for (const result of await searchResults(page).all()) {
      await expectThumbTarget(result);
    }
    await expectNoSidewaysScroll(page, "results");

    await clubSearch(page).fill("wolver");
    await expectThumbTarget(searchResults(page));
    await expectNoSidewaysScroll(page, "the longest name");
  });
});

test("makes one choice of the cards and the list: a card's club checks it, another leaves the list in orange", async ({ page }) => {
  await openHome(page);
  const list = page.getByTestId("club");

  await list.click();
  await page.getByRole("option", { name: "Paris Saint-Germain FC", exact: true }).click();
  await expectCheckedCard(page, "favourite");
  await expectChosenClub(page, "Paris Saint-Germain FC");
  await expect(list).not.toHaveCSS("border-top-color", ACTION_ORANGE);

  await list.click();
  await page.getByRole("option", { name: LYON, exact: true }).click();
  await expectCheckedCard(page, null);
  await expectChosenClub(page, LYON);
  await expect(list).toHaveCSS("border-top-color", ACTION_ORANGE);
});

test("keeps a name typed by hand in the options, whichever club comes after it", async ({ page }) => {
  await openHome(page);
  await page.getByTestId("create-save-options").click();
  const name = page.getByTestId("save-name");
  await expect(name).toHaveValue(`Carrière ${RECOMMENDED_CLUB}`);
  await name.fill("Ma remontée");

  await cardOf(page, "comeback").click();
  await expect(listedClub(page)).toHaveText(COMEBACK_CLUB);
  await expect(name).toHaveValue("Ma remontée");

  await clubSearch(page).fill("wolver");
  await searchResults(page).click();
  await expect(listedClub(page)).toHaveText(WOLVERHAMPTON);
  await expect(name).toHaveValue("Ma remontée");
});

test("folds the options from the start, and a refused name alone opens them", async ({ page, context }) => {
  await openHome(page);
  const options = page.getByTestId("create-save-options");
  const name = page.getByTestId("save-name");
  const seed = page.getByTestId("seed");
  await expect(name).toBeHidden();
  await expect(seed).toBeHidden();

  // The manager's name is filled in from the start: only emptied by hand is it refused, which says so where the player
  // is, with no business in the options.
  const manager = page.getByTestId("manager-name");
  await expect(manager).toHaveValue("Coach");
  await manager.fill("");
  await page.getByTestId("create-save").click();
  await expect(page.getByText("Indique le nom du manager.")).toBeVisible();
  await expect(name).toBeHidden();
  await expect(seed).toBeHidden();

  // The name comes from the club: only emptied by hand is it refused, the options folded again.
  await options.click();
  await name.fill("");
  await options.click();
  await expect(name).toBeHidden();
  await manager.fill("Test E2E");
  await page.getByTestId("create-save").click();

  await expect(page.getByText("Donne un nom à la partie.")).toBeVisible();
  await expect(name).toBeVisible();
  await expect(seed).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(HOME);
  expect(await cookieNames(context)).toEqual([ARRIVAL_COOKIE]);
});

test("keeps the club, the manager and the seed through a refused form", async ({ page }) => {
  await openHome(page);
  const manager = page.getByTestId("manager-name");
  const seed = page.getByTestId("seed");
  await cardOf(page, "favourite").click();
  await page.getByTestId("create-save-options").click();
  await seed.fill("ma-graine");

  // The manager's name emptied by hand: refused, and kept empty, its default not back.
  await manager.fill("");
  await page.getByTestId("create-save").click();
  await expect(page.getByText("Indique le nom du manager.")).toBeVisible();
  await expect(manager).toHaveValue("");
  await expectChosenClub(page, "Paris Saint-Germain FC");
  await expect(cardOf(page, "favourite")).toHaveCSS("border-top-color", ACTION_ORANGE);
  await expect(seed).toHaveValue("ma-graine");

  await manager.fill("Test E2E");
  await page.getByTestId("save-name").fill("");
  await page.getByTestId("create-save").click();
  await expect(page.getByText("Donne un nom à la partie.")).toBeVisible();
  await expect(manager).toHaveValue("Test E2E");
  await expect(seed).toHaveValue("ma-graine");
  await expect(listedClub(page)).toHaveText("Paris Saint-Germain FC");

  // The card checked at the opening is still a card to choose.
  await cardOf(page, "mid-table").click();
  await expect(listedClub(page)).toHaveText(RECOMMENDED_CLUB);
  await expect(cardOf(page, "mid-table")).toHaveCSS("border-top-color", ACTION_ORANGE);
});

test("leaves the chosen card's radio button checked after a refused form, as the screen shows it", async ({ page }) => {
  await openHome(page);
  await cardOf(page, "favourite").click();
  await expectCheckedCard(page, "favourite");

  await page.getByTestId("manager-name").fill("");
  await page.getByTestId("create-save").click();
  await expect(page.getByText("Indique le nom du manager.")).toBeVisible();
  await expectCheckedCard(page, "favourite");
});

test("starts each language's home page on its recommended card: a club chosen in one is not carried to the other", async ({
  page,
}) => {
  await openHome(page);
  await cardOf(page, "favourite").click();
  await expectCheckedCard(page, "favourite");

  await page.getByTestId("language-en").click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(listedClub(page)).toHaveText("Fulham FC");
  await expectCheckedCard(page, "mid-table");

  await page.getByTestId("language-fr").click();
  await expect(page).toHaveURL((url) => url.pathname === HOME);
  await expectCheckedCard(page, "mid-table");
  await expectChosenClub(page, RECOMMENDED_CLUB);
});

for (const viewport of [COMPUTER, PHONE, SMALL_PHONE]) {
  test.describe(`an anonymous player at their limit, at ${viewport.width} px`, () => {
    test.use({ viewport });

    test("finds their career in place of the form, « Reprendre » the one orange, Google in the notice alone", async ({ page }) => {
      await signInAs(page, DEMO_USER_ID);
      await page.goto(HOME);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tes carrières");

      const saves = page.getByTestId("saves");
      await expect(saves.getByText("1 carrière", { exact: true })).toBeVisible();
      await expect(saves.locator("[data-save-name]")).toHaveCount(1);
      const card = saveRow(page, DEMO_SAVE_NAME);
      await expect(card).toContainText(DEMO_SAVE_NAME);
      await expect(card).toContainText(LYON);
      await expect(card).toContainText(DEMO_SAVE_LINE);
      const resume = card.getByTestId("open-save");
      await expect(resume).toContainText("Reprendre");
      await expect(resume).toHaveAttribute("href", `/saves/${demo}`);
      await expectOrangeActions(page, ["open-save"]);

      await expect(saves.getByTestId("save-limit")).toBeVisible();
      await expect(page.getByTestId("create-save")).toHaveCount(0);
      await expect(page.getByTestId("manager-name")).toHaveCount(0);
      await expect(page.getByTestId("google-sign-in")).toHaveCount(1);
      await expect(page.getByTestId("save-limit").getByTestId("google-sign-in")).toBeVisible();

      // A club shows by its initials, on the game's colours.
      expect(await inlineStyles(card)).toEqual([]);

      await expectNoSidewaysScroll(page, "a career and the notice");
      await expectThumbTargets(page);
    });
  });
}

test("keeps the form under a Google account's careers, in h2, with the account at the top and its deletion at the foot", async ({
  page,
}) => {
  const accountName = "Alexis Durand";
  const { id } = await createRegisteredUser(accountName);
  try {
    await signInAs(page, id);
    // A unique name to find this save again (not simulation code: the clock is fine here).
    const name = `E2E accueil ${Date.now()}`;
    await createSave(page, name, LYON);
    await page.goto(HOME);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tes carrières");
    const card = saveRow(page, name);
    await expect(card).toContainText(LYON);
    await expect(card).toContainText("Test E2E · 1er juillet 2026");
    await expect(card.getByTestId("open-save")).toBeVisible();

    // « Reprendre » steps back: the screen's orange is the form's.
    await expectOrangeActions(page, ["create-save"]);
    await expect(page.getByTestId("save-limit")).toHaveCount(0);
    const formTitle = page.getByRole("heading", { level: 2, name: "Choisis ton défi" });
    const saves = await boxOf(page.getByTestId("saves"));
    expect((await boxOf(formTitle)).y).toBeGreaterThanOrEqual(saves.y + saves.height);

    const mark = await boxOf(page.getByTestId("public-home"));
    await expect(page.getByTestId("account-name")).toHaveText(accountName);
    for (const testId of ["account-name", "sign-out"]) {
      const control = await boxOf(page.getByTestId(testId));
      expect(control.x, testId).toBeGreaterThanOrEqual(mark.x + mark.width);
      expectOnOneLine(mark, control);
    }
    await expect(page.getByTestId("google-sign-in")).toHaveCount(0);

    const deletion = page.locator("footer").getByTestId("delete-account");
    await expect(deletion).toHaveText("Supprimer mon compte");
    const submit = await boxOf(page.getByTestId("create-save"));
    expect((await boxOf(deletion)).y).toBeGreaterThanOrEqual(submit.y + submit.height);
    await expectNoSidewaysScroll(page, "a Google account's home page");

    // The same page on the narrowest phone.
    await page.setViewportSize(SMALL_PHONE);
    await expect(deletion).toBeVisible();
    await expectNoSidewaysScroll(page, "a Google account's home page on a phone");
    await expectThumbTargets(page);
  } finally {
    await deleteUsers([id]);
  }
});

for (const { locale, name, mark, cards, home, challenge } of [
  { locale: "fr-FR", name: "Défi — semaine", mark: "Défi", cards: "Tes carrières", home: HOME, challenge: "/fr/defi" },
  { locale: "en-GB", name: "Challenge — week", mark: "Challenge", cards: "Your careers", home: "/", challenge: "/challenge" },
]) {
  test.describe(`a challenge career in ${locale}`, () => {
    test.use({ locale });

    test("is named from its week, carries its mark, and leaves the form on the page: it is none of the careers a player may hold", async ({
      page,
    }) => {
      // The page creates the week's challenge when missing.
      await page.goto(challenge);
      // Its name comes in the browser, after the page: read once there.
      await expect(page.getByTestId("challenge-club")).not.toBeEmpty();
      const club = await textOf(page.getByTestId("challenge-club"));
      // Not simulation code: a player seen just now.
      const userId = await createAnonymousUser(new Date());
      try {
        await insertWeekChallengeSave(userId);
        await signInAs(page, userId);
        await page.goto(home);

        await expect(page.getByRole("heading", { level: 1 })).toHaveText(cards);
        const card = page.getByTestId("saves").locator("[data-save-name]");
        await expect(card).toHaveCount(1);
        // Not simulation code: the week the test server serves.
        await expect(card).toContainText(`${name} ${isoWeekNumber(isoWeekKey(new Date()))}`);
        await expect(card.getByText(mark, { exact: true })).toBeVisible();
        await expect(card).toContainText(club);
        // Its name is the game's: nothing of it is stored.
        await expect(card).toHaveAttribute("data-save-name", "");

        await expect(page.getByTestId("save-limit")).toHaveCount(0);
        await expectOrangeActions(page, ["create-save"]);
      } finally {
        // Even when a step failed: a leftover challenge save would count against the week's cap.
        await deleteUsers([userId]);
      }
    });
  });
}

type Language = "fr" | "en";

/** Each language's home page. */
const HOMES: Record<Language, string> = { fr: HOME, en: "/" };

/**
 * A public page: its address in each language, what its title says there, its one orange action, what is its own, and
 * where its language switcher leads (its address in the other language; a missing page's, the home page).
 */
type PublicPage = {
  paths: Record<Language, string>;
  status: number;
  title: Record<Language, string>;
  orange: string[];
  expectOwnContent?: (page: Page, language: Language) => Promise<void>;
  switchesTo: Record<Language, string>;
};

const CHALLENGE_PATHS = { fr: "/fr/defi", en: "/challenge" };
const PRIVACY_PATHS = { fr: "/fr/confidentialite", en: "/privacy" };
const GUIDE_PATHS = { fr: "/fr/comment-jouer", en: "/how-to-play" };
const CHANGELOG_PATHS = { fr: "/fr/nouveautes", en: "/changelog" };
const ABOUT_PATHS = { fr: "/fr/a-propos", en: "/about" };

const PUBLIC_PAGES: PublicPage[] = [
  {
    paths: CHALLENGE_PATHS,
    switchesTo: CHALLENGE_PATHS,
    status: 200,
    title: { fr: "Défi de la semaine", en: "Weekly challenge" },
    orange: ["challenge-play"],
    expectOwnContent: async (page) => {
      await expect(page.getByTestId("challenge-club")).not.toBeEmpty();
      expect(await inlineStyles(page.locator("main"))).toEqual([]);
    },
  },
  {
    paths: { fr: "/fr/no-such-page", en: "/no-such-page" },
    switchesTo: HOMES,
    status: 404,
    title: { fr: "Page introuvable", en: "Page not found" },
    orange: ["not-found-home"],
  },
  {
    paths: GUIDE_PATHS,
    switchesTo: GUIDE_PATHS,
    status: 200,
    title: { fr: "Comment jouer", en: "How to play" },
    orange: ["how-to-play-start"],
    // Its eleven sections, « Ton adjoint » among them (docs/design/simplification.md).
    expectOwnContent: (page) => expect(page.locator("article section")).toHaveCount(11),
  },
  {
    paths: CHANGELOG_PATHS,
    switchesTo: CHANGELOG_PATHS,
    status: 200,
    title: { fr: "Nouveautés", en: "What's new" },
    orange: [],
    expectOwnContent: async (page) => {
      await expect(page.locator("article time").first()).toBeVisible();
    },
  },
  {
    paths: ABOUT_PATHS,
    switchesTo: ABOUT_PATHS,
    status: 200,
    title: { fr: "À propos de Late Winner", en: "About Late Winner" },
    orange: [],
    expectOwnContent: (page) => expect(page.locator('article a[href^="mailto:"]')).toBeVisible(),
  },
  {
    paths: PRIVACY_PATHS,
    switchesTo: PRIVACY_PATHS,
    status: 200,
    title: { fr: "Confidentialité · Late Winner", en: "Privacy · Late Winner" },
    orange: [],
    expectOwnContent: async (page, language) => {
      await expect(page.locator("article")).toHaveAttribute("lang", language);
      await expect(page.locator('article a[href^="mailto:"]').first()).toBeVisible();
      await expect(page.locator("footer")).toBeVisible();
    },
  },
];

for (const { locale, language, viewport } of [
  { locale: "fr-FR", language: "fr", viewport: COMPUTER },
  { locale: "fr-FR", language: "fr", viewport: PHONE },
  { locale: "fr-FR", language: "fr", viewport: SMALL_PHONE },
  { locale: "en-GB", language: "en", viewport: PHONE },
] as const) {
  test.describe(`the public pages at ${viewport.width} px, in ${locale}`, () => {
    test.use({ locale, viewport });

    for (const { paths, status, title, orange, expectOwnContent } of PUBLIC_PAGES) {
      const path = paths[language];
      test(`${path} has the game's mark, the language once, the foot's one link, and holds in the window`, async ({ page, context }) => {
        const response = await page.goto(path);
        expect(response?.status()).toBe(status);
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(title[language]);
        await expectOwnContent?.(page, language);

        await expect(page.getByTestId("language-fr")).toHaveCount(1);
        await expect(page.getByTestId("language-en")).toHaveCount(1);
        await expect(page.getByTestId("privacy-link")).toHaveCount(1);
        await expectOrangeActions(page, orange);
        await expectNoSidewaysScroll(page, path);
        await expectThumbTargets(page);

        const mark = page.getByTestId("public-home");
        await expect(mark).toHaveAttribute("href", HOMES[language]);
        await mark.click();
        await expect(page).toHaveURL((url) => url.pathname === HOMES[language]);
        await expect(page.getByTestId("create-save")).toBeVisible();

        // Looking creates nothing but the arrival's cookie, and a missing page is no arrival.
        expect(await cookieNames(context)).toEqual(status === 200 ? [ARRIVAL_COOKIE] : []);
      });
    }
  });
}

for (const { paths, title, switchesTo, status } of PUBLIC_PAGES) {
  test(`${paths.fr} leads to its address in English with the language, and back`, async ({ page }) => {
    await page.goto(paths.fr);
    await waitForReact(page);
    const pageTitle = page.getByRole("heading", { level: 1 });

    await page.getByTestId("language-en").click();
    await expect(page).toHaveURL((url) => url.pathname === switchesTo.en);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    if (status === 200) {
      await expect(pageTitle).toHaveText(title.en);
    }

    await page.getByTestId("language-fr").click();
    await expect(page).toHaveURL((url) => url.pathname === switchesTo.fr);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    if (status === 200) {
      await expect(pageTitle).toHaveText(title.fr);
    }
  });
}
