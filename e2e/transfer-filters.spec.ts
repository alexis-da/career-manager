import { expect, test, type Locator, type Page } from "@playwright/test";
import { createSave, deleteSave } from "./helpers";

// Columns of the « Autres clubs » table.
const COLUMN = { name: 0, club: 1, position: 2, age: 3, overall: 4, price: 6 } as const;

/** An amount as formatMoney shows it: « 83,4 M€ », « 720 k€ » or « 500 € ». */
function parseMoney(text: string): number {
  const match = /^([\d\s  ]+(?:,\d+)?)\s*(M|k)?€$/.exec(text.trim());
  if (match === null) {
    throw new Error(`Not an amount: ${text}`);
  }
  const value = Number(match[1].replace(/[\s  ]/g, "").replace(",", "."));
  return value * (match[2] === "M" ? 1_000_000 : match[2] === "k" ? 1_000 : 1);
}

function rows(page: Page): Locator {
  return page.locator("tbody tr[data-player-id]");
}

/** Text of one column for every row of the current page of the list. */
async function column(page: Page, index: number): Promise<string[]> {
  await expect(rows(page).first()).toBeVisible();
  // The player cell also holds the nationality code: its link alone gives the name. The position cell also holds
  // the secondary positions: its primary one alone is the position.
  return rows(page).evaluateAll(
    (trs, [i, positionIndex]) =>
      trs.map((tr) => {
        const cell = tr.querySelectorAll("td")[i];
        const text = i === 0 ? tr.querySelector("td a") : i === positionIndex ? cell?.querySelector("[data-primary-position]") : cell;
        return text?.textContent?.trim() ?? "";
      }),
    [index, COLUMN.position] as const,
  );
}

/** Number of players matching the current filters, from the summary under the list. */
async function total(page: Page): Promise<number> {
  const summary = await page.getByText(/^\d+ joueurs?( · page \d+ sur \d+)?$/).textContent();
  return Number(/^(\d+)/.exec(summary ?? "")?.[1]);
}

async function submit(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Filtrer" }).click();
  await page.waitForLoadState("load");
}

async function reset(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Réinitialiser" }).click();
  await expect(page).toHaveURL(/\/transfers\?tab=clubs$/);
}

const field = {
  name: (page: Page) => page.getByLabel("Nom", { exact: true }),
  position: (page: Page) => page.getByLabel("Poste", { exact: true }),
  competition: (page: Page) => page.getByLabel("Championnat", { exact: true }),
  minOverall: (page: Page) => page.getByLabel("Note min.", { exact: true }),
  maxAge: (page: Page) => page.getByLabel("Âge max.", { exact: true }),
  maxPrice: (page: Page) => page.getByLabel("Prix max. (M€)", { exact: true }),
};

let saveName: string | undefined;

test.afterEach(async ({ page }) => {
  if (saveName !== undefined) {
    await deleteSave(page, saveName);
    saveName = undefined;
  }
});

test("filters the AI clubs' players one filter at a time, then three together with sort and pagination", async ({ page }) => {
  // A unique name to find this save again and delete it at the end (not simulation code: the clock is fine here).
  const name = `E2E filtres ${Date.now()}`;
  saveName = name;
  try {
    await createSave(page, name, "Olympique Lyonnais");
    await page.getByRole("link", { name: "Transferts" }).click();
    await page.getByRole("link", { name: "Autres clubs" }).click();
    const everyone = await total(page);
    expect(everyone).toBeGreaterThan(1000);

    // Position: every row plays there.
    await field.position(page).selectOption("ST");
    await submit(page);
    await expect(page).toHaveURL(/position=ST/);
    expect(await total(page)).toBeLessThan(everyone);
    expect(new Set(await column(page, COLUMN.position))).toEqual(new Set(["BU"]));
    await expect(field.position(page)).toHaveValue("ST");

    // Reset empties the form: the next search must not bring the previous filter back.
    await reset(page);
    await expect(field.position(page)).toHaveValue("");
    expect(await total(page)).toBe(everyone);

    // League: two leagues give two disjoint sets of clubs, both smaller than the whole market.
    await field.competition(page).selectOption({ label: "France — Division 1" });
    await submit(page);
    await expect(page).toHaveURL(/competition=fr\.1/);
    expect(await total(page)).toBeLessThan(everyone);
    const frenchClubs = new Set(await column(page, COLUMN.club));
    await field.competition(page).selectOption({ label: "Allemagne — Division 1" });
    await submit(page);
    const germanClubs = await column(page, COLUMN.club);
    expect(germanClubs.filter((club) => frenchClubs.has(club))).toEqual([]);
    await reset(page);

    // Minimum rating.
    await field.minOverall(page).fill("75");
    await submit(page);
    await expect(page).toHaveURL(/minOverall=75/);
    for (const overall of await column(page, COLUMN.overall)) {
      expect(Number(overall)).toBeGreaterThanOrEqual(75);
    }
    await reset(page);

    // Maximum age.
    await field.maxAge(page).fill("21");
    await submit(page);
    await expect(page).toHaveURL(/maxAge=21/);
    for (const age of await column(page, COLUMN.age)) {
      expect(Number(age)).toBeLessThanOrEqual(21);
    }
    await reset(page);

    // Maximum price, in millions, decimals allowed.
    await field.maxPrice(page).fill("2.5");
    await submit(page);
    await expect(page).toHaveURL(/maxPrice=2\.5/);
    for (const price of await column(page, COLUMN.price)) {
      expect(parseMoney(price)).toBeLessThanOrEqual(2_500_000);
    }
    await reset(page);

    // Name: the last name of the best player finds him, and only players with that name.
    const lastName = ((await column(page, COLUMN.name))[0] ?? "").split(" ").slice(1).join(" ");
    await field.name(page).fill(lastName.toLowerCase());
    await submit(page);
    const names = await column(page, COLUMN.name);
    expect(names.length).toBeGreaterThan(0);
    for (const playerName of names) {
      expect(playerName.toLowerCase()).toContain(lastName.toLowerCase());
    }
    await reset(page);

    // Three filters together, then sorting and the next page keep all three.
    await field.position(page).selectOption("CB");
    await field.maxAge(page).fill("28");
    await field.minOverall(page).fill("60");
    await submit(page);
    const combined = await total(page);
    expect(combined).toBeGreaterThan(50); // more than one page
    const expectCombined = async () => {
      await expect(page).toHaveURL(/position=CB/);
      await expect(page).toHaveURL(/maxAge=28/);
      await expect(page).toHaveURL(/minOverall=60/);
      expect(new Set(await column(page, COLUMN.position))).toEqual(new Set(["DC"]));
      for (const age of await column(page, COLUMN.age)) {
        expect(Number(age)).toBeLessThanOrEqual(28);
      }
      for (const overall of await column(page, COLUMN.overall)) {
        expect(Number(overall)).toBeGreaterThanOrEqual(60);
      }
      expect(await total(page)).toBe(combined);
    };
    await expectCombined();

    await page.getByRole("link", { name: "Prix demandé" }).click();
    await expect(page).toHaveURL(/sort=price/);
    await expectCombined();
    const prices = (await column(page, COLUMN.price)).map(parseMoney);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));

    await page.getByRole("link", { name: "Suivant" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(/sort=price/);
    await expect(page.getByText(/page 2 sur/)).toBeVisible();
    await expectCombined();
    const nextPrices = (await column(page, COLUMN.price)).map(parseMoney);
    expect(Math.max(...nextPrices)).toBeLessThanOrEqual(Math.min(...prices));

    // The form still shows the three filters after these client navigations.
    await expect(field.position(page)).toHaveValue("CB");
    await expect(field.maxAge(page)).toHaveValue("28");
    await expect(field.minOverall(page)).toHaveValue("60");

    // Other tabs keep the filters in the URL: coming back finds the same search, from its first page.
    await page.getByRole("link", { name: /^Joueurs libres/ }).click();
    await expect(page).not.toHaveURL(/tab=/);
    await expect(page).toHaveURL(/position=CB/);
    await expect(page).not.toHaveURL(/page=/);
    await page.getByRole("link", { name: "Mouvements" }).click();
    await expect(page).toHaveURL(/tab=moves/);
    await expect(page).toHaveURL(/position=CB/);
    await page.getByRole("link", { name: "Autres clubs" }).click();
    await expect(page).toHaveURL(/tab=clubs/);
    await expect(page).toHaveURL(/sort=price/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByText(/page 1 sur/)).toBeVisible();
    await expectCombined();
    await expect(field.position(page)).toHaveValue("CB");
    await expect(field.maxAge(page)).toHaveValue("28");
    await expect(field.minOverall(page)).toHaveValue("60");
  } finally {
    // Even when a step failed: a leftover save would pollute the database.
    await deleteSave(page, name);
    saveName = undefined;
  }
});
