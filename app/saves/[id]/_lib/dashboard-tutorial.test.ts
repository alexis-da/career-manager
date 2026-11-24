import { describe, expect, it, vi } from "vitest";
import type { Dashboard } from "@/src/db/dashboard";
import type { ManagedLineup } from "@/src/db/lineup";
import type { ManagedBreak } from "@/src/db/nations-view";
import type { SeasonObjectivesView } from "@/src/db/objectives";
import { testTranslator } from "@/src/i18n/test-intl";
import { dashboardBubbleOf, laterContextOf, type BubbleTranslators } from "./dashboard-tutorial";

// The following days' bubbles of the dashboard (docs/design/tutoriel.md § 1.3): the context of the tutorial's rules made
// from what the dashboard reads, and each step's line, target and move. The reads are cut down to what the bubbles use.

// The marker of a server module: nothing to guard here.
vi.mock("server-only", () => ({}));

const translators = (locale: "fr" | "en"): BubbleTranslators => ({
  tutorial: testTranslator(locale, "tutorial"),
  nav: testTranslator(locale, "nav"),
  game: testTranslator(locale, "gameActions"),
  hero: testTranslator(locale, "dashboardHero"),
  todo: testTranslator(locale, "dashboardTodo"),
  positions: testTranslator(locale, "positions"),
  world: testTranslator(locale, "world"),
  lineup: testTranslator(locale, "lineup"),
});

/** The dashboard as the bubbles read it: its date, its world, the window, the next match's competition. */
const dashboardOf = (next: { competitionCode: string; cup: boolean } | null, changes: { windowOpen?: boolean } = {}) =>
  ({
    currentDate: new Date("2026-08-17T00:00:00.000Z"),
    worldVersion: 2,
    windowOpen: changes.windowOpen ?? true,
    nextMatch: next === null ? null : { fixture: next },
  }) as unknown as Dashboard;

/** A line-up whose starters have the given fitness at the next kick-off, made by the player unless told otherwise. */
const lineupOf = (fitness: readonly number[], byAssistant = false) => {
  const lineup = {
    starters: fitness.map((value, index) => ({
      player: { firstName: "Karim", lastName: `Diallo${index}`, fitness: value, injured: false, suspended: false },
      slot: "CM",
      index,
    })),
    bench: [],
  };
  return { formation: "4-3-3", lineup, weakSpotLineup: lineup, byAssistant, missingStarters: [] } as unknown as ManagedLineup;
};

const objectivesOf = (changes: Partial<SeasonObjectivesView> = {}) =>
  ({ startYear: 2026, objectives: [], choiceOpen: false, confidence: 50, early: true, over: false, ...changes }) as SeasonObjectivesView;

const LEAGUE = { competitionCode: "fr.1", cup: false };

describe("laterContextOf", () => {
  it("reads the window, the break and its players, the next match's competition, a tired starter and the board", () => {
    const upcoming = { state: "upcoming", from: new Date(), to: new Date(), players: [{}, {}] } as unknown as ManagedBreak;
    const context = laterContextOf({
      dashboard: dashboardOf({ competitionCode: "eu.1", cup: false }),
      lineup: lineupOf([90, 72]),
      objectives: objectivesOf({ early: false, objectives: [{ kind: "EUROPE" }] as unknown as SeasonObjectivesView["objectives"] }),
      internationalBreak: upcoming,
    });
    expect(context).toEqual({
      windowOpen: true,
      breakUpcoming: true,
      calledUp: 2,
      nextMatch: "europe",
      tiredStarter: true,
      lineupByAssistant: false,
      judged: true,
      objectives: true,
      europe: true,
      nations: true,
    });
  });

  it("knows a cup tie, a league match, and a save without objectives nor break", () => {
    const cup = laterContextOf({ dashboard: dashboardOf({ competitionCode: "fr.cup", cup: true }), lineup: lineupOf([]), objectives: null, internationalBreak: null });
    expect(cup).toMatchObject({ nextMatch: "cup", breakUpcoming: false, calledUp: 0, tiredStarter: false, judged: false, objectives: false, europe: false });
    const back = { state: "back", from: new Date(), to: new Date(), players: [{}] } as unknown as ManagedBreak;
    const league = laterContextOf({ dashboard: dashboardOf(LEAGUE), lineup: lineupOf([75]), objectives: objectivesOf(), internationalBreak: back });
    expect(league).toMatchObject({ nextMatch: "league", breakUpcoming: false, calledUp: 0, tiredStarter: false, judged: false });
    const assistant = laterContextOf({ dashboard: dashboardOf(LEAGUE), lineup: lineupOf([70], true), objectives: null, internationalBreak: null });
    expect(assistant).toMatchObject({ tiredStarter: true, lineupByAssistant: true });
  });
});

describe("dashboardBubbleOf", () => {
  const reads = { dashboard: dashboardOf(LEAGUE), lineup: lineupOf([90]), objectives: objectivesOf(), internationalBreak: null };

  it("points the missions at their card, « Compris » or a mission changed their move", () => {
    expect(dashboardBubbleOf("missions", reads, translators("fr"), "fr")).toEqual({
      text: "Chaque jour, trois missions : une facile, une moyenne, une difficile. Elles rapportent des jetons, à dépenser dans Club, Récompenses.",
      target: '[data-testid="daily-missions"]',
      gotIt: true,
      doneOn: '[data-testid="mission-change"]',
      place: "hero",
    });
  });

  it("says whose objective the last one is, above their card", () => {
    const own = objectivesOf({ objectives: [{ kind: "YOUTH", chosen: true, byAssistant: false }] as unknown as SeasonObjectivesView["objectives"] });
    const bubble = dashboardBubbleOf("objectives", { ...reads, objectives: own }, translators("en"), "en");
    expect(bubble).toMatchObject({ target: '[data-testid="dashboard-objectives"]', place: "objectives", gotIt: true });
    expect(bubble?.text).toContain("the last one is your own pick");
    expect(dashboardBubbleOf("objectives", reads, translators("en"), "en")?.text).toContain("I picked the last objective for you");
  });

  it("names the European competition and its league-phase matches", () => {
    const pennant = { ...reads, dashboard: dashboardOf({ competitionCode: "eu.2", cup: false }) };
    expect(dashboardBubbleOf("europe", pennant, translators("en"), "en")?.text).toBe(
      "Pennant Cup: 4 league-phase matches. The top four go straight to the quarter-finals, 5th to 12th into the play-offs.",
    );
  });

  it("names the tired starter and his fitness, « Préparer » its move; none without one", () => {
    expect(dashboardBubbleOf("fitness", reads, translators("fr"), "fr")).toBeNull();
    const tired = dashboardBubbleOf("fitness", { ...reads, lineup: lineupOf([88, 71.6]) }, translators("fr"), "fr");
    expect(tired).toMatchObject({ target: '[data-testid="dashboard-next-match"] [data-testid="dashboard-lineup"]', gotIt: false, place: "hero" });
    expect(tired?.text).toBe(
      "K. Diallo1 est fatigué (72) : il jouera moins bien et peut se blesser. Repose-le, ou rends-moi la main : je fais tourner l'effectif.",
    );
  });

  it("pushes the line-up through « Préparer »: how the assistant makes the eleven, or who can play where", () => {
    const own = dashboardBubbleOf("lineup", reads, translators("fr"), "fr");
    expect(own).toMatchObject({ target: '[data-testid="dashboard-next-match"] [data-testid="dashboard-lineup"]', gotIt: false, place: "hero" });
    expect(own?.text).toContain("qui peut jouer à chaque poste");
    const assistant = dashboardBubbleOf("lineup", { ...reads, lineup: lineupOf([90], true) }, translators("en"), "en");
    expect(assistant?.text).toBe("Before your next match, open “Prepare”: I'll show you how I make your eleven.");
  });

  it("says how many players a break takes, or that it takes none", () => {
    const upcoming = { state: "upcoming", from: new Date(), to: new Date(), players: [{}, {}, {}] } as unknown as ManagedBreak;
    expect(dashboardBubbleOf("break", { ...reads, internationalBreak: upcoming }, translators("en"), "en")?.text).toContain(
      "3 of your players are off on international duty",
    );
    expect(dashboardBubbleOf("break", reads, translators("en"), "en")?.text).toContain("none of your players is called up");
  });

  it("says farewell without a target, and leaves the welcome to the page", () => {
    expect(dashboardBubbleOf("farewell", reads, translators("en"), "en")).toEqual({
      text: "That's all from me. My advice stays in “To do”.",
      gotIt: true,
      place: "hero",
    });
    expect(dashboardBubbleOf("welcome", reads, translators("fr"), "fr")).toBeNull();
  });
});
