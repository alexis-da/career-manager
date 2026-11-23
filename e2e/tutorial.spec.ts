import { expect, test, type Page } from "@playwright/test";
import { createRegisteredUser, deleteUsers, shiftTutorialDays, tutorialOf, userIdOf } from "./db";
import {
  E2E_SEED,
  expectClearOfNav,
  expectNoSidewaysScroll,
  expectUncovered,
  fillCreateSaveForm,
  openScreen,
  saveIdOf,
  signInAs,
  waitForReact,
} from "./helpers";

// The first career's tutorial (docs/design/tutoriel.md): a new player's first day, from a club card to the « À demain »
// of the first match, in English on a phone, timed; the following days on a phone in French, the tutorial's days moved
// back in the database (missions, market and its proposal, squad, line-up, objectives, the tabs they bring); Escape,
// « Passer le tutoriel » and its way back from the Settings, in French on a computer; and a second career and a challenge
// save, which never have it. Each test deletes the user it made, and their saves with them.

const bubble = (page: Page) => page.getByTestId("tutorial-bubble");

/** The hero's « Jouer le match », the welcome's target. */
const playButton = (page: Page) => page.getByTestId("dashboard-next-match").getByTestId("next-match");

/** What the first day hides on the dashboard, but its hero: money, missions, objectives, the challenge, first actions. */
const HIDDEN_ON_THE_FIRST_DAY = [
  "dashboard-budget",
  "dashboard-payroll",
  "dashboard-window",
  "daily-missions",
  "dashboard-objectives",
  "dashboard-challenge",
  "dashboard-first-steps",
];

test.describe("a new player's first day, in English on a phone", () => {
  test.use({ locale: "en-GB", viewport: { width: 390, height: 844 } });

  test("goes from a club card to the « À demain » of the first match with the assistant, in under 3 minutes", async ({ page, context }) => {
    // A world of 198 clubs created, then a match played live at its normal pace.
    test.setTimeout(300_000);
    try {
      await page.goto("/");
      await expect(page.getByTestId("club-suggestion-mid-table")).toBeEnabled();
      await waitForReact(page);
      // The player's clock: from the club's card to the final whistle's « À demain ».
      const started = Date.now();
      await page.getByTestId("club-suggestion-mid-table").click();
      await page.getByTestId("create-save-options").click();
      await page.getByTestId("seed").fill(E2E_SEED);
      await page.getByTestId("create-save").click();
      await expect(page).toHaveURL(/\/saves\/[^/]+$/, { timeout: 120_000 });
      const created = Date.now();
      const saveId = saveIdOf(page);

      // Step 1, the welcome: one bubble above the navigation, the hero's « Play the match » ringed; nothing else.
      await expect(bubble(page)).toHaveAttribute("data-step", "welcome");
      await expect(bubble(page).getByTestId("tutorial-place")).toHaveText("· First day · 1 of 5");
      await expect(bubble(page).getByTestId("tutorial-text")).toContainText(/^Welcome, Coach, I'm your assistant\. Your first match is on Saturday \d+ August against .+: kick it off, I'll stay right by your side\.$/);
      await expect(playButton(page)).toHaveAttribute("data-tutorial-target", "");
      for (const hidden of HIDDEN_ON_THE_FIRST_DAY) {
        await expect(page.getByTestId(hidden), hidden).toHaveCount(0);
      }
      await expectUncovered(playButton(page));
      await expectClearOfNav(page, bubble(page));
      await expectNoSidewaysScroll(page, "welcome");

      // Step 2, the speed: the match live from its kick-off, the bubble above its controls, the speeds ringed.
      await playButton(page).click();
      const kickOff = Date.now();
      await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });
      await expect(bubble(page)).toHaveAttribute("data-step", "speed");
      await expect(bubble(page).getByTestId("tutorial-place")).toHaveText("· First day · 2 of 5");
      await expect(bubble(page).getByTestId("tutorial-text")).toHaveText(
        "The match plays out before your eyes: 45 seconds at x1. In a hurry? Switch to x2 or x4.",
      );
      await expect(page.getByTestId("live-speeds")).toHaveAttribute("data-tutorial-target", "");
      // Its target is in the bar fixed to the screen: nothing scrolls, the score stays in view.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const controls = await page.getByTestId("live-controls").boundingBox();
      const shown = await bubble(page).boundingBox();
      expect(shown !== null && controls !== null && shown.y + shown.height <= controls.y).toBe(true);
      await expectNoSidewaysScroll(page, "speed");
      // A real player's pace: x1, its own move.
      await page.getByTestId("live-speed-1").click();
      await expect(bubble(page)).toHaveCount(0);

      // Steps 3 and 4: the first choice event's card and half-time's, each with the assistant's line, then the match to
      // its end; a choice event after the first one has none.
      const choiceCard = page.getByTestId("choice-card");
      const breakCard = page.getByTestId("break-card");
      const sessionEnd = page.getByTestId("session-end");
      let choices = 0;
      let halfTime = false;
      for (;;) {
        await expect(choiceCard.or(breakCard).or(sessionEnd).first()).toBeVisible({ timeout: 90_000 });
        if (await sessionEnd.isVisible()) {
          break;
        }
        if (await choiceCard.isVisible()) {
          const line = choiceCard.getByTestId("tutorial-line");
          if (choices === 0) {
            await expect(line).toContainText("First day · 3 of 5");
            await expect(line.getByTestId("tutorial-text")).toHaveText("Your call: my advice is ticked, but you don't have to follow it.");
            await expectNoSidewaysScroll(page, "choice event");
          } else {
            await expect(line).toHaveCount(0);
          }
          choices += 1;
          await expect(choiceCard.getByTestId("choice-validate")).toBeEnabled();
          await choiceCard.getByTestId("choice-validate").click();
          await expect(choiceCard).toBeHidden({ timeout: 30_000 });
          continue;
        }
        // Half-time: the line above the card's ways on, then « Coaching » and the panel's own line.
        expect(halfTime, "one break only in a league match").toBe(false);
        halfTime = true;
        const line = breakCard.getByTestId("tutorial-line");
        await expect(line).toContainText("First day · 4 of 5");
        await expect(line.getByTestId("tutorial-text")).toHaveText(
          "In “Coaching” you can bring a player on or change the instruction; otherwise, “Resume”.",
        );
        await expectNoSidewaysScroll(page, "half-time");
        await expect(breakCard.getByTestId("break-coaching")).toBeEnabled();
        await breakCard.getByTestId("break-coaching").click();
        const panel = page.getByTestId("half-time");
        await expect(panel.getByTestId("tutorial-text")).toHaveText(
          /^(My advice is already open: “Make this substitution”, then “Resume the match”\.|Pick who comes off and who goes on, then “Resume the match”\.)$/,
        );
        await expect(panel.getByTestId("half-time-resume")).toBeEnabled();
        await panel.getByTestId("half-time-resume").click();
        await expect(panel).toBeHidden({ timeout: 30_000 });
      }
      expect(halfTime).toBe(true);

      // Step 5, the final whistle: the « À demain » ringed, the assistant's line in place of the missions, no challenge.
      const whistle = Date.now();
      await expect(sessionEnd).toHaveAttribute("data-tutorial-target", "");
      await expect(sessionEnd.getByTestId("tutorial-line")).toContainText("First day · 5 of 5");
      await expect(sessionEnd.getByTestId("tutorial-text")).toHaveText("First match done. Come back tomorrow: I'll have your first missions ready.");
      await expect(sessionEnd.getByTestId("session-end-mission")).toHaveCount(0);
      await expect(sessionEnd.getByTestId("session-end-challenge")).toHaveCount(0);
      await expect(sessionEnd.getByTestId("session-end-match")).toBeVisible();
      await expectNoSidewaysScroll(page, "full-time");
      const seconds = (from: number, to: number) => Math.round((to - from) / 100) / 10;
      const timings = {
        total: seconds(started, whistle),
        creation: seconds(started, created),
        dashboard: seconds(created, kickOff),
        match: seconds(kickOff, whistle),
        choices,
      };
      test.info().annotations.push({ type: "first day", description: JSON.stringify(timings) });
      console.log(`[tutorial] first day: ${JSON.stringify(timings)}`);
      expect(timings.total).toBeLessThan(180);

      // The day's way on: the dashboard, its last match and its season's summary now, its money and missions tomorrow.
      await page.getByTestId("live-continue").click();
      await expect(page).toHaveURL(/\/saves\/[^/]+$/);
      await expect(page.getByTestId("dashboard-last-result")).toBeVisible();
      await expect(page.getByTestId("dashboard-position")).toContainText(/\d/);
      await expect(bubble(page)).toHaveCount(0);
      for (const hidden of HIDDEN_ON_THE_FIRST_DAY) {
        await expect(page.getByTestId(hidden), hidden).toHaveCount(0);
      }
      // Its tabs too: the cup, Europe, the national teams, the challenge and the rewards come with their moment.
      await openScreen(page, "fixtures");
      await expect(page.getByTestId("nav-standings")).toBeVisible();
      for (const tab of ["nav-cup", "nav-europe", "nav-internationals"]) {
        await expect(page.getByTestId(tab), tab).toHaveCount(0);
      }
      await openScreen(page, "club");
      await expect(page.getByTestId("nav-seasons")).toBeVisible();
      for (const tab of ["nav-challenge", "nav-rewards"]) {
        await expect(page.getByTestId(tab), tab).toHaveCount(0);
      }
      await expect(page.getByTestId("settings-streak")).toHaveCount(0);
      await expect(page.getByTestId("settings-tutorial")).toBeVisible();

      // What the database keeps: each move of the day, and the first day over.
      await expect
        .poll(async () => (await tutorialOf(saveId))?.steps["full-time"]?.outcome ?? null, { timeout: 15_000 })
        .toBe("DONE");
      const kept = await tutorialOf(saveId);
      expect(kept?.day1At).not.toBeNull();
      expect(kept?.steps.welcome?.outcome).toBe("DONE");
      expect(kept?.steps.speed?.outcome).toBe("DONE");
      expect(kept?.steps["half-time"]?.outcome).toBe("DONE");
      expect(kept?.steps.choice?.outcome ?? null).toBe(choices > 0 ? "DONE" : null);
      // The following days' steps still to come: the tutorial goes on.
      expect(kept?.endedBy ?? null).toBeNull();
    } finally {
      await deleteUsers([await userIdOf(context)]);
    }
  });
});

test.describe("the following days, in French on a phone", () => {
  test.use({ locale: "fr-FR", viewport: { width: 390, height: 844 } });

  /** Waits for a step's outcome as the database keeps it. */
  const outcomeOf = (saveId: string, step: string) =>
    expect.poll(async () => (await tutorialOf(saveId))?.steps[step]?.outcome ?? null, { timeout: 15_000 });

  test("bring the missions, the market and its proposal, the squad and the line-up, then the objectives", async ({ page, context }) => {
    // A world of 198 clubs created, its first match played live to its result.
    test.setTimeout(300_000);
    try {
      await page.goto("/fr");
      await expect(page.getByTestId("club-suggestion-mid-table")).toBeEnabled();
      await waitForReact(page);
      await page.getByTestId("club-suggestion-mid-table").click();
      await page.getByTestId("create-save-options").click();
      await page.getByTestId("seed").fill(E2E_SEED);
      await page.getByTestId("create-save").click();
      await expect(page).toHaveURL(/\/saves\/[^/]+$/, { timeout: 120_000 });
      const saveId = saveIdOf(page);

      // The first day, quickly: its match live to the break and to its result, the assistant deciding on the way.
      await expect(bubble(page)).toHaveAttribute("data-step", "welcome");
      await playButton(page).click();
      await expect(page).toHaveURL(/\/saves\/[^/]+\/live\?rejouer=1$/, { timeout: 120_000 });
      await page.getByTestId("live-skip").click();
      await page.getByTestId("break-resume").click();
      await page.getByTestId("live-skip").click();
      await expect(page.getByTestId("session-end").getByTestId("tutorial-line")).toBeVisible({ timeout: 60_000 });
      await expect.poll(async () => (await tutorialOf(saveId))?.day1At ?? null, { timeout: 15_000 }).not.toBeNull();

      // The next day: the missions first, their card ringed under the hero; « Compris » is their move.
      await shiftTutorialDays(saveId, 1);
      await page.goto(`/saves/${saveId}`);
      await expect(bubble(page)).toHaveAttribute("data-step", "missions");
      await expect(bubble(page).getByTestId("tutorial-text")).toHaveText(
        "Chaque jour, trois missions : une facile, une moyenne, une difficile. Elles rapportent des jetons, à dépenser dans Club, Récompenses.",
      );
      await expect(bubble(page).getByTestId("tutorial-place")).toHaveCount(0);
      await expect(page.getByTestId("daily-missions")).toHaveAttribute("data-tutorial-target", "");
      // Money and objectives wait for their own steps.
      await expect(page.getByTestId("dashboard-budget")).toHaveCount(0);
      await expect(page.getByTestId("dashboard-objectives")).toHaveCount(0);
      await expectClearOfNav(page, bubble(page));
      await expectNoSidewaysScroll(page, "missions");
      await bubble(page).getByTestId("tutorial-got-it").click();
      await expect(bubble(page)).toHaveCount(0);
      await outcomeOf(saveId, "missions").toBe("DONE");

      // The market, while its window is open: its entry ringed, the money shown with it.
      await page.reload();
      await expect(bubble(page)).toHaveAttribute("data-step", "market");
      await expect(bubble(page).getByTestId("tutorial-text")).toHaveText(
        // A non-breaking space before the colon: a pattern is matched as the page has it.
        /^Le mercato ferme le .+\. Pour ton point faible, .+, j'ai repéré des joueurs\s:\sva voir le Marché\.$/,
      );
      await expect(page.getByTestId("nav-transfers")).toHaveAttribute("data-tutorial-target", "");
      await expect(page.getByTestId("dashboard-budget")).toBeVisible();
      await expect(bubble(page).getByTestId("tutorial-got-it")).toHaveCount(0);
      await expectNoSidewaysScroll(page, "market");
      // Its move: the Market reached, where the assistant shows the first proposal of « Mes besoins », by its « Recruter »,
      // scrolled to above the bubble (at once without motion).
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.getByTestId("nav-transfers").click();
      await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/transfers$`));
      await expect(bubble(page)).toHaveAttribute("data-step", "market");
      await expect(bubble(page).getByTestId("tutorial-text")).toHaveText(
        "Voici un joueur pour ton point faible, dans tes moyens. « Recruter » s'il te convient, « Passer » pour le suivant.",
      );
      await expect(page.getByTestId("market-proposal").getByTestId("market-recruit")).toHaveAttribute("data-tutorial-target", "");
      await expectUncovered(page.getByTestId("market-recruit"));
      await expectUncovered(page.getByTestId("market-pass"));
      await expect(bubble(page).getByTestId("tutorial-pass")).toHaveCount(0);
      await expectNoSidewaysScroll(page, "market proposal");
      await outcomeOf(saveId, "market").toBe("DONE");
      await bubble(page).getByTestId("tutorial-got-it").click();
      await expect(bubble(page)).toHaveCount(0);

      // Two steps pushed today: the dashboard has nothing more to say.
      await openScreen(page, "dashboard");
      await expect(page.getByTestId("dashboard-budget")).toBeVisible();
      await expect(bubble(page)).toHaveCount(0);

      // The squad's own step at its opening, whatever the count: its first row ringed, a profile opened its move.
      await openScreen(page, "squad");
      await expect(bubble(page)).toHaveAttribute("data-step", "squad");
      await expect(bubble(page).getByTestId("tutorial-text")).toContainText("La note, de 1 à 99, résume le niveau d'un joueur ; le cœur, sa condition.");
      await expect(page.getByTestId("squad-row").first()).toHaveAttribute("data-tutorial-target", "");
      await expect(page.locator("[data-testid^=\"tip-\"]")).toHaveCount(0);
      await expectNoSidewaysScroll(page, "squad");
      await page.getByTestId("squad-row").first().click();
      await expect(bubble(page)).toHaveCount(0);
      await outcomeOf(saveId, "squad").toBe("DONE");
      await page.keyboard.press("Escape");

      // The line-up's: the weak spot's slot ringed; a slot touched, its candidates open, then « Enregistrer » ringed.
      await openScreen(page, "lineup");
      await expect(bubble(page)).toHaveAttribute("data-step", "lineup");
      const ringed = page.locator('[data-testid="pitch-slot"][data-tutorial-target]');
      await expect(ringed).toHaveCount(1);
      await expect(page.locator("[data-testid^=\"tip-\"]")).toHaveCount(0);
      await expectNoSidewaysScroll(page, "lineup");
      await ringed.click();
      await expect(page.getByTestId("lineup-candidates-sheet")).toBeVisible();
      await expect(bubble(page)).toHaveAttribute("data-phase", "follow");
      await outcomeOf(saveId, "lineup").toBe("DONE");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("lineup-candidates-sheet")).toBeHidden();
      await expect(bubble(page).getByTestId("tutorial-text")).toHaveText("Choisis-en un, puis « Enregistrer ». Sinon, garde le mien : il est prêt.");
      await expect(page.getByTestId("lineup-save")).toHaveAttribute("data-tutorial-target", "");
      await bubble(page).getByTestId("tutorial-got-it").click();
      await expect(bubble(page)).toHaveCount(0);

      // The day after: the objectives, their card shown with them, the one the assistant picked said so.
      await shiftTutorialDays(saveId, 1);
      await openScreen(page, "dashboard");
      await expect(bubble(page)).toHaveAttribute("data-step", "objectives");
      await expect(bubble(page).getByTestId("tutorial-text")).toHaveText(
        "Voilà ce que la direction attend de toi cette saison ; j'ai pris le dernier objectif à ta place. Avant ton 5e match, elle ne juge rien.",
      );
      await expect(page.getByTestId("dashboard-objectives")).toHaveAttribute("data-tutorial-target", "");
      await expectNoSidewaysScroll(page, "objectives");
      await page.getByTestId("dashboard-objectives-detail").click();
      await expect(page).toHaveURL(new RegExp(`/saves/${saveId}/club#objectifs$`));
      await outcomeOf(saveId, "objectives").toBe("DONE");

      // What the steps brought: the rewards with the missions, the challenge from the second day; the cup, Europe and the
      // national teams still waiting for theirs.
      await expect(page.getByTestId("nav-rewards")).toBeVisible();
      await expect(page.getByTestId("nav-challenge")).toBeVisible();
      await expect(page.getByTestId("settings-streak")).toBeVisible();
      await openScreen(page, "fixtures");
      for (const tab of ["nav-cup", "nav-europe", "nav-internationals"]) {
        await expect(page.getByTestId(tab), tab).toHaveCount(0);
      }
      expect((await tutorialOf(saveId))?.endedBy ?? null).toBeNull();
    } finally {
      await deleteUsers([await userIdOf(context)]);
    }
  });
});

test.describe("in French on a computer", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 } });

  test("passes the whole tutorial with a touch, takes it up again from the Settings, and passes a step with Escape", async ({ page, context }) => {
    test.setTimeout(240_000);
    try {
      await page.goto("/fr");
      await fillCreateSaveForm(page, "Tutoriel FR", "Toulouse FC");
      await page.getByTestId("create-save").click();
      await expect(page).toHaveURL(/\/saves\/[^/]+$/, { timeout: 120_000 });
      const saveId = saveIdOf(page);

      // From 1024 px, the bubble by its target: in the page, right under the hero.
      await expect(bubble(page)).toHaveAttribute("data-step", "welcome");
      await expect(bubble(page).getByTestId("tutorial-place")).toHaveText("· Premier jour · 1 sur 5");
      const hero = await page.getByTestId("dashboard-next-match").boundingBox();
      const welcome = await bubble(page).boundingBox();
      expect(hero !== null && welcome !== null && welcome.y >= hero.y + hero.height).toBe(true);
      expect(await bubble(page).evaluate((element) => getComputedStyle(element).position)).not.toBe("fixed");
      await expect(page.getByTestId("dashboard-budget")).toHaveCount(0);

      // « Passer le tutoriel »: everything at once, and said where to take it up again.
      await bubble(page).getByTestId("tutorial-skip").click();
      await expect(bubble(page)).toHaveCount(0);
      await expect(page.getByText("Tutoriel passé. Tu peux le reprendre dans Club, Réglages.")).toBeVisible();
      await expect(page.getByTestId("dashboard-budget")).toBeVisible();
      await expect(page.getByTestId("daily-missions")).toBeVisible();
      await expect(page.getByTestId("dashboard-objectives")).toBeVisible();
      await expect.poll(async () => (await tutorialOf(saveId))?.endedBy ?? null).toBe("SKIPPED");
      expect((await tutorialOf(saveId))?.skippedStep).toBe("welcome");

      // Club → Réglages: passed, and taken up again; nothing hidden again.
      await openScreen(page, "club");
      const setting = page.getByTestId("settings-tutorial");
      await expect(setting).toHaveAttribute("data-state", "skipped");
      await setting.getByTestId("settings-tutorial-resume").click();
      await expect(page.getByText("Tutoriel repris : ton adjoint revient à la prochaine étape.")).toBeVisible();
      await expect(setting).toHaveAttribute("data-state", "running");
      await expect(setting).toContainText("En cours · jour 1");
      await openScreen(page, "dashboard");
      await expect(bubble(page)).toHaveAttribute("data-step", "welcome");
      await expect(page.getByTestId("dashboard-budget")).toBeVisible();

      // Escape passes the step, for good.
      await page.keyboard.press("Escape");
      await expect(bubble(page)).toHaveCount(0);
      await expect.poll(async () => (await tutorialOf(saveId))?.steps.welcome?.outcome ?? null).toBe("PASSED");
      await page.reload();
      await expect(page.getByTestId("dashboard-title")).toBeAttached();
      await expect(bubble(page)).toHaveCount(0);
    } finally {
      await deleteUsers([await userIdOf(context)]);
    }
  });
});

test("a second career, and a challenge save, never have the tutorial", async ({ page }) => {
  // Three worlds of 198 clubs created.
  test.setTimeout(300_000);
  // An account: three careers at once.
  const { id } = await createRegisteredUser("Tutoriel E2E");
  try {
    await signInAs(page, id);
    await page.goto("/fr");
    await fillCreateSaveForm(page, "Première carrière", "Toulouse FC");
    await page.getByTestId("create-save").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+$/, { timeout: 120_000 });
    await expect(bubble(page)).toHaveAttribute("data-step", "welcome");

    // The second career: the whole game, no bubble, and no first actions either.
    await page.goto("/fr");
    await fillCreateSaveForm(page, "Deuxième carrière", "Olympique Lyonnais");
    await page.getByTestId("create-save").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+$/, { timeout: 120_000 });
    await expect(page.getByTestId("dashboard-budget")).toBeVisible();
    await expect(page.getByTestId("daily-missions")).toBeVisible();
    await expect(page.getByTestId("dashboard-objectives")).toBeVisible();
    await expect(bubble(page)).toHaveCount(0);
    await expect(page.getByTestId("dashboard-first-steps")).toHaveCount(0);
    expect(await tutorialOf(saveIdOf(page))).toBeNull();

    // A challenge save: no tutorial, its first actions as before.
    await page.goto("/fr/defi");
    await page.getByTestId("challenge-play").click();
    await expect(page).toHaveURL(/\/saves\/[^/]+$/, { timeout: 120_000 });
    await expect(page.getByTestId("dashboard-first-steps")).toBeVisible();
    await expect(bubble(page)).toHaveCount(0);
    expect(await tutorialOf(saveIdOf(page))).toBeNull();
  } finally {
    // Even when a step failed: a leftover challenge save would count against the week's cap.
    await deleteUsers([id]);
  }
});
