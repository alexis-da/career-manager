import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createRegisteredUser,
  demoSaveId,
  DEMO_USER_ID,
  deleteUsers,
  insertSeasonResult,
  setSaveDate,
  submitWeekScore,
} from "./db";
import {
  ACTION_ORANGE,
  boxOf,
  createSave,
  expectNoSidewaysScroll,
  expectOrangeActions,
  expectThumbTarget,
  openScreen,
  saveHeader,
  saveIdOf,
  sidewaysOverflow,
  signInAs,
  textOf,
} from "./helpers";

// The Club entry: its overview, the week's challenge and the honours, at the widths where they change shape. On the demo
// save, whose season 2026-27 is over, which has no cup and which nothing here changes: its anonymous owner never plays the
// challenge. What a player does goes on a Lyon of a Google account made for it, one world of 198 clubs that its tests share
// in the order of this file. Its user goes at the end, their saves with them: a challenge save left behind would count
// against the week's cap. After a failure, Playwright starts a new worker, which creates its own.

const LYON = "Olympique Lyonnais";

const COMPUTER = { width: 1280, height: 800 };
const SMALL_COMPUTER = { width: 1024, height: 800 };
const TABLET = { width: 768, height: 1024 };
const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 360, height: 780 };

test.use({ viewport: COMPUTER });

/** The demo save's main action: its world has one division a country. */
const MAIN_ACTION = "play-matchday";

/** The demo save's completed season, in the screens' data-testid. */
const SEASON = 2026;
const HONOURS_LINE = `club-honours-season-${SEASON}`;
const SEASON_LINK = `seasons-card-link-${SEASON}`;

/** The challenge's card, as the browser computes its colour. */
const BRIGHT_BLUE = "rgb(31, 59, 255)";

let demo = "";

test.beforeAll(async () => {
  demo = await demoSaveId();
});

/** A screen of a save, opened by its owner, once React has committed the page: a click before goes nowhere. */
async function openAs(page: Page, userId: string, saveId: string, path: string): Promise<void> {
  await signInAs(page, userId);
  await page.goto(`/saves/${saveId}${path}`);
  await page.waitForFunction(() => window.history.state?.__NA === true);
}

const openDemo = (page: Page, path = ""): Promise<void> => openAs(page, DEMO_USER_ID, demo, path);

/** Where a link leads. */
const hrefOf = async (link: Locator): Promise<string> => (await link.getAttribute("href")) ?? "";

/** Every link and button a phone shows on the screen, those of the club's line and of the navigation included. */
async function expectThumbTargets(page: Page): Promise<void> {
  const targets = await page.locator("[data-save-shell] a:visible, [data-save-shell] button:visible").all();
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    await expectThumbTarget(target);
  }
}

/** An amount of the dotation, as formatMoney writes it in French: « 42 M€ », « 850 k€ », « 0 € ». */
const AMOUNT = /^\d+(,\d)? [Mk]?€$/;

/** An amount as the screens write it in French, in euros: « 45,6 M€ » is 45 600 000, « 800 k€ » 800 000. */
function eurosOf(text: string): number {
  const match = /^(\d+)(?:,(\d))?\s*([Mk]?)€$/.exec(text.replace(/\s+/g, " ").trim());
  if (match === null) {
    throw new Error(`not an amount: ${text}`);
  }
  const value = Number(`${match[1]}.${match[2] ?? "0"}`);
  return Math.round(value * (match[3] === "M" ? 1_000_000 : match[3] === "k" ? 1_000 : 1));
}

/** A line of the dotation, by its test id: its label (and its detail under it), then its amount. */
async function expectDotationLine(dotation: Locator, testId: string, label: RegExp | string, amount: RegExp | string): Promise<void> {
  const line = dotation.getByTestId(testId);
  await expect(line.locator("dt")).toHaveText(label);
  await expect(line.locator("dd")).toHaveText(amount);
}

/**
 * The board's last dotation on the demo save, when it was made since the season budgets (an older one has none, and shows
 * its money without it): its second season's, after a first season played, in detail, without a wage cap. Its objectives
 * are none before the season objectives, a bonus or a malus since.
 */
async function expectDemoDotation(finances: Locator): Promise<void> {
  const dotation = finances.getByTestId("club-dotation");
  if ((await dotation.count()) === 0) {
    return;
  }
  await expect(dotation.getByRole("heading")).toHaveText("Saison 2027-28");
  // Lyon's division, the first of France in the demo's world: 18 clubs.
  await expectDotationLine(
    dotation,
    "club-dotation-base",
    /^Dotation de la direction\s*Rang de réputation : \d+(er|e) sur 18 de ta division$/,
    AMOUNT,
  );
  await expectDotationLine(
    dotation,
    "club-dotation-objectives",
    /^Objectifs de la saison passée\s*(Bonus|Malus|Ni bonus ni malus) : × \d,\d\d$/,
    /^(—|[+-]\d+(,\d)? [Mk]?€)$/,
  );
  await expectDotationLine(dotation, "club-dotation-carry-over", /^Report\s*La moitié du budget non dépensé$/, AMOUNT);
  await expectDotationLine(dotation, "club-dotation-total", "Budget de la saison", AMOUNT);
  await expect(dotation.getByTestId("club-dotation-wage-budget")).toHaveCount(0);
  await expect(dotation.getByTestId("club-dotation-start")).toHaveCount(0);
}

/** The president's confidence: its figure, 1 to 99, on a gauge of 0 to 99, its words, and that it acts on nothing. */
async function expectConfidence(objectives: Locator): Promise<void> {
  const confidence = objectives.getByTestId("club-confidence");
  await expect(confidence).toHaveAttribute("data-confidence", /^\d+$/);
  const value = Number(await confidence.getAttribute("data-confidence"));
  expect(value).toBeGreaterThanOrEqual(1);
  expect(value).toBeLessThanOrEqual(99);
  const gauge = confidence.getByRole("meter");
  await expect(gauge).toHaveAttribute("aria-valuenow", String(value));
  await expect(gauge).toHaveAttribute("aria-valuemin", "0");
  await expect(gauge).toHaveAttribute("aria-valuemax", "99");
  // Before the club's fifth league match, the president gives his manager time (OBJECTIVES_JUDGED_FROM_MATCH).
  await expect(confidence).toContainText("Il te laisse le temps de démarrer");
  await expect(confidence).toContainText("La direction ne renvoie jamais son entraîneur : un échec réduit seulement le budget suivant.");
}

/**
 * The president's objectives on the demo save, when it was made since the season objectives (an older one has none, and
 * no card): its second season's, on its first day, the optional one still to choose. One division a country in its world:
 * the league's objective is the only one imposed, without a cup.
 */
async function expectDemoObjectives(page: Page): Promise<void> {
  const objectives = page.getByTestId("club-objectives");
  if ((await objectives.count()) === 0) {
    return;
  }
  await expect(objectives.getByRole("heading", { level: 2 })).toHaveText("Objectifs du président");
  await expect(objectives).toContainText("Saison 2027-28");
  const imposed = objectives.locator("[data-objective]");
  await expect(imposed).toHaveCount(1);
  await expect(imposed).toHaveAttribute("data-objective", "RANKING");
  await expect(imposed).toContainText("Classement · Imposé par la direction");
  await expect(imposed.getByTestId("objective-status")).toHaveText("Trop tôt pour juger");
  await expect(objectives.getByTestId("club-objectives-proposals").locator("[data-proposal]")).toHaveCount(3);
  await expect(objectives.getByTestId("club-objectives-choose")).toHaveAttribute("href", `/saves/${demo}/season-start`);
  await expectConfidence(objectives);
}

/**
 * The screen of the demo save, whatever the width: its head, its money, the week's challenge, its objectives, its season
 * and the settings.
 */
async function expectClubScreen(page: Page): Promise<void> {
  await expect(page.getByTestId("club-title")).toHaveText("Club");
  // The manager's title beside the pill's line: the rookie's until one is chosen (missions v2).
  await expect(page.getByTestId("club-manager")).toContainText("Manager : Test · 2e saison");
  await expect(page.getByTestId("club-manager-title")).toHaveText("Novice");
  await expect(page.getByTestId("section-tabs").getByRole("link")).toHaveText(["Club", "Défi", "Histoire", "Récompenses"]);
  await expect(page.getByTestId("nav-club-overview")).toHaveAttribute("aria-current", "page");

  const finances = page.getByTestId("club-finances");
  await expect(finances.getByTestId("club-budget")).toHaveText(/^\d+(,\d+)? M€$/);
  // The budget is the only limit (docs/design/simplification.md § 6.8): no payroll, no bar, no room.
  for (const wage of ["club-payroll", "club-wage-bar", "club-wage-room"]) {
    await expect(finances.getByTestId(wage)).toHaveCount(0);
  }
  await expect(finances).not.toContainText(/salari/i);
  // The money is read only here: nothing of what comes in.
  await expect(page.getByRole("main")).not.toContainText(/recette/i);
  await expectDemoDotation(finances);
  // A worldVersion 1 save: neither a cup nor a European competition, no prize money.
  await expect(finances.getByTestId("club-prizes")).toHaveCount(0);

  const challenge = page.getByTestId("club-challenge");
  await expect(challenge).toHaveCSS("background-color", BRIGHT_BLUE);
  await expect(challenge.getByTestId("club-challenge-status")).toHaveText(/^.+ · 10 journées$/);
  const link = challenge.getByTestId("club-challenge-link");
  await expect(link).toHaveText("Voir le défi");
  await expect(link).toHaveAttribute("href", `/saves/${demo}/challenge`);
  await expectOrangeActions(page, ["club-challenge-link"]);

  await expectDemoObjectives(page);

  const season = page.getByTestId("club-honours").getByTestId(HONOURS_LINE);
  await expect(season).toContainText("2026-27");
  await expect(season).toHaveAttribute("href", new RegExp(`^/saves/${demo}/seasons/[^/]+$`));

  const settings = page.getByTestId("club-settings");
  await expect(settings.getByRole("heading", { level: 2 })).toHaveText("Réglages");
  // What its assistant takes care of comes first (docs/design/simplification.md § 2.3, § 3.3): its two switches.
  await expect(settings.getByRole("heading", { level: 3 }).first()).toHaveText("Ton adjoint s'occupe de");
  await expect(settings.getByTestId("settings-assistant-lineup")).toHaveAttribute("role", "switch");
  await expect(settings.getByTestId("settings-assistant-contracts")).toHaveAttribute("role", "switch");
  await expect(settings.getByTestId("language-fr")).toHaveAttribute("aria-pressed", "true");
  await expect(settings.getByTestId("language-en")).toHaveAttribute("aria-pressed", "false");
  await expect(settings.getByTestId("settings-account")).toBeVisible();
  await expect(settings.getByTestId("settings-saves")).toBeVisible();
  // The public pages in the save's language.
  await expect(settings.getByTestId("settings-change-save")).toHaveAttribute("href", "/fr");
  await expect(settings.getByTestId("settings-privacy")).toHaveAttribute("href", "/fr/confidentialite");

  await expectNoSidewaysScroll(page, "club");
}

/** Its season's line leads to its page. */
async function expectSeasonFromHonours(page: Page): Promise<void> {
  const season = page.getByTestId(HONOURS_LINE);
  const path = await hrefOf(season);
  await season.click();
  await expect(page).toHaveURL((url) => url.pathname === path);
  await expect(page.getByTestId("season-title")).toBeVisible();
}

for (const viewport of [COMPUTER, SMALL_COMPUTER]) {
  test.describe(`the Club screen at ${viewport.width} px`, () => {
    test.use({ viewport });

    test("sums the club up, with the last season's card drawn beside its seasons, to download", async ({ page }) => {
      await openDemo(page, "/club");
      await expectClubScreen(page);

      const honours = page.getByTestId("club-honours");
      const preview = honours.locator("img");
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute("src", /\/card\?lang=fr&v=\d+&format=square$/);
      await preview.scrollIntoViewIfNeeded();
      await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1080);
      await expect(honours.getByTestId("season-card-download")).toBeVisible();

      await expectSeasonFromHonours(page);
    });
  });
}

for (const viewport of [PHONE, SMALL_PHONE]) {
  test.describe(`the Club screen at ${viewport.width} px`, () => {
    test.use({ viewport });

    test("sums the club up, every target a thumb high, and never asks for the card's PNG", async ({ page }) => {
      const cards: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.endsWith("/card")) {
          cards.push(request.url());
        }
      });

      await openDemo(page, "/club");
      await expectClubScreen(page);
      await expectThumbTargets(page);

      const honours = page.getByTestId("club-honours");
      await expect(honours.locator("img")).toBeHidden();
      await expect(honours.getByTestId("season-card-download")).toHaveCount(0);
      await expect(honours.getByTestId("season-card-share")).toHaveCount(0);

      // Neither the preview, hidden, nor the buttons, never mounted, even with the card in sight.
      await honours.scrollIntoViewIfNeeded();
      await page.waitForLoadState("networkidle");
      expect(cards).toEqual([]);

      await expectSeasonFromHonours(page);
    });
  });
}

test("has two rows of cards on a computer, and the sidebar's action steps back on every screen of the entry", async ({ page }) => {
  await openDemo(page, "/club");

  // The finances beside the challenge, and under them the honours beside the settings.
  const finances = await boxOf(page.getByTestId("club-finances"));
  const challenge = await boxOf(page.getByTestId("club-challenge"));
  const honours = await boxOf(page.getByTestId("club-honours"));
  const settings = await boxOf(page.getByTestId("club-settings"));
  expect(challenge.x).toBeGreaterThanOrEqual(finances.x + finances.width);
  expect(challenge.y).toBeCloseTo(finances.y, 0);
  expect(honours.y).toBeGreaterThanOrEqual(finances.y + finances.height);
  expect(settings.x).toBeGreaterThanOrEqual(honours.x + honours.width);
  expect(settings.y).toBeCloseTo(honours.y, 0);

  const action = saveHeader(page).getByTestId(MAIN_ACTION);
  await expect(action).toBeVisible();
  await expect(action).not.toHaveCSS("background-color", ACTION_ORANGE);
  for (const [screen, title] of [
    ["challenge", "challenge-title"],
    ["seasons", "seasons-title"],
  ] as const) {
    await openScreen(page, screen);
    await expect(page.getByTestId(title)).toBeVisible();
    await expect(action).toBeVisible();
    await expect(action).not.toHaveCSS("background-color", ACTION_ORANGE);
  }
});

test("switches the language from the settings and back, keeps it in its cookie, and stays on the screen", async ({ page, context }) => {
  await openDemo(page, "/club");
  const language = page.locator("html");
  const french = page.getByTestId("language-fr");
  const english = page.getByTestId("language-en");
  const honoursTab = page.getByTestId("nav-seasons");
  const chosenCookie = async () => (await context.cookies()).find((cookie) => cookie.name === "lw_lang");
  await expect(language).toHaveAttribute("lang", "fr");
  await expect(honoursTab).toHaveText("Histoire");
  expect(await chosenCookie()).toBeUndefined();

  await english.click();
  await expect(language).toHaveAttribute("lang", "en");
  await expect(honoursTab).toHaveText("History");
  await expect(english).toHaveAttribute("aria-pressed", "true");
  await expect(french).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveURL((url) => url.pathname === `/saves/${demo}/club`);
  const chosen = await chosenCookie();
  expect(chosen).toMatchObject({ value: "en", httpOnly: true, sameSite: "Lax" });
  // About a year (not simulation code: the clock is fine here).
  expect(chosen?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 360 * 86_400);

  // The browser still prefers French: the cookie wins, on the next load too.
  await page.reload();
  await expect(language).toHaveAttribute("lang", "en");

  await french.click();
  await expect(language).toHaveAttribute("lang", "fr");
  await expect(honoursTab).toHaveText("Histoire");
  await expect(french).toHaveAttribute("aria-pressed", "true");
  await expect(english).toHaveAttribute("aria-pressed", "false");
  expect((await chosenCookie())?.value).toBe("fr");
});

for (const viewport of [COMPUTER, TABLET]) {
  test.describe(`the dashboard at ${viewport.width} px`, () => {
    test.use({ viewport });

    test("has neither the language nor the trophy: they have left the sidebar and the club's line for the entry", async ({ page }) => {
      await openDemo(page);
      await expect(page.getByTestId("dashboard-title")).toBeVisible();
      await expect(page.getByTestId("header-club")).toBeVisible();
      for (const gone of ["header-challenge", "language-fr", "language-en"]) {
        await expect(page.getByTestId(gone)).toHaveCount(0);
      }
    });
  });
}

test("offers Google to an anonymous player, whose one save is the demo", async ({ page }) => {
  await openDemo(page, "/club");
  const account = page.getByTestId("settings-account");
  await expect(account.getByTestId("google-sign-in")).toBeVisible();
  await expect(account.getByTestId("sign-out")).toHaveCount(0);
  await expect(account.getByTestId("account-name")).toHaveCount(0);
  await expect(page.getByTestId("settings-saves")).toContainText("1 sur 1 utilisée");
});

test("leads from the dashboard's card to the challenge's tab", async ({ page }) => {
  await openDemo(page);
  await page.getByTestId("dashboard-challenge").getByRole("link").click();
  await expect(page).toHaveURL((url) => url.pathname === `/saves/${demo}/challenge`);
  await expect(page.getByTestId("challenge-title")).toBeVisible();
  await expect(page.getByTestId("nav-challenge")).toHaveAttribute("aria-current", "page");
});

/** The tab of a player who has not played the week's challenge, as the demo's owner has not. */
async function expectChallengeTab(page: Page): Promise<void> {
  await expect(page.getByTestId("challenge-title")).toHaveText("Défi de la semaine");
  await expect(page.getByTestId("nav-challenge")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("challenge-week")).toHaveText(/^Semaine \d+ · fin lundi \d{2}:\d{2}$/);
  await expect(page.getByTestId("challenge-competition")).toHaveText(/^(Allemagne|Angleterre|Espagne|France|Italie) — Division [12]$/);
  await expect(page.getByTestId("challenge-managers")).toHaveText(/^Fin le .+ \(heure de Paris\)$/);
  await expect(page.getByRole("heading", { name: /^Classement de la semaine \d+$/ })).toBeVisible();
  await expect(page.getByText("Personne n'a encore terminé le défi cette semaine.")).toBeVisible();

  // Its club on the screen, never in the title: a page's title leaves the game.
  const club = await textOf(page.getByTestId("challenge-club"));
  expect(club).not.toBe("");
  await expect(page).toHaveTitle("Défi de la semaine · Late Winner");
  expect(await page.title()).not.toContain(club);

  await expect(page.getByTestId("challenge-play")).toHaveText("Jouer le défi");
  await expectOrangeActions(page, ["challenge-play"]);
  await expectNoSidewaysScroll(page, "challenge");
}

test("sets the week's challenge out, « Jouer le défi » the one orange, the sidebar's action beside it", async ({ page }) => {
  await openDemo(page, "/challenge");
  await expectChallengeTab(page);
  await expect(saveHeader(page).getByTestId(MAIN_ACTION)).toBeVisible();
});

test.describe("the challenge's tab at 390 px", () => {
  test.use({ viewport: PHONE });

  test("sets the week's challenge out, every target a thumb high", async ({ page }) => {
    await openDemo(page, "/challenge");
    await expectChallengeTab(page);
    await expectThumbTargets(page);
  });
});

for (const viewport of [COMPUTER, PHONE, SMALL_PHONE]) {
  test.describe(`a score of the week at ${viewport.width} px`, () => {
    test.use({ viewport });

    test("ranks it by first name on the tab, and heads the Club screen's card with it from 1024 px", async ({ page }) => {
      // The page creates the week's challenge when missing.
      await openDemo(page, "/challenge");
      const { id } = await createRegisteredUser("Zélie Durand");
      try {
        await submitWeekScore(id, { points: 17, goalDiff: 6, goalsFor: 15 });
        await page.reload();

        const row = page.locator("[data-ranking-row]").filter({ hasText: "Zélie" });
        await expect(row.locator("td")).toHaveText(["1", "Zélie", "17", "+6", "15"]);
        await expect(page.getByTestId("challenge-managers")).toHaveText(/^1 manager au classement · fin le .+ \(heure de Paris\)$/);
        const table = page.locator("table").filter({ has: row });
        expect(await sidewaysOverflow(table.locator("xpath=.."))).toBeLessThanOrEqual(0);
        await expectNoSidewaysScroll(page, "ranking");

        await openScreen(page, "club");
        await expect(page.getByTestId("club-title")).toBeVisible();
        const ranking = page.getByTestId("club-challenge-ranking");
        await expect(ranking).toBeVisible({ visible: viewport.width >= SMALL_COMPUTER.width });
        // In the page at every width, the same line: not by its role, which a hidden list does not have.
        await expect(ranking.locator("li")).toHaveText([/^1\s*Zélie\s*17 pts$/]);
      } finally {
        // Even when a step failed: the week's ranking is every test's.
        await deleteUsers([id]);
      }
    });
  });
}

test.describe("the honours at 390 px", () => {
  test.use({ viewport: PHONE });

  test("lead to the season from anywhere on its card, every target a thumb high, on its page too", async ({ page }) => {
    await openDemo(page, "/seasons");
    const link = page.getByTestId(SEASON_LINK);
    await expectThumbTarget(link);
    await expectThumbTargets(page);
    const path = await hrefOf(link);

    // Far from the link, at the right of the card: at the foot of its left side.
    const card = page.locator(`tr[data-season="${SEASON}"]`);
    const { height } = await boxOf(card);
    await card.click({ position: { x: 20, y: height - 20 } });
    await expect(page).toHaveURL((url) => url.pathname === path);
    await expect(page.getByTestId("season-title")).toBeVisible();
    await expect(page.getByTestId("season-card-download")).toBeVisible();
    await expectThumbTargets(page);
  });
});

for (const viewport of [COMPUTER, PHONE]) {
  test.describe(`a season's page at ${viewport.width} px`, () => {
    test.use({ viewport });

    test("has one orange action, the card's, and leads on to the season the save has gone on to", async ({ page }) => {
      await openDemo(page, "/seasons");
      const link = page.getByTestId(SEASON_LINK);
      const path = await hrefOf(link);
      await link.click();
      await expect(page).toHaveURL((url) => url.pathname === path);
      await expect(page.getByTestId("season-title")).toHaveText("Saison terminée");
      await expect(page.getByTestId("season-card-image")).toBeVisible();

      // « Partager » where the browser shares files, « Télécharger » elsewhere: either way, one of them.
      await expect(page.getByTestId("season-card-download")).toBeVisible();
      const shares = (await page.getByTestId("season-card-share").count()) > 0;
      await expectOrangeActions(page, [shares ? "season-card-share" : "season-card-download"]);
      await expectNoSidewaysScroll(page, "season");

      // The demo stands on the first day of 2027-28, the season after the only one it has finished: its start screen.
      const next = page.getByTestId("season-next");
      await expect(next).toHaveText("Cap sur la saison 2027-28");
      await expect(next).toHaveAttribute("href", `/saves/${demo}/season-start`);
      await next.click();
      await expect(page).toHaveURL((url) => url.pathname === `/saves/${demo}/season-start`);
      await expect(page.getByTestId("season-start-title")).toBeVisible();
    });
  });
}

test.describe("in English, at 390 px", () => {
  test.use({ locale: "en-GB", viewport: PHONE });

  test("names the tabs, the manager's season, the money and the settings as a British player reads them", async ({ page }) => {
    await openDemo(page, "/club");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("section-tabs").getByRole("link")).toHaveText(["Club", "Challenge", "History", "Rewards"]);
    await expect(page.getByTestId("club-manager")).toContainText("Manager: Test · 2nd season");
    await expect(page.getByTestId("club-manager-title")).toHaveText("Rookie");
    await expect(page.getByTestId("club-budget")).toHaveText(/^€\d+(\.\d+)?m$/);
    await expect(page.getByTestId("club-finances")).not.toContainText(/wage/i);
    await expect(page.getByTestId("club-challenge-link")).toHaveText("See the challenge");
    // The president's objectives, on a demo made since them.
    const objectives = page.getByTestId("club-objectives");
    if ((await objectives.count()) > 0) {
      await expect(objectives.getByRole("heading", { level: 2 })).toHaveText("Chairman's objectives");
      await expect(objectives.getByTestId("club-confidence")).toContainText(
        "The board never sacks its manager: a failure only cuts the next budget.",
      );
    }
    await expect(page.getByTestId("club-settings").getByRole("heading", { level: 2 })).toHaveText("Settings");
    await expect(page.getByTestId("club-settings").getByRole("heading", { level: 3 }).first()).toHaveText("Your assistant takes care of");
    await expect(page.getByTestId("settings-saves")).toContainText("1 of 1 used");
    await expect(page.getByTestId("settings-change-save")).toHaveText("Switch career");
    await expectNoSidewaysScroll(page, "club");

    await openScreen(page, "challenge");
    await expect(page.getByTestId("challenge-title")).toHaveText("Weekly challenge");
    await expect(page.getByTestId("challenge-week")).toHaveText(/^Week \d+ · ends Monday \d{2}:\d{2}$/);
    await expectNoSidewaysScroll(page, "challenge");

    await openScreen(page, "seasons");
    await expect(page.getByTestId("seasons-title")).toHaveText("History");
    await expect(page.getByTestId("trophy-room").getByRole("heading")).toHaveText("Trophy room");
    await expect(page.getByTestId("career-records").getByRole("heading", { level: 2 })).toHaveText("Records");
    await expect(page.getByTestId("career-legends").getByRole("heading", { level: 2 })).toHaveText("Legends");
    await expect(page.getByTestId("history-current")).toContainText("2027-28 season · under way");
    await expectNoSidewaysScroll(page, "history");
  });
});

for (const locale of ["fr-FR", "en-GB"]) {
  test.describe(`${SMALL_PHONE.width} px wide, in ${locale}`, () => {
    test.use({ locale, viewport: SMALL_PHONE });

    test("never scrolls sideways on the entry's screens, nor on a season's page", async ({ page }) => {
      await openDemo(page, "/club");
      await expect(page.getByTestId("club-title")).toBeVisible();
      await expectNoSidewaysScroll(page, "club");

      await openScreen(page, "challenge");
      await expect(page.getByTestId("challenge-title")).toBeVisible();
      await expectNoSidewaysScroll(page, "challenge");

      await openScreen(page, "seasons");
      await expect(page.getByTestId("seasons-title")).toBeVisible();
      await expectNoSidewaysScroll(page, "honours");

      await page.getByTestId(SEASON_LINK).click();
      await expect(page.getByTestId("season-title")).toBeVisible();
      await expect(page.getByTestId("season-card-image")).toBeVisible();
      await expectNoSidewaysScroll(page, "season");
    });
  });
}

for (const viewport of [COMPUTER, PHONE, SMALL_PHONE]) {
  test(`tells the demo's career at ${viewport.width} px: its trophies, records and players on their way, the season under way, its card`, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    await openDemo(page, "/seasons");
    await expect(page.getByTestId("seasons-title")).toHaveText("Histoire");
    await expect(page.getByTestId("history-seasons")).toHaveText("1 saison terminée · 2026-27 → 2026-27");
    // A save of the first divisions only: the league's title alone, won or to conquer.
    const tiles = page.getByTestId("trophy-room").getByTestId("trophy-tile");
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first()).toHaveAttribute("data-kind", "championD1");
    const records = page.getByTestId("career-records");
    await expect(records.getByTestId("record-biggest-win")).toContainText(/^Plus large victoire\s*\d+-\d+\s*contre /);
    await expect(records.getByTestId("record-unbeaten")).toContainText(/^Plus longue invincibilité\s*\d+ match/);
    await expect(records.getByTestId("record-points-d1")).toContainText("2026-27");
    await expect(records.getByTestId("record-top-scorer")).toContainText(/\d+ buts?/);
    await expect(records.getByTestId("record-most-capped")).toContainText(/\d+ matchs?/);
    // One season: no legend yet, the players at the club on their way, above 75 points, three at most.
    const legends = page.getByTestId("career-legends");
    await expect(legends.getByTestId("career-legends-none")).toBeVisible();
    const onTheWay = await legends.getByTestId("on-the-way").evaluateAll((items) => items.map((item) => Number(item.getAttribute("data-index"))));
    expect(onTheWay.length).toBeLessThanOrEqual(3);
    expect(onTheWay.every((index) => index > 75)).toBe(true);
    await expect(legends.getByTestId("career-legends-all")).toHaveCount(0);
    await expect(page.getByTestId("history-current")).toContainText("Saison 2027-28 · en cours");
    await expect(page.locator('tr[data-season="2026"]')).toContainText(/Buteur : .+ · \d+ buts?/);
    await expectNoSidewaysScroll(page, "history");

    // The career's card for one completed season: a PNG for its owner, 404 for a visitor and for another count.
    const landscape = await hrefOf(page.getByTestId("history-head").getByTestId("career-card-landscape"));
    expect(landscape).toMatch(/^\/saves\/[^/]+\/seasons\/card\?lang=fr&v=\d+&n=1$/);
    const owned = await page.request.get(landscape);
    expect(owned.status()).toBe(200);
    expect(owned.headers()["content-type"]).toBe("image/png");
    expect((await request.get(landscape)).status()).toBe(404);
    expect((await page.request.get(landscape.replace("n=1", "n=2"))).status()).toBe(404);
  });
}

test.describe("a Google account's Lyon", () => {
  const ACCOUNT_NAME = "Alexis Durand";

  let saveId = "";
  let ownerId: string | null = null;
  let email = "";

  test.beforeAll(async ({ browser }) => {
    const owner = await createRegisteredUser(ACCOUNT_NAME);
    ownerId = owner.id;
    email = owner.email;
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signInAs(page, owner.id);
      // A unique name (not simulation code: the clock is fine here).
      await createSave(page, `E2E club ${Date.now()}`, LYON);
      saveId = saveIdOf(page);
    } finally {
      await context.close();
    }
  });

  test.afterAll(async () => {
    // Even after a failure: a leftover challenge save would count against the week's cap.
    await deleteUsers([ownerId]);
  });

  /** A screen of this save, by its owner. */
  const openSave = (page: Page, path: string): Promise<void> => openAs(page, ownerId ?? "", saveId, path);

  test("names the account and its way out, without Google, counts one save of three, and has no season to show yet", async ({ page }) => {
    await openSave(page, "/club");
    const account = page.getByTestId("settings-account");
    await expect(account.getByTestId("account-name")).toHaveText(ACCOUNT_NAME);
    await expect(account).toContainText(email);
    await expect(account.getByTestId("sign-out")).toBeVisible();
    await expect(page.getByTestId("google-sign-in")).toHaveCount(0);
    await expect(page.getByTestId("settings-saves")).toContainText("1 sur 3 utilisée");

    await expect(page.getByTestId("club-manager")).toContainText("Manager : Test E2E · 1re saison");
    await expect(page.getByTestId("club-honours-empty")).toBeVisible();
    await expect(page.getByTestId("club-honours").locator("img")).toHaveCount(0);
    await expect(page.getByTestId("season-card-download")).toHaveCount(0);

    // A long address on the narrowest phone: it holds in the card, its way out still a thumb high.
    await page.setViewportSize(SMALL_PHONE);
    await expectNoSidewaysScroll(page, "account");
    await expectThumbTargets(page);
  });

  test("shows a new career's History tab: every trophy still to conquer, no record yet, no card", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openSave(page, "/seasons");
    await expect(page.getByTestId("history-seasons")).toHaveText("Première saison en cours");
    // Lyon, in the first division of a world with its cups and Europe: no second division's title nor promotion to win.
    const tiles = page.getByTestId("trophy-room").getByTestId("trophy-tile");
    await expect(tiles).toHaveCount(4);
    for (const [index, kind] of ["championD1", "cup", "eu1", "eu2"].entries()) {
      await expect(tiles.nth(index)).toHaveAttribute("data-kind", kind);
      await expect(tiles.nth(index)).toHaveAttribute("data-to-conquer", "true");
      await expect(tiles.nth(index)).toContainText("À conquérir");
    }
    await expect(page.getByTestId("career-records-empty")).toBeVisible();
    await expect(page.getByTestId("career-legends-none")).toBeVisible();
    await expect(page.getByTestId("history-current")).toContainText("Pas encore de match de championnat");
    await expect(page.getByTestId("seasons-empty")).toBeVisible();
    await expect(page.getByTestId("career-card-landscape")).toHaveCount(0);
    await expectNoSidewaysScroll(page, "history at 390 px");
    await page.setViewportSize(SMALL_PHONE);
    await expectNoSidewaysScroll(page, "history at 360 px");
  });

  test("gives its first season's budget in one line, the one it started with, and its prize money, down to 360 px", async ({ page }) => {
    await openSave(page, "/club");
    const dotation = page.getByTestId("club-finances").getByTestId("club-dotation");
    await expect(dotation.getByRole("heading")).toHaveText("Saison 2026-27");
    // Nothing bought or sold yet: the budget it has, but the participation prize of the Pennant Cup, which Lyon plays from
    // its first season, credited after the board's dotation (EUROPE_PRIZES: €1.5m).
    await expectDotationLine(dotation, "club-dotation-start", "Budget de départ", AMOUNT);
    const start = eurosOf(await textOf(dotation.getByTestId("club-dotation-start").locator("dd")));
    const budget = eurosOf(await textOf(page.getByTestId("club-budget")));
    expect(Math.abs(budget - start - 1_500_000)).toBeLessThanOrEqual(100_000);
    for (const detail of [
      "club-dotation-base",
      "club-dotation-objectives",
      "club-dotation-carry-over",
      "club-dotation-total",
      "club-dotation-wage-budget",
    ]) {
      await expect(dotation.getByTestId(detail)).toHaveCount(0);
    }
    // The season's prize money: that participation, nothing from the cup yet.
    const prizes = page.getByTestId("club-finances").getByTestId("club-prizes");
    await expect(prizes.getByRole("heading")).toHaveText("Primes reçues · saison 2026-27");
    await expect(prizes.getByTestId("club-prizes-europe")).toHaveText(/^Primes européennes\s*Coupe des Fanions\s*1,5 M€$/);
    await expect(prizes.getByTestId("club-prizes-europe").locator("dd")).toHaveAttribute("data-amount", "1500000");
    await expect(prizes.getByTestId("club-prizes-cup")).toHaveText(/^Primes de la coupe\s*France — Coupe\s*0 €$/);
    await expect(prizes.getByTestId("club-prizes-cup").locator("dd")).toHaveAttribute("data-amount", "0");
    await expectOrangeActions(page, ["club-challenge-link"]);

    for (const viewport of [PHONE, SMALL_PHONE]) {
      await page.setViewportSize(viewport);
      await expect(dotation).toBeVisible();
      await expect(prizes).toBeVisible();
      await expectNoSidewaysScroll(page, `dotation at ${viewport.width} px`);
    }
  });

  test("sets out the president's objectives, the optional one still to choose, and his confidence, down to 360 px", async ({ page }) => {
    await openSave(page, "/club");
    const objectives = page.getByTestId("club-objectives");
    await expect(objectives.getByRole("heading", { level: 2 })).toHaveText("Objectifs du président");
    await expect(objectives).toContainText("Saison 2026-27");

    // Imposed by the board, too early to tell before a ball is kicked: the league, France's cup, then the Pennant Cup, each
    // with what exceeds it.
    const imposed = objectives.locator("[data-objective]");
    await expect(imposed).toHaveCount(3);
    const [ranking, cup, europe] = [imposed.nth(0), imposed.nth(1), imposed.nth(2)];
    await expect(ranking).toHaveAttribute("data-objective", "RANKING");
    await expect(ranking).toContainText("Classement · Imposé par la direction");
    await expect(ranking).toContainText(/Dépassé (avec le titre|en finissant \d+(er|e) ou mieux)/);
    await expect(cup).toHaveAttribute("data-objective", "CUP");
    await expect(cup).toContainText("Coupe · Imposé par la direction");
    await expect(cup).toContainText(/Atteindre les (seizièmes|huitièmes|quarts) de finale/);
    await expect(cup).toContainText(/Dépassé en atteignant (les|la) /);
    await expect(europe).toHaveAttribute("data-objective", "EUROPE");
    await expect(europe).toContainText("Europe · Imposé par la direction");
    await expect(europe).toContainText(/Atteindre (les barrages|les quarts de finale|les demi-finales) en Europe/);
    await expect(europe).toContainText(/Dépassé en atteignant (les|la|le) /);
    await expect(objectives.getByTestId("objective-status")).toHaveText(["Trop tôt pour juger", "Trop tôt pour juger", "Trop tôt pour juger"]);

    // Three of the four optional objectives, what each asks, the assistant's pick if the player makes none (Jeunesse, or
    // Spectacle when Jeunesse is not proposed), and the way to the choice, on the season's start screen.
    const proposals = objectives.getByTestId("club-objectives-proposals");
    await expect(proposals.locator("[data-proposal]")).toHaveCount(3);
    await expect(proposals).toContainText(/Sans choix, l'adjoint prendra (Jeunesse|Spectacle)\./);
    await expect(objectives.getByTestId("club-objectives-choose")).toHaveAttribute("href", `/saves/${saveId}/season-start`);

    await expectConfidence(objectives);
    // « Voir le défi » keeps the screen's one full orange.
    await expectOrangeActions(page, ["club-challenge-link"]);

    for (const viewport of [PHONE, SMALL_PHONE]) {
      await page.setViewportSize(viewport);
      await expect(objectives).toBeVisible();
      await expectNoSidewaysScroll(page, `objectives at ${viewport.width} px`);
      await expectThumbTarget(objectives.getByTestId("club-objectives-choose"));
    }
  });

  test("plays the challenge from its tab, then finds that save from either career, with no second go", async ({ page }) => {
    await openSave(page, "/challenge");
    await expectOrangeActions(page, ["challenge-play"]);
    await page.getByTestId("challenge-play").click();
    await expect(page).toHaveURL(new RegExp(`/saves/(?!${saveId})[^/]+$`), { timeout: 120_000 });
    const challengeSave = saveIdOf(page);
    await expect(page.getByTestId("challenge-banner")).toBeVisible();

    const expectOwnGame = async (): Promise<void> => {
      const own = page.getByTestId("challenge-own");
      await expect(own.getByTestId("challenge-own-progress")).toHaveText("Journée 0 / 10");
      const resume = own.getByTestId("challenge-resume");
      await expect(resume).toHaveText("Reprendre ma partie");
      await expect(resume).toHaveAttribute("href", `/saves/${challengeSave}`);
      await expect(page.getByTestId("challenge-play")).toHaveCount(0);
      await expect(page.getByText("Relancer")).toHaveCount(0);
      await expectOrangeActions(page, ["challenge-resume"]);
    };

    // In the challenge save, then in the career it came from: the player's game is the same.
    await openScreen(page, "challenge");
    await expectOwnGame();
    await openSave(page, "/challenge");
    await expectOwnGame();

    // The overview says as much, and a challenge save is not one of the three.
    await openSave(page, "/club");
    await expect(page.getByTestId("club-challenge-status")).toHaveText("Journée 0 / 10");
    await expect(page.getByTestId("settings-saves")).toContainText("1 sur 3 utilisée");

    await openScreen(page, "challenge");
    await page.getByTestId("challenge-resume").click();
    await expect(page).toHaveURL((url) => url.pathname === `/saves/${challengeSave}`);
    await expect(page.getByTestId("challenge-banner")).toBeVisible();
  });

  // Last: nothing can be played after a date moved by hand.
  test("has no way on from a season older than the last one over", async ({ page }) => {
    const seasonId = await insertSeasonResult(saveId);
    // Two seasons on: nothing here reads more than the date.
    await setSaveDate(saveId, new Date(Date.UTC(2028, 6, 1)));

    await openSave(page, `/seasons/${seasonId}`);
    await expect(page.getByTestId("season-title")).toBeVisible();
    await expect(page.getByTestId("season-summary")).toContainText("France — Division 1");
    await expect(page.getByTestId("season-next")).toHaveCount(0);
  });
});
