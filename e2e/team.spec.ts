import { expect, test, type Cookie, type Locator, type Page } from "@playwright/test";
import { FORMATION_NAMES } from "../src/engine/formations";
import { playerInitials } from "../src/lib/player-initials";
import { deleteUsers, setSaveDate, USER_COOKIE, userIdOf } from "./db";
import {
  boxOf,
  createSave,
  EMOJI,
  expectNoSidewaysScroll,
  expectOrangeActions,
  expectUncovered,
  pickFormation,
  pinnedToScreen,
  saveHeader,
  saveIdOf,
  sidewaysOverflow,
  textOf,
} from "./helpers";

// The Team entry, on a Lyon just created: the squad, the line-up and the player's sheet, at the widths where they change
// shape. A world of 198 clubs takes some 20 seconds, so the tests share one, in the order of this file: those that only
// read it, whatever they leave unsaved in the page, then those that change it, down to a match played and the window
// closed. Its user goes at the end, and the save with them. After a failure, Playwright starts a new worker, which
// creates its own.

const LYON = "Olympique Lyonnais";

const COMPUTER = { width: 1280, height: 800 };
const LAPTOP = { width: 1100, height: 800 };
const SMALL_COMPUTER = { width: 1024, height: 800 };
const TABLET = { width: 768, height: 1024 };

/** The width of the player's sheet, beside the list or over the page. */
const SHEET_WIDTH = 400;

/** A phone's thumb: the height and the width of a target, under 640 px. */
const THUMB = 44;

/** The formations the formation's sheet recommends for the squad, above the others it folds. */
const RECOMMENDED = 3;

/** The line-up's status, in French: the assistant's eleven, a new career's, then the player's own once saved. */
const ASSISTANT_STATUS = "Onze de ton adjoint · il le refait avant chaque match";
const PLAYER_STATUS = "Ton onze · enregistré. Ton adjoint ne remplace qu'un blessé ou un suspendu.";

/** Written by no screen of the team: the sorts' arrows, the sheet's cross and the transfers' arrow are drawn, or words. */
const GLYPHS = /[▲▼✕→]/u;

/** The rating among a row's cells, under the table's fourth column: the position, the name, the age, the rating. */
const RATING_CELL = 3;

/** Slots of the 4-3-3 and of the 4-4-2 alike: the goalkeeper, the right-back, and two forwards last. */
const KEEPER_SLOT = 0;
const RIGHT_BACK_SLOT = 1;
const FORWARD_SLOT = 9;
const OTHER_FORWARD_SLOT = 10;

const SORTS = ["squad-sort-position", "squad-sort-overall", "squad-sort-contracts"];

/** The two drawings of the sheet's close button: lucide's class names. */
const CHEVRON = "svg.lucide-chevron-left";
const CROSS = "svg.lucide-x";

const PHONES = [
  {
    name: "390 × 844, in French",
    locale: "fr-FR",
    viewport: { width: 390, height: 844 },
    says: {
      keeper: "G",
      age: /^\d+ ans$/,
      form: /^Forme \d+$/,
      rating: "Note",
      substitute: /^Remplaçant 1 : /,
      assistant: "Onze de ton adjoint · il le refait avant chaque match",
      unsaved: "Ton onze · modifications non enregistrées",
      showAll: "Voir tous les dispositifs · 14",
    },
  },
  {
    name: "360 × 780, in English",
    locale: "en-GB",
    viewport: { width: 360, height: 780 },
    says: {
      keeper: "GK",
      age: /^\d+ yrs$/,
      form: /^Form \d+$/,
      rating: "Rating",
      substitute: /^Substitute 1: /,
      assistant: "Your assistant's eleven · he picks it again before every match",
      unsaved: "Your eleven · unsaved changes",
      showAll: "See all formations · 14",
    },
  },
];

let saveId = "";
let ownerId: string | null = null;
let ownerCookies: Cookie[] = [];

test.use({ viewport: COMPUTER });

// A matchday of 198 clubs in the last test.
test.describe.configure({ timeout: 240_000 });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    // A unique name (not simulation code: the clock is fine here).
    await createSave(page, `E2E équipe ${Date.now()}`, LYON);
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

/** A screen of the shared save, opened by its owner, once React has committed the page: a click before goes nowhere. */
async function openSave(page: Page, path = ""): Promise<void> {
  await page.context().addCookies(ownerCookies);
  await page.goto(`/saves/${saveId}${path}`);
  await page.waitForFunction(() => window.history.state?.__NA === true);
}

const rowsOf = (page: Page): Locator => page.getByTestId("squad-row");

/** The ratings of the squad, row by row: the table's column, or the figure on a card's tile. */
const ratingsOf = (page: Page): Promise<number[]> =>
  rowsOf(page).evaluateAll((rows, cell) => rows.map((row) => Number(row.children[cell].textContent)), RATING_CELL);

/** The years of the squad's contracts, row by row. Their cell has no box on a card: its text is all the same in the page. */
const contractYearsOf = (page: Page): Promise<number[]> =>
  rowsOf(page)
    .locator('td[data-column="contractUntil"]')
    .evaluateAll((cells) => cells.map((cell) => Number(cell.textContent?.trim().slice(-4))));

const namesOf = (page: Page): Promise<string[]> => rowsOf(page).getByTestId("squad-player-open").allTextContents();

const ascending = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);
const descending = (values: readonly number[]): number[] => [...values].sort((a, b) => b - a);

const sheetOf = (page: Page): Locator => page.getByTestId("player-sheet");
const sheetNameOf = (page: Page): Locator => sheetOf(page).getByTestId("player-sheet-name");

const slotsOf = (page: Page): Locator => page.getByTestId("pitch-slot");
const slotAt = (page: Page, index: number): Locator => page.locator(`[data-slot-index="${index}"]`);

/** Each slot's player by key, in the order of the slots; "" for an empty one. */
const elevenOf = (page: Page): Promise<string[]> =>
  slotsOf(page).evaluateAll((slots) => slots.map((slot) => slot.getAttribute("data-slot-player-key") ?? ""));

/** The bench in its order, by key. */
const benchOf = (page: Page): Promise<string[]> =>
  page.getByTestId("lineup-bench-player").evaluateAll((players) => players.map((player) => player.getAttribute("data-bench-player-key") ?? ""));

/** The lines of the line-up's list: the players outside the eleven only, at every width (the pitch has the starters). */
const linesOf = (page: Page): Locator => page.getByTestId("lineup-reserves").locator("ul button");

/** A player's line in the list: a substitute's or a player left out's; none for a starter. */
const lineOf = (page: Page, key: string): Locator => page.locator(`[data-testid="lineup-reserve"][data-player-key="${key}"]`);

/** The name of a slot's player, as its label gives it: « Avant-centre : Prénom Nom, … ». */
async function slotNameOf(slot: Locator): Promise<string> {
  const label = (await slot.getAttribute("aria-label")) ?? "";
  return /^[^:]+:\s*([^,]+)/.exec(label)?.[1].trim() ?? "";
}

/** A player among the selected slot's candidates: over the page under 1024 px, in the list's place from there. */
const candidateOf = (page: Page, key: string): Locator =>
  page.getByTestId("lineup-candidate").and(page.locator(`[data-player-key="${key}"]`));

/** The name a line of the list gives. */
const nameOn = (line: Locator): Promise<string> => textOf(line.locator("span.block"));

/** None of the eleven has a line in the list, whatever the width: the pitch has them. */
async function expectNoStarterInList(page: Page): Promise<void> {
  await expect(page.getByTestId("lineup-starter")).toHaveCount(0);
  for (const key of await elevenOf(page)) {
    await expect(lineOf(page, key)).toHaveCount(0);
  }
}

/** A slot's candidates, wherever they show: every player of the squad but the slot's own, the other ten starters too. */
async function expectEveryCandidate(page: Page, listed: number): Promise<void> {
  await expect(page.getByTestId("lineup-candidate")).toHaveCount(listed + 10);
  await expect(page.locator('[data-testid="lineup-candidate"][data-candidate-place="starter"]')).toHaveCount(10);
}

/** A target a thumb can hit, to the hundredth of a pixel: a sheet still opening leaves a 44 px button at 43.99998. */
async function expectThumbTarget(target: Locator): Promise<void> {
  const { width, height } = await boxOf(target);
  expect(Math.round(Math.min(width, height) * 100) / 100, `${target}`).toBeGreaterThanOrEqual(THUMB);
}

/** Over the page at the right of the window, the whole of its height: the whole window on a phone. */
const expectSheetOverPage = (page: Page, { width, height }: { width: number; height: number }): Promise<void> =>
  expect
    .poll(() => boxOf(sheetOf(page)))
    .toEqual({ x: Math.max(width - SHEET_WIDTH, 0), y: 0, width: Math.min(width, SHEET_WIDTH), height });

/**
 * The sheet's parts, its content no wider than the sheet: the initials of its head, without a face or any other drawing;
 * four tiles, the player's bars, his contract and three actions, whole on the screen.
 */
async function expectWholeSheet(page: Page, attributes: number): Promise<void> {
  const sheet = sheetOf(page);
  const [firstName, ...family] = (await textOf(sheetNameOf(page))).split(" ");
  await expect(sheet.getByText(playerInitials(firstName, family.join(" ")), { exact: true }).first()).toBeVisible();
  await expect(sheet.locator("> div svg")).toHaveCount(0);
  await expect(sheet.getByTestId("player-sheet-season").locator("dt")).toHaveCount(4);
  await expect(sheet.getByTestId("player-attributes").locator("[data-attribute]")).toHaveCount(attributes);
  await expect(sheet.getByTestId("player-sheet-contract")).toBeVisible();
  for (const action of ["renew-contract", "sell-player", "release-player"]) {
    await expect(sheet.getByTestId(action)).toBeEnabled();
    await expect(sheet.getByTestId(action)).toBeInViewport({ ratio: 1 });
    await expectUncovered(sheet.getByTestId(action));
  }
  expect(await sidewaysOverflow(sheet.locator("> div").first())).toBeLessThanOrEqual(0);
}

/** Each slot whole within the pitch, whose frame would cut it. */
async function expectSlotsWithinPitch(page: Page, step: string): Promise<void> {
  const pitch = await boxOf(page.getByTestId("pitch"));
  for (const slot of await slotsOf(page).all()) {
    const { x, y, width, height } = await boxOf(slot);
    expect(x, step).toBeGreaterThanOrEqual(pitch.x);
    expect(x + width, step).toBeLessThanOrEqual(pitch.x + pitch.width);
    expect(y, step).toBeGreaterThanOrEqual(pitch.y);
    expect(y + height, step).toBeLessThanOrEqual(pitch.y + pitch.height);
  }
}

/** Under each other: the pitch, its summary, the bench, then the list. */
async function expectPitchBenchList(page: Page): Promise<void> {
  const pitch = await boxOf(page.getByTestId("pitch"));
  const summary = await boxOf(page.locator("[data-lineup-summary]"));
  const bench = await boxOf(page.getByTestId("lineup-bench"));
  const list = await boxOf(page.getByTestId("lineup-reserves"));
  expect(summary.y).toBeGreaterThanOrEqual(pitch.y + pitch.height);
  expect(bench.y).toBeGreaterThanOrEqual(summary.y + summary.height);
  expect(list.y).toBeGreaterThanOrEqual(bench.y + bench.height);
}

/** Scrolled to the foot of the list, what a player is carried to, and his sheet, stay in sight. */
async function expectColumnsHeldInSight(page: Page, columns: string[]): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(linesOf(page).last()).toBeInViewport();
  for (const column of columns) {
    await expect(page.getByTestId(column)).toBeInViewport({ ratio: 1 });
  }
}

/** The first box, then the second to its right, from the same height. */
function expectBeside(left: { x: number; y: number; width: number }, right: { x: number; y: number }): void {
  expect(left.x + left.width).toBeLessThanOrEqual(right.x);
  expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
}

/** Nothing of the save's layout, the sheet included, written with a glyph. */
async function expectNoGlyph(page: Page): Promise<void> {
  const shell = page.locator("[data-save-shell]");
  await expect(shell).not.toContainText(GLYPHS);
  await expect(shell).not.toContainText(EMOJI);
}

for (const { name, locale, viewport, says } of PHONES) {
  test.describe(`on a phone, ${name}`, () => {
    test.use({ locale, viewport, hasTouch: true });

    test("lists the squad in cards, sorts it with three pills, and opens a sheet over the whole screen", async ({ page }) => {
      await openSave(page);
      await page.getByTestId("nav-team").tap();
      await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/squad$`));
      await expect(page.getByTestId("nav-squad")).toHaveAttribute("aria-current", "page");
      await expectNoSidewaysScroll(page, "squad");
      expect(await pinnedToScreen(page)).toEqual(["save-nav"]);

      // The column headers stay in the page, without a box: the pills stand in for them.
      const head = page.getByTestId("squad-table").locator("thead");
      await expect(head).toHaveCount(1);
      await expect(head).toBeHidden();
      for (const sort of SORTS) {
        await expectThumbTarget(page.getByTestId(sort));
      }

      // By position by default, then best first, the contracts ending first, and back.
      const [byPosition, byRating, byContract] = SORTS.map((sort) => page.getByTestId(sort));
      await expect(byPosition).toHaveAttribute("aria-pressed", "true");
      const firstOrder = await namesOf(page);
      const ratings = await ratingsOf(page);
      expect(ratings).not.toEqual(descending(ratings));
      await byRating.tap();
      await expect(byRating).toHaveAttribute("aria-pressed", "true");
      await expect(byPosition).toHaveAttribute("aria-pressed", "false");
      await expect.poll(() => ratingsOf(page)).toEqual(descending(ratings));
      await expectNoSidewaysScroll(page, "by rating");

      const years = await contractYearsOf(page);
      expect(years).not.toEqual(ascending(years));
      await byContract.tap();
      await expect(byContract).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => contractYearsOf(page)).toEqual(ascending(years));
      await expectNoSidewaysScroll(page, "by contract");

      await byPosition.tap();
      await expect.poll(() => namesOf(page)).toEqual(firstOrder);
      await expectNoSidewaysScroll(page, "by position");

      // A card: a tile with the rating and the position, the name, the age and the form. The rest is in the sheet.
      const card = rowsOf(page).first();
      await expect(card).toHaveCSS("display", "grid");
      const position = card.locator("td").first();
      const rating = card.locator("td").nth(RATING_CELL);
      await expect(position.locator("[data-primary-position]")).toHaveText(says.keeper);
      await expect(position.locator("[data-primary-position]")).toBeVisible();
      await expect(rating).toHaveText(/^\d{2}$/);
      await expect(rating).toBeVisible();
      expect(await boxOf(rating)).toEqual(await boxOf(position));
      await expect(card.getByTestId("squad-player-open")).toBeVisible();
      await expect(card.getByText(says.age)).toBeVisible();
      await expect(card.getByTitle(says.form)).toBeVisible();
      await expect(card.locator('td[data-column="contractUntil"]')).toBeHidden();
      await expectThumbTarget(card);

      // Touched on its tile, out of the name's button, the card opens the sheet, and nothing else on a touch screen.
      const playerName = await textOf(card.getByTestId("squad-player-open"));
      const tile = await boxOf(position);
      const { x, y } = await boxOf(card);
      await card.tap({ position: { x: tile.x - x + tile.width / 2, y: tile.y - y + tile.height / 2 } });
      await expect(sheetNameOf(page)).toHaveText(playerName);
      await expect(page.locator("[data-player-card]")).toHaveCount(0);
      await expectSheetOverPage(page, viewport);
      await expectWholeSheet(page, 7);
      await expect(sheetOf(page).getByTitle(says.rating, { exact: true })).toHaveText(await textOf(rating));
      await expectNoSidewaysScroll(page, "sheet");

      // Its way back is a chevron a thumb can reach, its main action the screen's only orange.
      const close = page.getByTestId("player-sheet-close");
      await expect(close.locator(CHEVRON)).toBeVisible();
      await expect(close.locator(CROSS)).toBeHidden();
      await expectThumbTarget(close);
      await expectUncovered(close);
      await expectOrangeActions(page, ["renew-contract"]);
      for (const action of ["renew-contract", "sell-player", "release-player"]) {
        await expectThumbTarget(page.getByTestId(action));
      }

      await close.tap();
      await expect(sheetOf(page)).toHaveCount(0);
      await expect(card).toBeVisible();
      await expectNoSidewaysScroll(page, "sheet closed");

      // The name's button opens it too: an outfield player, with one bar less than a goalkeeper.
      const outfield = rowsOf(page).last();
      const outfieldName = await textOf(outfield.getByTestId("squad-player-open"));
      await outfield.getByTestId("squad-player-open").tap();
      await expect(sheetNameOf(page)).toHaveText(outfieldName);
      await expectWholeSheet(page, 6);
      await expectNoSidewaysScroll(page, "an outfield player's sheet");
    });

    test("stacks the pitch, its bench and the list, opens the sheet of whoever is touched, and holds every formation", async ({ page }) => {
      await openSave(page, "/squad");
      await page.getByTestId("nav-lineup").tap();
      await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/lineup$`));
      await expect(page.getByTestId("nav-lineup")).toHaveAttribute("aria-current", "page");

      // Eleven slots and the formation, the bench under them, in tiles, and the list under it, of the others only.
      const slots = slotsOf(page);
      const formation = page.getByTestId("lineup-formation");
      await expect(slots).toHaveCount(11);
      await expect(formation).toHaveAttribute("data-formation", "4-3-3");
      await expectPitchBenchList(page);
      const substitute = page.getByTestId("lineup-bench-player").first();
      await expect(substitute).toHaveText(/^\d{2}/);
      await expect(substitute).toHaveAttribute("title", says.substitute);
      await expect(substitute.locator("[data-position]")).toBeVisible();
      await expectNoStarterInList(page);
      await expectNoSidewaysScroll(page, "line-up");

      // The bench stays in sight along the list; it holds at the top of the screen, and the navigation at its foot.
      expect(await pinnedToScreen(page)).toEqual(["save-nav", "lineup-bench"]);

      // Nothing to save, and no orange: the assistant makes a new career's eleven, the one shown, the match's.
      const save = page.getByTestId("lineup-save");
      const status = page.getByTestId("lineup-status");
      await expect(status).toHaveText(says.assistant);
      await expect(page.getByTestId("lineup-assistant")).toBeVisible();
      await expect(save).toHaveCount(0);
      await expect(page.getByTestId("lineup-automatic")).toHaveCount(0);
      await expectOrangeActions(page, []);

      const reserves = page.getByTestId("lineup-reserve");
      for (const control of ["nav-squad", "nav-lineup", "view-opponent", "lineup-formation"]) {
        await expectThumbTarget(page.getByTestId(control));
      }
      for (const target of [...(await slots.all()), ...(await reserves.all())]) {
        await expectThumbTarget(target);
      }

      // No slot selected: touching a player of the list opens his sheet, over the whole screen.
      const sheet = sheetOf(page);
      const close = page.getByTestId("player-sheet-close");
      const reserve = reserves.first();
      const reserveName = await textOf(reserve.locator("[data-reserve-name]"));
      await reserve.tap();
      await expect(sheetNameOf(page)).toHaveText(reserveName);
      await expectSheetOverPage(page, viewport);
      await expectThumbTarget(close);
      await expectNoSidewaysScroll(page, "a reserve's sheet");
      await close.tap();
      await expect(sheet).toHaveCount(0);

      // A slot selected: its candidates come over the page, under its player, whose button is the way to his sheet, as his
      // line is the computer's. The sheet of candidates gives way to his, and comes back once it is closed.
      const slot = slots.first();
      const candidates = page.getByTestId("lineup-candidates-sheet");
      const listed = await reserves.count();
      await slot.tap();
      await expect(slot).toHaveAttribute("aria-pressed", "true");
      await expect(candidates).toBeVisible();
      // The list leaves the starters out; the slot's candidates never do.
      await expectEveryCandidate(page, listed);
      await expect(sheet).toHaveCount(0);
      await expectThumbTarget(page.getByTestId("lineup-open-sheet"));
      await expectThumbTarget(page.getByTestId("lineup-send-to-bench"));
      await expectNoSidewaysScroll(page, "a slot selected");
      await page.getByTestId("lineup-open-sheet").tap();
      await expect(sheet).toBeVisible();
      await expect(candidates).toHaveCount(0);
      const starterName = await textOf(sheetNameOf(page));
      expect(await slot.getAttribute("aria-label")).toContain(starterName);
      await expectSheetOverPage(page, viewport);
      await expectNoSidewaysScroll(page, "a starter's sheet");
      await close.tap();
      await expect(sheet).toHaveCount(0);
      await expect(candidates).toBeVisible();
      await expect(page.getByTestId("lineup-selection")).toContainText(starterName);

      // Still selected, the slot takes the next player touched among its candidates, and no sheet opens.
      const incoming = (await reserves.first().getAttribute("data-player-key")) ?? "";
      await candidateOf(page, incoming).tap();
      await expect(slot).toHaveAttribute("data-slot-player-key", incoming);
      await expect(slot).toHaveAttribute("aria-pressed", "false");
      await expect(candidates).toHaveCount(0);
      await expect(sheet).toHaveCount(0);
      await expectNoSidewaysScroll(page, "a reserve placed");

      // The formation's sheet: the three recommended for the squad, the others behind a button that unfolds them in
      // place, every row a thumb's target; a row picked closes it.
      await formation.tap();
      const picker = page.getByTestId("formation-picker");
      await expect(picker.getByTestId("formation-best")).toHaveCount(RECOMMENDED);
      const showAll = picker.getByTestId("formation-show-all");
      await expect(showAll).toHaveText(says.showAll);
      await expect(showAll).toHaveAttribute("aria-expanded", "false");
      await expect(picker.getByTestId("formation-choice").first()).toBeHidden();
      await expectThumbTarget(showAll);
      await showAll.tap();
      await expect(showAll).toHaveAttribute("aria-expanded", "true");
      await expect(picker.locator('[data-testid="formation-choice"]:visible')).toHaveCount(FORMATION_NAMES.length - RECOMMENDED);
      const rows = picker.locator('[data-testid="formation-best"], [data-testid="formation-current"], [data-testid="formation-choice"]');
      for (const row of await rows.all()) {
        await expectThumbTarget(row);
      }
      await picker.getByTestId("formation-best").first().tap();
      await expect(picker).toBeHidden();

      // Each formation has its eleven, within a pitch as wide as the screen allows, picked in its sheet.
      for (const shape of FORMATION_NAMES) {
        await pickFormation(page, shape);
        await expect(slots).toHaveCount(11);
        await expectSlotsWithinPitch(page, shape);
        await expectNoSidewaysScroll(page, `formation ${shape}`);
      }

      // A draft of his own, the formations picked in it: the screen's only orange, the sheet open or not, whose renewal stays
      // secondary here; « Annuler » beside it.
      await expect(status).toHaveText(says.unsaved);
      await expect(save).toBeEnabled();
      await expectOrangeActions(page, ["lineup-save"]);
      await expectThumbTarget(save);
      await expectThumbTarget(page.getByTestId("lineup-cancel"));
      await reserves.first().tap();
      await expect(sheet.getByTestId("renew-contract")).toBeEnabled();
      await expectOrangeActions(page, ["lineup-save"]);
      await expectNoSidewaysScroll(page, "sheet over a changed line-up");
    });
  });
}

/** The assistant's card's title, in each language: he makes a new career's eleven (docs/design/simplification.md § 6.3). */
const ASSISTANT_CARD = { fr: "Ton adjoint aligne le onze", en: "Your assistant picks the eleven" };

/**
 * How far a control's content runs out of its border, in pixels, on its furthest side: 0 when its words and its drawing
 * all lie within it.
 */
const contentOverflow = (control: Locator): Promise<number> =>
  control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const overflows = [...range.getClientRects()]
      .filter(({ width, height }) => width > 0 && height > 0)
      .flatMap((rect) => [box.left - rect.left, rect.right - box.right, box.top - rect.top, rect.bottom - box.bottom]);
    // To the hundredth of a pixel, as the boxes are measured.
    return Math.round(Math.max(0, ...overflows) * 100) / 100;
  });

test("keeps the assistant's card, his status and the formation's button within a phone, at 390 and 360 px, in French and in English", async ({ page }) => {
  for (const language of ["fr", "en"] as const) {
    await page.context().addCookies([{ name: "lw_lang", value: language, domain: "localhost", path: "/" }]);
    for (const viewport of PHONES.map((phone) => phone.viewport)) {
      const step = `${language}, ${viewport.width} px`;
      await page.setViewportSize(viewport);
      await openSave(page, "/lineup");
      const card = page.getByTestId("lineup-assistant");
      await expect(card.getByRole("heading"), step).toHaveText(ASSISTANT_CARD[language]);
      expect(await contentOverflow(card), step).toBe(0);
      expect(await sidewaysOverflow(card), step).toBeLessThanOrEqual(0);
      const status = page.getByTestId("lineup-status");
      expect(await contentOverflow(status), step).toBe(0);
      expect(await sidewaysOverflow(status), step).toBeLessThanOrEqual(0);

      // No « Composition automatique » beside the formation any more: its button has the row, a thumb's target.
      await expect(page.getByTestId("lineup-automatic"), step).toHaveCount(0);
      const formation = page.getByTestId("lineup-formation");
      await expectThumbTarget(formation);
      expect(await sidewaysOverflow(formation), step).toBeLessThanOrEqual(0);
      await expectNoSidewaysScroll(page, step);
    }
  }
});

test.describe("at 768 px", () => {
  test.use({ viewport: TABLET });

  test("has the squad in cards, the line-up in one column and the sheet over the page, never wider than the window", async ({ page }) => {
    await openSave(page);
    await page.getByTestId("nav-team").click();
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/squad$`));

    // Cards still, under 1024 px, and the sheet at the right of the window.
    const rows = rowsOf(page);
    await expect(rows.first()).toHaveCSS("display", "grid");
    await expect(page.getByTestId("squad-table").locator("thead")).toBeHidden();
    await expectNoSidewaysScroll(page, "squad");
    await rows.first().click();
    await expectSheetOverPage(page, TABLET);
    await expect(page.getByTestId("player-sheet-close").locator(CHEVRON)).toBeVisible();
    await expectOrangeActions(page, ["renew-contract"]);
    await expectNoSidewaysScroll(page, "sheet over the squad");
    await page.keyboard.press("Escape");
    await expect(sheetOf(page)).toHaveCount(0);

    // The line-up in one column, of the players outside the eleven, and no sheet until one is touched.
    await page.getByTestId("nav-lineup").click();
    await expect(slotsOf(page)).toHaveCount(11);
    await expect(sheetOf(page)).toHaveCount(0);
    await expectPitchBenchList(page);
    await expectNoStarterInList(page);
    await expectNoSidewaysScroll(page, "line-up");

    await page.getByTestId("lineup-reserve").first().click();
    await expectSheetOverPage(page, TABLET);
    await expectNoSidewaysScroll(page, "sheet over the line-up");
  });
});

test.describe("at 1024 px", () => {
  test.use({ viewport: SMALL_COMPUTER });

  test("leads to the line-up as a computer does, and has the table without the potential, and never a wage", async ({ page }) => {
    await openSave(page);
    await expect(page.getByTestId("nav-team")).toHaveAttribute("href", `/saves/${saveId}/lineup`);

    await openSave(page, "/squad");
    const table = page.getByTestId("squad-table");
    await expect(table.locator("thead")).toBeVisible();
    await expect(page.getByTestId("squad-column-potential")).toBeHidden();
    // No wage column at any width: the player manages no wage (docs/design/simplification.md § 6.2).
    await expect(page.getByTestId("squad-column-wage")).toHaveCount(0);
    for (const column of ["position", "name", "age", "overall", "form", "market-value", "contract-until"]) {
      await expect(page.getByTestId(`squad-column-${column}`)).toBeVisible();
    }
    await expect(rowsOf(page).first()).toHaveCSS("display", "table-row");
    expect(await sidewaysOverflow(table.locator("xpath=.."))).toBeLessThanOrEqual(0);
    await expectNoSidewaysScroll(page, "table");
  });
});

test.describe("at 1100 px", () => {
  test.use({ viewport: LAPTOP });

  test("has two columns, and the sheet only when asked for, over the page, until Escape or its cross", async ({ page }) => {
    await openSave(page, "/lineup");
    await expect(slotsOf(page)).toHaveCount(11);
    expectBeside(await boxOf(page.getByTestId("lineup-reserves")), await boxOf(page.getByTestId("pitch")));
    await expectNoStarterInList(page);
    const sheet = sheetOf(page);
    await expect(sheet).toHaveCount(0);
    await expectNoSidewaysScroll(page, "line-up");

    // A line of the list: over the page, which does not make room for it.
    const { x, width, height } = await boxOf(page.getByTestId("lineup-reserves"));
    const reserve = page.getByTestId("lineup-reserve").first();
    const reserveName = await nameOn(reserve);
    await reserve.click();
    await expect(sheetNameOf(page)).toHaveText(reserveName);
    await expect(sheet).toHaveCSS("position", "fixed");
    await expectSheetOverPage(page, LAPTOP);
    expect(await boxOf(page.getByTestId("lineup-reserves"))).toMatchObject({ x, width, height });
    await expectNoSidewaysScroll(page, "sheet");

    // Escape closes a dialog opened from the sheet first, then the sheet.
    const renewal = page.getByTestId("renew-dialog");
    await sheet.getByTestId("renew-contract").click();
    await expect(renewal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(renewal).toBeHidden();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);

    // A slot alone opens no sheet: its candidates take the list's place, over nothing; its button opens the starter's
    // sheet, which its cross closes.
    const slot = slotAt(page, FORWARD_SLOT);
    const starterName = await slotNameOf(slot);
    await slot.click();
    await expect(slot).toHaveAttribute("aria-pressed", "true");
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("lineup-reserves").getByTestId("lineup-candidates")).toBeVisible();
    await expect(page.getByTestId("lineup-candidates-sheet")).toHaveCount(0);
    await expect(page.getByTestId("lineup-reserve")).toHaveCount(0);
    await expectNoSidewaysScroll(page, "a slot's candidates");
    await page.getByTestId("lineup-open-sheet").click();
    await expect(sheetNameOf(page)).toHaveText(starterName);
    const close = page.getByTestId("player-sheet-close");
    await expect(close.locator(CROSS)).toBeVisible();
    await expect(close.locator(CHEVRON)).toBeHidden();
    await close.click();
    await expect(sheet).toHaveCount(0);
    await expect(slot).toHaveAttribute("aria-pressed", "true");

    await expectColumnsHeldInSight(page, ["pitch", "lineup-bench"]);
  });
});

test("leads to the line-up once hydrated, in three columns: the list, the pitch and the sheet of the best rated", async ({ page }) => {
  await openSave(page);

  // The server answers for a phone: the entry changes with the page hydrated.
  const entry = page.getByTestId("nav-team");
  await expect(entry).toHaveAttribute("href", `/saves/${saveId}/lineup`);
  await entry.click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/lineup$`));
  await expect(entry).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("nav-lineup")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("nav-squad")).not.toHaveAttribute("aria-current", "page");

  // Side by side, in this order, the players outside the eleven in the list.
  const sheet = sheetOf(page);
  await expect(sheet).toBeVisible();
  await expectNoStarterInList(page);
  const list = await boxOf(page.getByTestId("lineup-reserves"));
  const pitch = await boxOf(page.getByTestId("pitch"));
  expectBeside(list, pitch);
  expectBeside(pitch, await boxOf(sheet));
  await expectNoSidewaysScroll(page, "line-up");

  // Never empty and not to be closed: the sheet of the best rated of the squad, as good as anyone in the list; his line
  // lit when he has one, none when he starts, on the pitch.
  await expect(page.getByTestId("player-sheet-close")).toBeHidden();
  const ratings = await linesOf(page).locator("> span:first-child").allTextContents();
  expect(Number(await textOf(sheet.getByTitle("Note", { exact: true })))).toBeGreaterThanOrEqual(Math.max(...ratings.map(Number)));
  const sheetName = await textOf(sheetNameOf(page));
  const starts = (await Promise.all((await slotsOf(page).all()).map(slotNameOf))).includes(sheetName);
  const lit = page.getByTestId("lineup-reserves").locator('button[aria-current="true"]');
  await expect(lit).toHaveCount(starts ? 0 : 1);
  await expect(sheet.getByTestId("player-attributes")).toBeVisible();

  // Nothing to save, the assistant's eleven: no « Enregistrer », no orange on the screen, not the renewal, not the
  // sidebar's action.
  await expect(page.getByTestId("lineup-save")).toHaveCount(0);
  await expect(sheet.getByTestId("renew-contract")).toBeVisible();
  await expect(saveHeader(page).getByTestId("next-match")).toBeVisible();
  await expectOrangeActions(page, []);

  // The list scrolls under its neighbours, which come up to the top of the window and stay: the sheet, then, whole.
  await expectColumnsHeldInSight(page, ["pitch", "lineup-bench", "player-sheet"]);
  await expectWholeSheet(page, 6);
});

test("keeps the sheet on the player last touched, a slot or a line, and needs no button to it", async ({ page }) => {
  await openSave(page, "/lineup");
  await expect(sheetOf(page)).toBeVisible();
  const eleven = await elevenOf(page);

  // A slot: the sheet follows it, and stays once it is let go.
  const slot = slotAt(page, FORWARD_SLOT);
  const forwardName = await slotNameOf(slot);
  await slot.click();
  await expect(slot).toHaveAttribute("aria-pressed", "true");
  await expect(sheetNameOf(page)).toHaveText(forwardName);
  await expect(page.getByTestId("lineup-selection")).toContainText(forwardName);
  await expect(page.getByTestId("lineup-open-sheet")).toBeHidden();
  await expect(page.getByTestId("lineup-send-to-bench")).toBeVisible();
  await slot.click();
  await expect(slot).toHaveAttribute("aria-pressed", "false");
  await expect(sheetNameOf(page)).toHaveText(forwardName);

  // Escape lets it go too, and so does the way back to the squad: the list has its lines again.
  const candidates = page.getByTestId("lineup-candidates");
  await expect(candidates).toHaveCount(0);
  await slot.click();
  await expect(candidates).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(slot).toHaveAttribute("aria-pressed", "false");
  await expect(candidates).toHaveCount(0);
  await slot.click();
  await page.getByTestId("lineup-candidates-back").click();
  await expect(slot).toHaveAttribute("aria-pressed", "false");
  await expect(candidates).toHaveCount(0);

  // No slot selected, a line changes nothing but the sheet, and lights up; a starter has none, the pitch has him.
  const reserve = page.getByTestId("lineup-reserve").first();
  await reserve.click();
  await expect(sheetNameOf(page)).toHaveText(await nameOn(reserve));
  await expect(reserve).toHaveAttribute("aria-current", "true");
  await expect(lineOf(page, eleven[KEEPER_SLOT])).toHaveCount(0);

  // Nothing moved: still the assistant's eleven, no draft to save.
  expect(await elevenOf(page)).toEqual(eleven);
  await expect(page.getByTestId("lineup-save")).toHaveCount(0);
  await expect(page.getByTestId("lineup-status")).toHaveText(ASSISTANT_STATUS);
});

test("sorts the squad's table by its columns, an icon on the chosen one, the sheet beside it and its renewal the only orange", async ({ page }) => {
  await openSave(page, "/squad");
  const head = page.getByTestId("squad-table").locator("thead");
  await expect(head).toBeVisible();
  const columnHead = (column: string): Locator => head.getByRole("columnheader").filter({ has: page.getByTestId(`squad-column-${column}`) });

  // By position by default, its head saying so to the eye and to a screen reader.
  await expect(columnHead("position")).toHaveAttribute("aria-sort", "ascending");
  await expect(columnHead("position").locator("svg")).toBeVisible();
  await expect(columnHead("overall")).toHaveAttribute("aria-sort", "none");
  await expect(columnHead("overall").locator("svg")).toHaveCount(0);

  // The rating: best first, then worst first, the icon following it.
  const ratings = await ratingsOf(page);
  await page.getByTestId("squad-column-overall").click();
  await expect(columnHead("overall")).toHaveAttribute("aria-sort", "descending");
  await expect(columnHead("overall").locator("svg")).toBeVisible();
  await expect(columnHead("position")).toHaveAttribute("aria-sort", "none");
  await expect(columnHead("position").locator("svg")).toHaveCount(0);
  await expect.poll(() => ratingsOf(page)).toEqual(descending(ratings));
  await page.getByTestId("squad-column-overall").click();
  await expect(columnHead("overall")).toHaveAttribute("aria-sort", "ascending");
  await expect(columnHead("overall").locator("svg")).toBeVisible();
  await expect.poll(() => ratingsOf(page)).toEqual(ascending(ratings));

  // A row opens the sheet beside the table, which gives up its contract column for it. Its renewal has the orange, the
  // sidebar's action steps back.
  const row = rowsOf(page).first();
  const contract = row.locator('td[data-column="contractUntil"]');
  await expect(contract).toBeVisible();
  await row.click();
  const sheet = sheetOf(page);
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS("position", "sticky");
  const column = await boxOf(sheet);
  const table = await boxOf(page.getByTestId("squad-table"));
  expect(column.width).toBe(SHEET_WIDTH);
  expect(column.x).toBeGreaterThanOrEqual(table.x + table.width);
  await expect(contract).toBeHidden();
  await expect(page.getByTestId("squad-column-contract-until")).toBeHidden();
  await expect(page.getByTestId("player-sheet-close").locator(CROSS)).toBeVisible();
  await expect(saveHeader(page).getByTestId("next-match")).toBeVisible();
  await expectOrangeActions(page, ["renew-contract"]);
  await expectNoSidewaysScroll(page, "sheet beside the table");

  // Closed, the table has its width again.
  await page.getByTestId("player-sheet-close").click();
  await expect(sheet).toHaveCount(0);
  await expect(contract).toBeVisible();
});

// From here on, the tests change the save: what they need, they read from it.

test("replaces a starter by a reserve, exchanges two starters, and finds all of it after saving and reloading", async ({ page }) => {
  await openSave(page, "/lineup");
  const save = page.getByTestId("lineup-save");
  const status = page.getByTestId("lineup-status");
  const formation = page.getByTestId("lineup-formation");
  await expect(sheetOf(page)).toBeVisible();

  // The formation picked while the assistant makes the eleven: saved at once, his eleven in it, nothing to save.
  await pickFormation(page, "4-4-2");
  await expect(page.getByText("Dispositif enregistré : ton adjoint aligne son onze en 4-4-2 à plat")).toBeVisible();
  await expect(status).toHaveText(ASSISTANT_STATUS);
  await expect(save).toHaveCount(0);
  await openSave(page, "/lineup");
  await expect(formation).toHaveAttribute("data-formation", "4-4-2");
  await expect(status).toHaveText(ASSISTANT_STATUS);

  // A slot, then a reserve among its candidates: he takes it, the sheet follows him, the slot lets go, and the starter
  // leaves for the bench. The list has its lines again: the newcomer's gone to the pitch, the outgoing one's on the bench.
  // A draft of the player's own: something to save, the screen's only orange, and the sheet's renewal stays secondary.
  const slot = slotAt(page, FORWARD_SLOT);
  const outgoing = (await elevenOf(page))[FORWARD_SLOT];
  const reserve = page.getByTestId("lineup-group-fw").getByTestId("lineup-reserve").first();
  const incoming = (await reserve.getAttribute("data-player-key")) ?? "";
  const incomingName = await nameOn(reserve);
  const listed = await page.getByTestId("lineup-reserve").count();
  await slot.click();
  // The list leaves the starters out; the slot's candidates, in its place, never do.
  await expectEveryCandidate(page, listed);
  await expect(candidateOf(page, incoming)).not.toHaveAttribute("data-candidate-place", "starter");
  await candidateOf(page, incoming).click();
  await expect(slot).toHaveAttribute("data-slot-player-key", incoming);
  await expect(slot).toHaveAttribute("aria-pressed", "false");
  await expect(lineOf(page, incoming)).toHaveCount(0);
  await expect(lineOf(page, outgoing)).toHaveAttribute("data-bench", "true");
  await expect(sheetNameOf(page)).toHaveText(incomingName);
  await expect(status).toHaveText("Ton onze · modifications non enregistrées");
  await expect(save).toBeEnabled();
  await expectOrangeActions(page, ["lineup-save"]);

  // A slot, then a starter among its candidates: the two exchange their slots, and the bench does not move.
  const other = slotAt(page, OTHER_FORWARD_SLOT);
  const otherKey = (await elevenOf(page))[OTHER_FORWARD_SLOT];
  const bench = await benchOf(page);
  await slot.click();
  await expect(candidateOf(page, otherKey)).toHaveAttribute("data-candidate-place", "starter");
  await candidateOf(page, otherKey).click();
  await expect(slot).toHaveAttribute("data-slot-player-key", otherKey);
  await expect(other).toHaveAttribute("data-slot-player-key", incoming);
  await expect(slot).toHaveAttribute("aria-pressed", "false");
  expect(await benchOf(page)).toEqual(bench);

  // Dragged from his slot on the pitch, a starter does the same.
  await other.dragTo(slot);
  await expect(slot).toHaveAttribute("data-slot-player-key", incoming);
  await expect(other).toHaveAttribute("data-slot-player-key", otherKey);

  // Saved: his own from then on, nothing left to save, the way back to the assistant beside it.
  const eleven = await elevenOf(page);
  await save.click();
  await expect(status).toHaveText(PLAYER_STATUS);
  await expect(save).toHaveCount(0);
  await expect(page.getByTestId("lineup-hand-back")).toBeVisible();
  await expectOrangeActions(page, []);

  await openSave(page, "/lineup");
  await expect(formation).toHaveAttribute("data-formation", "4-4-2");
  await expect(slot).toHaveAttribute("data-slot-player-key", incoming);
  expect(await elevenOf(page)).toEqual(eleven);
  expect(await benchOf(page)).toEqual(bench);
  await expect(status).toHaveText(PLAYER_STATUS);
  await expect(page.getByTestId("lineup-assistant")).toHaveCount(0);
});

test("renews a contract from the line-up's sheet, which shows the new end at once and keeps it", async ({ page }) => {
  await openSave(page, "/lineup");
  const contract = sheetOf(page).getByTestId("player-sheet-contract");
  await expect(contract).toBeVisible();
  const playerName = await textOf(sheetNameOf(page));
  const eleven = await elevenOf(page);

  // Five seasons from 2026-27, or four when his contract already runs to 2031. Neither on the sheet nor in the dialog a
  // wage: the length alone is chosen, three seasons to begin with (docs/design/simplification.md § 2.3).
  const [length, expectedEnd] = (await textOf(contract)).includes("2031") ? [4, "30 juin 2030"] : [5, "30 juin 2031"];
  await expect(contract).not.toContainText("Salaire");
  await expect(sheetOf(page).getByTestId("renew-contract")).toHaveText("Prolonger maintenant");
  await sheetOf(page).getByTestId("renew-contract").click();
  const renewal = page.getByTestId("renew-dialog");
  await expect(renewal).toContainText("Contrat actuel : jusqu'au");
  await expect(renewal.getByTestId("renewal-wage")).toHaveCount(0);
  await expect(renewal.getByTestId("contract-length-3")).toHaveAttribute("aria-pressed", "true");
  await renewal.getByTestId(`contract-length-${length}`).click();
  await renewal.getByTestId("renew-confirm").click();
  await expect(renewal).toBeHidden();
  await expect(contract).toContainText(expectedEnd);
  await expect(sheetNameOf(page)).toHaveText(playerName);
  expect(await elevenOf(page)).toEqual(eleven);

  await openSave(page, "/lineup");
  await expect(sheetNameOf(page)).toHaveText(playerName);
  await expect(contract).toContainText(expectedEnd);
});

test("releases a starter from the line-up's sheet: he leaves the list, and the pitch stays whole", async ({ page }) => {
  await openSave(page, "/lineup");
  await expect(sheetOf(page)).toBeVisible();
  const lines = linesOf(page);
  const squadSize = await lines.count();
  const eleven = await elevenOf(page);

  const released = eleven[RIGHT_BACK_SLOT];
  const releasedName = await slotNameOf(slotAt(page, RIGHT_BACK_SLOT));
  await slotAt(page, RIGHT_BACK_SLOT).click();
  await expect(sheetNameOf(page)).toHaveText(releasedName);
  await sheetOf(page).getByTestId("release-player").click();
  const release = page.getByTestId("release-dialog");
  // Its cost in money alone, never a wage: half of what he is still owed.
  await expect(release).toContainText(/Coût : .+, la moitié de ce qui lui reste dû sur son contrat\./);
  await release.getByTestId("release-confirm").click();
  await expect(release).toBeHidden();

  // Out of the list, out of the eleven, whose slot has a player of the squad again; the others have not moved.
  await expect(lines).toHaveCount(squadSize - 1);
  await expect(lineOf(page, released)).toHaveCount(0);
  await expect(slotAt(page, RIGHT_BACK_SLOT)).not.toHaveAttribute("data-slot-player-key", released);
  const now = await elevenOf(page);
  expect(now).toHaveLength(11);
  expect(new Set(now).size).toBe(11);
  expect(now).not.toContain("");
  for (const key of now) {
    await expect(lineOf(page, key)).toHaveCount(0);
  }
  await expect(page.locator("[data-bench-player-key]")).toHaveCount(7);
  await expect(page.locator(`[data-bench-player-key="${released}"]`)).toHaveCount(0);

  // The sheet is never empty: it has gone to another player. Nothing left to save: still the player's own eleven.
  await expect(sheetOf(page)).toBeVisible();
  await expect(sheetNameOf(page)).not.toHaveText(releasedName);
  await expect(page.getByTestId("lineup-status")).toHaveText(PLAYER_STATUS);
  await expect(page.getByTestId("lineup-save")).toHaveCount(0);
});

test("sells a reserve from the line-up's sheet: its dialog names the offer, and he leaves the list", async ({ page }) => {
  await openSave(page, "/lineup");
  await expect(sheetOf(page)).toBeVisible();
  const lines = linesOf(page);
  const squadSize = await lines.count();

  const reserve = page.getByTestId("lineup-reserve").last();
  const sold = (await reserve.getAttribute("data-player-key")) ?? "";
  await reserve.click();
  await sheetOf(page).getByTestId("sell-player").click();
  const sale = page.getByTestId("sell-dialog");
  await expect(sale).toContainText("Meilleure offre");
  await sale.getByTestId("sell-confirm").click();
  await expect(sale).toBeHidden();

  await expect(lines).toHaveCount(squadSize - 1);
  await expect(lineOf(page, sold)).toHaveCount(0);
  await expect(sheetOf(page)).toBeVisible();
});

test("writes a transfer in words, and no glyph on the squad, the line-up and the sheet", async ({ page }) => {
  // A player with a line in his history: a signing.
  await openSave(page, "/transfers");
  const signed = await textOf(page.getByTestId("market-player-name"));
  await page.getByTestId("market-recruit").click();
  await page.getByTestId("market-recruit-confirm").click();
  await page.getByTestId("market-signed-continue").click();
  await expect(page.getByTestId("market-signed")).toHaveCount(0);

  await openSave(page, "/squad");
  await expect(rowsOf(page).first()).toBeVisible();
  await expectNoGlyph(page);

  await rowsOf(page)
    .filter({ has: page.getByText(signed, { exact: true }) })
    .click();
  await expect(sheetNameOf(page)).toHaveText(signed);
  await expect(sheetOf(page).getByTestId("player-sheet-transfers")).toContainText(new RegExp(`Transfert : .+ vers ${LYON}, `));
  await expect(sheetOf(page).getByTestId("sell-player")).toBeDisabled();
  await expect(sheetOf(page).getByTestId("player-sale-refusal")).toBeVisible();
  await expectNoGlyph(page);

  await openSave(page, "/lineup");
  await expect(sheetOf(page)).toBeVisible();
  await expectNoGlyph(page);

  // His sheet in the column, then an empty slot: a drawing, and a word.
  await linesOf(page).filter({ hasText: signed }).click();
  await expect(sheetOf(page).getByTestId("player-sheet-transfers")).toBeVisible();
  await expectNoGlyph(page);
  const slot = slotAt(page, FORWARD_SLOT);
  await slot.click();
  await page.getByTestId("lineup-send-to-bench").click();
  await expect(slot.locator("[data-slot-player]")).toHaveText("Vide");
  await expect(slot.locator("svg")).toBeVisible();
  await expectNoGlyph(page);
});

test("counts a match played in the tiles of the sheet", async ({ page }) => {
  await openSave(page);
  await page.getByTestId("dashboard-next-match").getByTestId("next-match").click();
  await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/live\\?rejouer=1$`), { timeout: 120_000 });
  await page.getByTestId("live-skip").click();
  await page.getByTestId("break-resume").click();
  await page.getByTestId("live-skip").click();
  await page.getByTestId("live-continue").click();
  await expect(page.getByTestId("dashboard-last-result")).toBeVisible();

  await openSave(page, "/lineup");
  await slotAt(page, KEEPER_SLOT).click();
  const tiles = sheetOf(page).getByTestId("player-sheet-season");
  await expect(tiles.locator("dt")).toHaveText(["Matchs", "Buts", "Passes D.", "Minutes"]);
  await expect(tiles.locator("dd").first()).toHaveText("1");
  await expect(tiles.locator("dd").last()).toHaveText(/^[1-9]\d*$/);
});

// Last: nothing can be played after a date moved by hand.
test("disables the sheet's three actions while the window is closed, and says when it reopens", async ({ page }) => {
  // The day after the summer window. Nothing here reads more than the date: no need to simulate August.
  await setSaveDate(saveId, new Date(Date.UTC(2026, 8, 1)));

  await openSave(page, "/squad");
  await expect(page.getByTestId("squad-window-closed")).toBeVisible();
  await rowsOf(page).first().click();
  const sheet = sheetOf(page);
  await expect(sheet.getByTestId("window-closed-note")).toHaveText(
    "Mercato fermé : prolongations, ventes et libérations reprendront le 1er janvier 2027.",
  );
  for (const action of ["renew-contract", "sell-player", "release-player"]) {
    await expect(sheet.getByTestId(action)).toBeDisabled();
  }
  // The note says it all: no second reason under it.
  await expect(sheet.getByTestId("player-sale-refusal")).toHaveCount(0);
});
