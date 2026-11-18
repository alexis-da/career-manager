import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { parse } from "dotenv";
import { createAnonymousUser, deleteUsers, signedUserCookie, USER_COOKIE } from "./db";
import { expectNoSidewaysScroll } from "./helpers";

// The national teams' summer tournament (docs/design/selections.md, N3), on a worldVersion 2 twin of the demo save whose
// first cycle is over (e2e/tournament-save.mts): the Old Continent Cup 2028 played at its second transition. The
// Internationals tab tells it first, its winner, its groups and its knockout matches, then the Hemispheres cycle's
// qualifiers; a champion's sheet has his title; the History its internationals. At 1280, 390 and 360 px.

const COMPUTER = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 360, height: 780 };

test.use({ viewport: COMPUTER });

test("tells the summer tournament played at the season's turn: its winner, its groups, its knockout matches, its champions", async ({ page, baseURL }) => {
  test.setTimeout(420_000);
  const userId = await createAnonymousUser(new Date());
  try {
    const databaseUrl = parse(readFileSync(".env.test")).DATABASE_URL_TEST;
    const [saveId, championId] = execFileSync("npx", ["tsx", "e2e/tournament-save.mts", userId, "played"], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
      shell: process.platform === "win32",
      timeout: 360_000,
    })
      .trim()
      .split("\n")
      .slice(-2);
    await page.context().addCookies([{ name: USER_COOKIE, value: signedUserCookie(userId), url: baseURL ?? "" }]);

    // The tournament just played comes first: its winner, its two groups of three, its semi-finals and its final.
    await page.goto(`/saves/${saveId}/internationals`);
    const tournament = page.getByTestId("internationals-tournament").first();
    await expect(tournament).toHaveAttribute("data-state", "played");
    await expect(tournament).toContainText("Coupe du Vieux Continent 2028");
    await expect(tournament).toContainText("Du 9 juin au 25 juin, sur terrain neutre");
    const winner = tournament.getByTestId("internationals-winner");
    await expect(winner).toContainText(/gagne la Coupe du Vieux Continent 2028/);
    await expect(tournament.getByTestId("internationals-group")).toHaveCount(2);
    await expect(tournament.getByTestId("internationals-group-row")).toHaveCount(6);
    const knockouts = tournament.getByTestId("internationals-bracket").getByTestId("internationals-result");
    await expect(knockouts).toHaveCount(3);
    await expect(knockouts.last()).toContainText("Finale");
    await expect(tournament.getByTestId("internationals-yours")).toBeVisible();
    // The new cycle: the Hemispheres Cup 2030, both zones' qualifiers, none played yet.
    const campaign = page.getByTestId("internationals-campaign");
    await expect(campaign).toContainText("Coupe des Hémisphères 2030");
    await expect(campaign.getByTestId("internationals-zone")).toHaveCount(2);
    await expect(page.getByTestId("internationals-campaign-line")).toContainText("Coupe des Hémisphères 2030 · Éliminatoires · aucune trêve jouée sur 8");
    await expectNoSidewaysScroll(page, "internationals after the tournament, 1280");

    // One of its champions of our clubs: his title on his sheet.
    await page.goto(`/saves/${saveId}/transfers/advanced?player=${championId}`);
    await expect(page.getByTestId("player-international-titles")).toContainText("Vainqueur de la Coupe du Vieux Continent 2028");

    // The History: the club's internationals, their caps while at the club.
    await page.goto(`/saves/${saveId}/seasons`);
    const internationals = page.getByTestId("history-internationals");
    await expect(internationals).toBeVisible();
    await expect(internationals.getByTestId("history-internationals-players").locator("li").first()).toBeVisible();

    for (const [viewport, label] of [
      [PHONE, "390"],
      [SMALL_PHONE, "360"],
    ] as const) {
      await page.setViewportSize(viewport);
      for (const path of ["/internationals", "/seasons"]) {
        await page.goto(`/saves/${saveId}${path}`);
        await expectNoSidewaysScroll(page, `${path}, ${label}`);
      }
    }
  } finally {
    await page.setViewportSize(COMPUTER);
    await deleteUsers([userId]);
  }
});
