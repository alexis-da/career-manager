import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { expect, test, type Locator } from "@playwright/test";
import { parse } from "dotenv";
import { createAnonymousUser, deleteUsers } from "./db";
import {
  expectNoSidewaysScroll,
  expectOrangeActions,
  expectThumbTarget,
  openScreen,
  signInAs,
  textOf,
  waitForReact,
} from "./helpers";

// The season's start (gameplay v2, V2 and V3): a season's end passed, the board's dotation in detail, the choice of the
// season's objective, then the same budget on the Club screen. On a worldVersion 1 twin of the demo save whose first
// season is played (e2e/season-end-save.mts: Lyon, 18 clubs in its division, no cup), for an anonymous user of its own,
// deleted with its save at the end.

const COMPUTER = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 360, height: 780 };

const run = promisify(execFile);

/** The step a dotation times its coefficient is rounded to (BUDGET_STEP, src/engine/balance.ts). */
const BUDGET_STEP = 100_000;

/** The season's budget as the transition makes it (seasonFinances, src/engine/economy.ts). */
const seasonBudget = (dotation: number, coefficient: number, carryOver: number): number =>
  Math.max(BUDGET_STEP, Math.round((dotation * coefficient) / 100 / BUDGET_STEP) * BUDGET_STEP) + carryOver;

/** A coefficient from its hundredths, as the French screens write it: « 1,10 ». */
const coefficientText = (hundredths: number): string => (hundredths / 100).toFixed(2).replace(".", ",");

/** A figure the screen gives in a data attribute: euros in data-amount, hundredths in data-coefficient… */
async function figureOf(locator: Locator, attribute = "data-amount"): Promise<number> {
  const value = await locator.getAttribute(attribute);
  expect(value, `${attribute} of ${locator}`).toMatch(/^-?\d+$/);
  return Number(value);
}

test.use({ viewport: COMPUTER });

test("passes a season's end, chooses an objective and finds the new dotation on the Club screen", async ({ page }) => {
  // A whole season played by the script, then a season's transition: minutes, not seconds.
  test.setTimeout(900_000);
  const userId = await createAnonymousUser(new Date());
  try {
    const databaseUrl = parse(readFileSync(".env.test")).DATABASE_URL_TEST;
    const { stdout } = await run("npx", ["tsx", "e2e/season-end-save.mts", userId], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
      shell: process.platform === "win32",
      maxBuffer: 16 * 1024 * 1024,
    });
    const saveId = stdout.trim().split("\n").at(-1)?.trim() ?? "";
    expect(saveId).toMatch(/^\S+$/);
    await signInAs(page, userId);

    // The season over: the dashboard's way on, to the season just closed, then on to the next one's start.
    await page.goto(`/saves/${saveId}`);
    await waitForReact(page);
    const nextSeason = page.getByTestId("next-season");
    await expect(nextSeason).toHaveText("Passer à la saison suivante");
    await nextSeason.click();
    await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/seasons/[^/?]+$`), { timeout: 300_000 });
    const next = page.getByTestId("season-next");
    await expect(next).toHaveText("Cap sur la saison 2027-28");
    await next.click();
    await expect(page).toHaveURL((url) => url.pathname === `/saves/${saveId}/season-start`, { timeout: 120_000 });

    // Under Club, without a tab of its own.
    await expect(page.getByTestId("season-start-title")).toHaveText("Début de saison");
    await expect(page.getByTestId("season-start")).toContainText("Saison 2027-28");
    await expect(page.getByTestId("nav-club")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("section-tabs")).toHaveCount(0);

    // « La direction t'accorde X »: the board's funding at the club's reputation rank in its division, times the coefficient
    // of last season's objectives (rounded to BUDGET_STEP), plus half of the budget left unspent.
    const budget = page.getByTestId("season-start-budget");
    const dotationLine = page.getByTestId("season-start-dotation");
    const bonusLine = page.getByTestId("season-start-objectives-bonus");
    const carryOverLine = page.getByTestId("season-start-carry-over");
    await expect(page.getByTestId("season-start-grant")).toContainText("La direction t'accorde");
    await expect(dotationLine).toContainText(/Rang de réputation : \d+(er|e) sur 18 de ta division/);
    await expect(carryOverLine).toContainText("La moitié de ton budget non dépensé");
    await expect(page.getByTestId("season-start-first")).toHaveCount(0);
    const granted = await figureOf(budget);
    const dotation = await figureOf(dotationLine);
    const coefficient = await figureOf(bonusLine, "data-coefficient");
    const carryOver = await figureOf(carryOverLine);
    expect(granted).toBe(seasonBudget(dotation, coefficient, carryOver));
    expect(granted).toBe(dotation + (await figureOf(bonusLine)) + carryOver);
    expect(await figureOf(page.getByTestId("season-start-total"))).toBe(granted);
    // Nothing bought in the first season: half of the starting budget comes back.
    expect(carryOver).toBeGreaterThan(0);

    // The coefficient, and the objectives it came from: the ranking, imposed, and the one the assistant chose at the first
    // kick-off, each with its outcome and what it added; with 100, they make the coefficient.
    await expect(bonusLine).toContainText(`× ${coefficientText(coefficient)}`);
    const lastObjectives = bonusLine.locator("li[data-objective]");
    await expect(lastObjectives).toHaveCount(2);
    await expect(lastObjectives.first()).toHaveAttribute("data-objective", "RANKING");
    await expect(lastObjectives.first()).toContainText("Classement");
    await expect(lastObjectives.nth(1)).toContainText("Choisi par l'adjoint");
    let contributions = 0;
    for (const objective of await lastObjectives.all()) {
      await expect(objective).toHaveAttribute("data-outcome", /^(EXCEEDED|ACHIEVED|MISSED)$/);
      contributions += await figureOf(objective, "data-contribution");
    }
    expect(100 + contributions).toBe(coefficient);

    // The new wage cap, with the payroll under it.
    const wageCap = page.getByTestId("season-start-wage-budget");
    expect(await figureOf(wageCap)).toBeGreaterThan(0);
    expect(await figureOf(page.getByTestId("season-start-payroll"))).toBeGreaterThan(0);

    // The season's objectives: the ranking imposed (no cup in this world), three proposals, the assistant's marked and
    // checked to begin with, and « Valider mon objectif », the screen's one orange action, down to 360 px.
    const imposed = page.getByTestId("objective-imposed");
    await expect(imposed).toHaveCount(1);
    await expect(imposed).toHaveAttribute("data-objective", "RANKING");
    const proposals = page.getByTestId("objective-choice");
    await expect(proposals).toHaveCount(3);
    const assistantPick = page.locator('[data-testid="objective-choice"][data-assistant]');
    await expect(assistantPick).toHaveCount(1);
    await expect(assistantPick.locator("input")).toBeChecked();
    await expect(page.getByTestId("season-start-assistant")).toContainText("Sans choix avant ton premier match, ton adjoint choisira ");
    await expectOrangeActions(page, ["objective-validate"]);
    await expectNoSidewaysScroll(page, `season start at ${COMPUTER.width} px`);
    for (const viewport of [PHONE, SMALL_PHONE]) {
      await page.setViewportSize(viewport);
      await expectNoSidewaysScroll(page, `season start at ${viewport.width} px`);
      await expectOrangeActions(page, ["objective-validate"]);
      await expectThumbTarget(page.getByTestId("objective-validate"));
      await expectThumbTarget(page.getByTestId("season-start-dashboard"));
    }
    await page.setViewportSize(COMPUTER);

    // Another proposal than the assistant's, chosen and validated: locked, the player's, never to change again.
    const choice = page.locator('[data-testid="objective-choice"]:not([data-assistant])').first();
    const kind = (await choice.getAttribute("data-objective")) ?? "";
    expect(["YOUTH", "ENTERTAINMENT", "SOLIDITY", "FINANCES"]).toContain(kind);
    await choice.click();
    await expect(choice.locator("input")).toBeChecked();
    await expect(assistantPick.locator("input")).not.toBeChecked();
    await page.getByTestId("objective-validate").click();
    const chosen = page.getByTestId("objective-chosen");
    await expect(chosen).toHaveAttribute("data-objective", kind);
    await expect(chosen).toContainText("Ton choix");
    await expect(chosen).toContainText("Il ne se change plus.");
    await expect(proposals).toHaveCount(0);
    await expect(page.getByTestId("objective-validate")).toHaveCount(0);
    // Kept: the screen read again shows it as it was chosen.
    await page.reload();
    await expect(chosen).toHaveAttribute("data-objective", kind);
    await expect(chosen).toContainText("Ton choix");

    // The Club screen's finances: the same budget, the same coefficient and the same wage cap.
    const grantedText = await textOf(budget);
    const wageText = await textOf(wageCap);
    await openScreen(page, "club");
    await expect(page).toHaveURL((url) => url.pathname === `/saves/${saveId}/club`);
    const finances = page.getByTestId("club-finances");
    await expect(finances.getByTestId("club-budget")).toHaveText(grantedText);
    const clubDotation = finances.getByTestId("club-dotation");
    await expect(clubDotation.getByRole("heading")).toHaveText("Saison 2027-28");
    await expect(clubDotation.getByTestId("club-dotation-total").locator("dd")).toHaveText(grantedText);
    await expect(clubDotation.getByTestId("club-dotation-objectives")).toContainText(`× ${coefficientText(coefficient)}`);
    await expect(clubDotation.getByTestId("club-dotation-wage-budget").locator("dd")).toHaveText(wageText);
  } finally {
    // The user and its save, a whole season of it: even after a failure.
    await deleteUsers([userId]);
  }
});
