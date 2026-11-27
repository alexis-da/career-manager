import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { parse } from "dotenv";
import { createAnonymousUser, deleteUsers } from "./db";
import { boxOf, expectNoSidewaysScroll, expectThumbTarget, signInAs, textOf, waitForReact } from "./helpers";

// The players' progression in the squad (docs/design/effectif-adjoint.md § 3): the summer passed beside each rating, the
// summer to come, the help sentence, the « Jeunes » view and the sheet's « Progression », at 1280, 390 and 360 px. On a
// worldVersion 1 twin of the demo save whose first season is played and turned, six dates of its second played
// (e2e/progression-save.mts: Lyon), for an anonymous user of its own, deleted with its save at the end. After a failure,
// Playwright starts a new worker, which makes its own.

const COMPUTER = { width: 1280, height: 800 };

/** The colours of a summer passed: up in --win, down in --loss. */
const GREEN = "rgb(74, 222, 128)";
const RED = "rgb(248, 113, 113)";

/**
 * The oldest of the « Jeunes » view, and an age at which a sheet surely tells the decline: 31 on the next 1 July at least
 * (a player of 30 whose birthday has passed is 30 then still, and loses nothing).
 */
const YOUNG_MAX_AGE = 21;
const DECLINING_AGE = 31;

const PHONES = [
  {
    name: "390 × 844, in French",
    locale: "fr-FR",
    viewport: { width: 390, height: 844 },
    says: {
      help: "Tes joueurs progressent l'été, d'autant plus qu'ils jouent en championnat.",
      young: /^Jeunes · (\d+)$/,
      expected: /^\+\d+ prévu$/,
      potential: /^potentiel \d+$/,
      summer: /^Cet été, environ [+−]?\d+$/i,
    },
  },
  {
    name: "360 × 780, in English",
    locale: "en-GB",
    viewport: { width: 360, height: 780 },
    says: {
      help: "Your players improve each summer, all the more if they play league matches.",
      young: /^Under-21s · (\d+)$/,
      expected: /^\+\d+ expected$/,
      potential: /^potential \d+$/,
      summer: /^This summer, about [+−]?\d+$/i,
    },
  },
];

const run = promisify(execFile);

let saveId = "";
const owners: string[] = [];

test.use({ viewport: COMPUTER });

test.beforeAll(async () => {
  // A whole season played by the script, its turn, then six dates: some 15 seconds on a fast machine, minutes on CI.
  test.setTimeout(600_000);
  const userId = await createAnonymousUser(new Date());
  owners.push(userId);
  const databaseUrl = parse(readFileSync(".env.test")).DATABASE_URL_TEST;
  const { stdout } = await run("npx", ["tsx", "e2e/progression-save.mts", userId], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    shell: process.platform === "win32",
    maxBuffer: 16 * 1024 * 1024,
  });
  saveId = stdout.trim().split("\n").at(-1)?.trim() ?? "";
  expect(saveId).toMatch(/^\S+$/);
});

test.afterAll(async () => {
  await deleteUsers(owners);
});

/** The squad of the save, opened by its owner once React has committed the page. */
async function openSquad(page: Page): Promise<void> {
  await signInAs(page, owners[owners.length - 1]);
  await page.goto(`/saves/${saveId}/squad`);
  await waitForReact(page);
}

const rowsOf = (page: Page): Locator => page.getByTestId("squad-row");

/** What is shown of an element, at this width: the copy a card or the table hides is left out. */
const shown = (scope: Locator, testId: string): Locator => scope.locator(`[data-testid="${testId}"]:visible`);

/** A row's age: the table's figure, or a card's « 19 ans », whichever its cell shows at this width. */
const ageOf = async (row: Locator): Promise<number> => Number(/\d+/.exec(await textOf(row.locator("td").nth(2).locator("span:visible")))?.[0]);

/** The change an element carries, in its data-change. */
const changeOf = async (locator: Locator): Promise<number> => Number(await locator.getAttribute("data-change"));

/** What a progression writes, without the words its screen readers get. */
const labelOf = (progression: Locator): Promise<string> => textOf(progression.locator("span[aria-hidden]").last());

/** Every row's age, in the order of the list. */
async function agesOf(page: Page): Promise<number[]> {
  const ages: number[] = [];
  for (const row of await rowsOf(page).all()) {
    ages.push(await ageOf(row));
  }
  return ages;
}

/** The summer passed: up in green, down in red, its arrow drawn; never at 0. */
async function expectSummerPassed(last: Locator): Promise<number> {
  const change = await changeOf(last);
  expect(change).not.toBe(0);
  await expect(last).toHaveCSS("color", change > 0 ? GREEN : RED);
  await expect(last.locator(change > 0 ? "svg.lucide-arrow-up" : "svg.lucide-arrow-down")).toBeVisible();
  expect(await labelOf(last)).toBe(change > 0 ? `+${change}` : `−${-change}`);
  return change;
}

test("shows each player's summer passed and to come, sorts by it, and has a view of the young players", async ({ page }) => {
  await openSquad(page);
  await expect(page.getByTestId("squad-help")).toHaveText("Tes joueurs progressent l'été, d'autant plus qu'ils jouent en championnat.");
  const rows = rowsOf(page);
  const count = await rows.count();
  expect(count).toBeGreaterThan(20);

  // Beside the rating, in its cell: the players of the world all progressed at the turn, some up and some down.
  const changes: number[] = [];
  for (const row of await rows.all()) {
    const last = shown(row, "player-last-progression");
    if ((await last.count()) > 0) {
      await expect(row.locator("td").nth(3).getByTestId("player-last-progression")).toBeVisible();
      changes.push(await expectSummerPassed(last));
    }
  }
  expect(changes.some((change) => change > 0)).toBe(true);
  expect(changes.some((change) => change < 0)).toBe(true);
  // A young player of the summer's academy has no rating of before: his badge, no arrow.
  for (const row of await rows.filter({ has: page.getByTestId("player-badge-young") }).all()) {
    await expect(shown(row, "player-last-progression")).toHaveCount(0);
  }

  // The summer to come, in its column: a point at least, for a player with room.
  const column = page.getByTestId("squad-column-expected-progression");
  await expect(column).toHaveText("Cet été");
  const expected = shown(page.getByTestId("squad-table"), "player-expected-progression");
  expect(await expected.count()).toBeGreaterThan(0);
  for (const progression of await expected.all()) {
    expect(await changeOf(progression)).toBeGreaterThan(0);
    expect(await labelOf(progression)).toMatch(/^\+\d+ prévu$/);
  }
  await expectNoSidewaysScroll(page, "squad");

  // Sorted by it, the best first; nothing to expect last.
  await column.click();
  await expect(page.getByRole("columnheader").filter({ has: column })).toHaveAttribute("aria-sort", "descending");
  const sortedChanges: number[] = [];
  for (const row of await rows.all()) {
    const progression = shown(row, "player-expected-progression");
    sortedChanges.push((await progression.count()) === 0 ? 0 : await changeOf(progression));
  }
  expect(sortedChanges).toEqual([...sortedChanges].sort((a, b) => b - a));

  // The young players' view: the 21-year-olds and younger alone, their league minutes in the value's place.
  const young = (await agesOf(page)).filter((age) => age <= YOUNG_MAX_AGE).length;
  const toggle = page.getByTestId("squad-young-toggle");
  await expect(toggle).toHaveText(`Jeunes · ${young}`);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("squad-young-intro")).toBeVisible();
  await expect(rows).toHaveCount(young);
  expect((await agesOf(page)).every((age) => age <= YOUNG_MAX_AGE)).toBe(true);
  await expect(page.getByTestId("squad-column-league-minutes")).toBeVisible();
  await expect(page.getByTestId("squad-column-market-value")).toHaveCount(0);
  for (const row of await rows.all()) {
    const gauge = shown(row, "player-league-minutes");
    await expect(gauge).toBeVisible();
    expect(Number(await gauge.getAttribute("data-minutes"))).toBeGreaterThanOrEqual(0);
  }
  await expectNoSidewaysScroll(page, "young players");

  // A young player of the club's last season: his curve at the club, his room, and the summer his minutes bring.
  let opened = false;
  for (const row of await rows.all()) {
    const last = shown(row, "player-last-progression");
    if ((await last.count()) === 0) {
      continue;
    }
    const change = await changeOf(last);
    await row.getByTestId("squad-player-open").click();
    const section = page.getByTestId("player-sheet").getByTestId("player-sheet-progression");
    await expect(section).toBeVisible();
    expect(await changeOf(section.getByTestId("player-last-progression"))).toBe(change);
    const curve = section.getByTestId("player-progression-curve");
    await expect(curve).toBeVisible();
    expect(Number(await curve.getAttribute("data-points"))).toBeGreaterThanOrEqual(2);
    await expect(section.getByTestId("player-sheet-potential")).toHaveText(/^Potentiel \d+ · (marge \d+|atteint)$/);
    const summer = section.getByTestId("player-sheet-summer");
    if ((await summer.count()) > 0) {
      await expect(summer.locator("p").first()).toHaveText(/^Cet été, environ [+−]?\d+$/i);
      await expect(summer.getByTestId("player-sheet-bounds")).toHaveText(/^Sans jouer : [+−]?\d+ · titulaire : \+\d+$/);
      await expect(summer.getByTestId("player-league-minutes")).toBeVisible();
    }
    opened = true;
    break;
  }
  expect(opened).toBe(true);

  // Beside the sheet, the table keeps the position, the name, the age, the rating and its arrow, the summer and « Le
  // lancer » (docs/design/effectif-adjoint.md § 9): the form leaves it, as it leaves the young players' cards.
  for (const key of ["position", "name", "age", "overall", "expected-progression", "launch"]) {
    await expect(page.getByTestId(`squad-column-${key}`)).toBeVisible();
  }
  for (const key of ["form", "fitness", "league-minutes", "contract-until"]) {
    await expect(page.getByTestId(`squad-column-${key}`)).toBeHidden();
  }
  await expectNoSidewaysScroll(page, "sheet beside the young players");

  // Back to the whole squad: a player past 30 has the decline his age brings on his sheet, and nothing to expect.
  await page.keyboard.press("Escape");
  await toggle.click();
  await expect(rows).toHaveCount(count);
  await expect(page.getByTestId("squad-column-market-value")).toBeVisible();
  let veteran: Locator | null = null;
  for (const row of await rows.all()) {
    if ((await ageOf(row)) >= DECLINING_AGE) {
      veteran = row;
      break;
    }
  }
  if (veteran === null) {
    throw new Error("No player of 31 or more in the squad");
  }
  await expect(shown(veteran, "player-expected-progression")).toHaveCount(0);
  await veteran.getByTestId("squad-player-open").click();
  const decline = page.getByTestId("player-sheet").getByTestId("player-sheet-decline");
  await expect(decline).toBeVisible();
  expect(await changeOf(decline)).toBeLessThan(0);
  await expect(decline.locator("p").first()).toHaveText(/^Cet été, environ −\d+$/i);
  await expect(page.getByTestId("player-sheet").getByTestId("player-sheet-summer")).toHaveCount(0);
});

for (const { name, locale, viewport, says } of PHONES) {
  test.describe(`on a phone, ${name}`, () => {
    test.use({ locale, viewport, hasTouch: true });

    test("puts the summer passed right of the name, the summer to come on a third line, and a fourth pill for the young players", async ({ page }) => {
      await openSquad(page);
      await expect(page.getByTestId("squad-help")).toHaveText(says.help);
      const rows = rowsOf(page);
      const count = await rows.count();

      // A card's summer passed: right of the name, out of the tile, which has no room for it.
      let arrows = 0;
      let thirdLines = 0;
      for (const row of await rows.all()) {
        const last = shown(row, "player-last-progression");
        if ((await last.count()) > 0) {
          arrows++;
          await expectSummerPassed(last);
          await expect(row.locator("td").nth(3).getByTestId("player-last-progression")).toBeHidden();
          const nameBox = await boxOf(row.getByTestId("squad-player-open"));
          expect((await boxOf(last)).x).toBeGreaterThanOrEqual(nameBox.x + nameBox.width - 1);
        }
        // The summer to come under the age and the form.
        const progression = shown(row, "player-expected-progression");
        if ((await progression.count()) > 0) {
          thirdLines++;
          expect(await labelOf(progression)).toMatch(says.expected);
          const age = await boxOf(row.locator("td").nth(2));
          expect((await boxOf(progression)).y).toBeGreaterThanOrEqual(age.y + age.height - 1);
        }
      }
      expect(arrows).toBeGreaterThan(0);
      expect(thirdLines).toBeGreaterThan(0);
      await expectNoSidewaysScroll(page, "cards");

      // The young players: a pill of their own under the three sorts, the potential and the league minutes on their cards.
      const toggle = page.getByTestId("squad-young-toggle");
      await expectThumbTarget(toggle);
      const young = Number(says.young.exec(await textOf(toggle))?.[1]);
      expect(young).toBe((await agesOf(page)).filter((age) => age <= YOUNG_MAX_AGE).length);
      expect((await boxOf(toggle)).y).toBeGreaterThanOrEqual((await boxOf(page.getByTestId("squad-sort-position"))).y + 44);
      await toggle.tap();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("squad-young-intro")).toBeVisible();
      await expect(rows).toHaveCount(young);
      for (const row of await rows.all()) {
        await expect(row.getByText(says.potential)).toBeVisible();
        await expect(shown(row, "player-league-minutes")).toBeVisible();
      }
      await expectNoSidewaysScroll(page, "young players' cards");

      // A young player's sheet over the page: his « Progression », whole within it.
      await rows.first().getByTestId("squad-player-open").tap();
      const section = page.getByTestId("player-sheet").getByTestId("player-sheet-progression");
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeVisible();
      const summer = section.getByTestId("player-sheet-summer");
      if ((await summer.count()) > 0) {
        await expect(summer.locator("p").first()).toHaveText(says.summer);
      }
      expect((await boxOf(section)).x + (await boxOf(section)).width).toBeLessThanOrEqual(viewport.width);
      await expectNoSidewaysScroll(page, "a young player's sheet");
      await page.getByTestId("player-sheet-close").tap();

      await toggle.tap();
      await expect(rows).toHaveCount(count);
      await expectNoSidewaysScroll(page, "whole squad again");
    });
  });
}
