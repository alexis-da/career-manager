import { describe, expect, it } from "vitest";
import { testTranslator } from "../i18n/test-intl";
import {
  CALM_TABS,
  canResume,
  DAY_ONE_STEPS,
  dashboardStep,
  dayOnePlace,
  expiresAt,
  FAREWELL,
  farewellDue,
  firstDayCalm,
  firstDayCalmOf,
  FULL_REVEAL,
  fullTimeDue,
  LATER_STEPS,
  liveSteps,
  marketScreenStep,
  MAX_SHOWS,
  pendingWrites,
  PUSHED_PER_DAY,
  REPLAY_SECONDS,
  scenarioSteps,
  screenStep,
  stepsToReopen,
  tipsReplaced,
  TUTORIAL_DAYS,
  TUTORIAL_STEPS,
  TUTORIAL_VERSION,
  tutorialDay,
  tutorialReveal,
  tutorialSetting,
  tutorialStatus,
  utcDay,
  type LaterContext,
  type StepProgress,
  type TutorialProgress,
  type TutorialStepKey,
} from "./tutorial";

const START = new Date("2026-11-19T10:00:00.000Z");
const at = (iso: string): Date => new Date(iso);
const DAY_MS = 24 * 60 * 60 * 1000;

/** A tutorial of scenario 1 (the first day alone) begun at START, its steps as given. */
function tutorial(changes: Partial<TutorialProgress> = {}, steps: Partial<Record<TutorialStepKey, StepProgress>> = {}): TutorialProgress {
  return {
    version: 1,
    startedAt: START,
    day1At: null,
    skippedAt: null,
    resumedAt: null,
    endedBy: null,
    steps,
    ...changes,
  };
}

const closed = (outcome: StepProgress["outcome"] = "DONE", shows = 1): StepProgress => ({ shows, outcome });
const shown = (shows = 1): StepProgress => ({ shows, outcome: null });

/** Every step of the first day closed as given. */
const allClosed = (outcome: StepProgress["outcome"] = "DONE") =>
  Object.fromEntries(DAY_ONE_STEPS.map((step) => [step, closed(outcome)])) as Record<TutorialStepKey, StepProgress>;

describe("the tutorial's steps", () => {
  it("are the first day's five, the following days' and the farewell, under keys never renamed", () => {
    expect(DAY_ONE_STEPS).toEqual(["welcome", "speed", "choice", "half-time", "full-time"]);
    expect(LATER_STEPS).toEqual(["missions", "market", "objectives", "lineup", "squad", "simulate", "break", "europe", "cup", "fitness", "judged"]);
    expect(TUTORIAL_STEPS).toEqual([...DAY_ONE_STEPS, ...LATER_STEPS, FAREWELL]);
    expect(FAREWELL).toBe("farewell");
  });

  it("are those of its scenario: the first day alone in the first, the following days' too in the second", () => {
    expect(TUTORIAL_VERSION).toBe(2);
    expect(scenarioSteps(1)).toEqual(DAY_ONE_STEPS);
    expect(scenarioSteps(2)).toEqual([...DAY_ONE_STEPS, ...LATER_STEPS]);
  });

  it("place each step of the first day in it while it lasts", () => {
    expect(dayOnePlace(tutorial(), "welcome")).toEqual({ index: 1, total: 5 });
    expect(dayOnePlace(tutorial(), "full-time")).toEqual({ index: 5, total: 5 });
    expect(dayOnePlace(tutorial({ day1At: at("2026-11-19T10:05:00Z") }), "choice")).toBeNull();
  });
});

describe("tutorialStatus", () => {
  it("runs until every step is closed, then is finished even before it is written", () => {
    expect(tutorialStatus(tutorial(), START)).toBe("running");
    expect(tutorialStatus(tutorial({}, allClosed()), START)).toBe("finished");
    expect(tutorialStatus(tutorial({}, { ...allClosed(), choice: shown() }), START)).toBe("running");
  });

  it("runs out TUTORIAL_DAYS after it began, or after it was last taken up again", () => {
    const expiry = new Date(START.getTime() + TUTORIAL_DAYS * DAY_MS);
    expect(expiresAt(tutorial())).toEqual(expiry);
    expect(tutorialStatus(tutorial(), new Date(expiry.getTime() - 1))).toBe("running");
    expect(tutorialStatus(tutorial(), expiry)).toBe("expired");
    expect(tutorialStatus(tutorial({ resumedAt: at("2026-11-25T08:00:00Z") }), expiry)).toBe("running");
  });

  it("says how a written end ended it", () => {
    expect(tutorialStatus(tutorial({ endedBy: "SKIPPED" }), START)).toBe("skipped");
    expect(tutorialStatus(tutorial({ endedBy: "MERGED" }), START)).toBe("merged");
    expect(tutorialStatus(tutorial({ endedBy: "EXPIRED" }), START)).toBe("expired");
    expect(tutorialStatus(tutorial({ endedBy: "FINISHED" }), START)).toBe("finished");
  });
});

describe("firstDayCalm", () => {
  it("lasts from the start to the end of the UTC day of the first « À demain »", () => {
    expect(firstDayCalm(tutorial(), START)).toBe(true);
    // Days later, its first match still not played: the first day goes on, until the tutorial runs out.
    expect(firstDayCalm(tutorial(), at("2026-11-25T10:00:00Z"))).toBe(true);
    expect(firstDayCalm(tutorial(), at("2026-12-03T10:00:00Z"))).toBe(false);
    const day1At = at("2026-11-19T22:30:00Z");
    expect(firstDayCalm(tutorial({ day1At }), at("2026-11-19T23:59:59Z"))).toBe(true);
    expect(firstDayCalm(tutorial({ day1At }), at("2026-11-20T00:00:00Z"))).toBe(false);
    // Finished that day: the calm stays until its end.
    expect(firstDayCalm(tutorial({ day1At, endedBy: "FINISHED" }, allClosed()), at("2026-11-19T23:00:00Z"))).toBe(true);
  });

  it("is never once passed, even taken up again, nor merged into an account", () => {
    expect(firstDayCalm(tutorial({ skippedAt: START, endedBy: "SKIPPED" }), START)).toBe(false);
    expect(firstDayCalm(tutorial({ skippedAt: START, resumedAt: START }), START)).toBe(false);
    expect(firstDayCalm(tutorial({ endedBy: "MERGED" }), START)).toBe(false);
  });

  it("reads a query's columns, none without a tutorial", () => {
    const empty = { startedAt: null, day1At: null, skippedAt: null, resumedAt: null, endedBy: null };
    expect(firstDayCalmOf(empty, START)).toBe(false);
    expect(firstDayCalmOf({ ...empty, startedAt: START }, START)).toBe(true);
    expect(firstDayCalmOf({ ...empty, startedAt: START, endedBy: "SKIPPED" }, START)).toBe(false);
    // An end this code does not know hides nothing more than none.
    expect(firstDayCalmOf({ ...empty, startedAt: START, endedBy: "LATER" }, START)).toBe(true);
  });
});

describe("tutorialReveal", () => {
  it("shows everything without a tutorial of the save's own, or out of its first day", () => {
    expect(tutorialReveal(null, { now: START, matchesPlayed: 0 })).toEqual(FULL_REVEAL);
    expect(tutorialReveal(tutorial({ day1At: START }), { now: at("2026-11-20T08:00:00Z"), matchesPlayed: 1 })).toEqual(FULL_REVEAL);
    expect(tutorialReveal(tutorial({ skippedAt: START, endedBy: "SKIPPED" }), { now: START, matchesPlayed: 0 })).toEqual(FULL_REVEAL);
  });

  it("hides money, missions, objectives, challenge and five tabs the first day; the summary until its first match", () => {
    const before = tutorialReveal(tutorial(), { now: START, matchesPlayed: 0 });
    expect(before).toEqual({
      pills: false,
      missions: false,
      objectives: false,
      summary: false,
      todo: false,
      market: false,
      challenge: false,
      tips: false,
      hiddenTabs: CALM_TABS,
    });
    expect(CALM_TABS).toEqual(["challenge", "rewards", "internationals", "europe", "cup"]);
    const after = tutorialReveal(tutorial({ day1At: START }), { now: START, matchesPlayed: 1 });
    expect(after).toEqual({ ...before, summary: true, todo: true });
  });
});

describe("dashboardStep", () => {
  it("is the welcome until the club's first match, twice at most", () => {
    const context = { now: START, matchesPlayed: 0 };
    expect(dashboardStep(tutorial(), context)).toBe("welcome");
    expect(dashboardStep(tutorial({}, { welcome: shown(1) }), context)).toBe("welcome");
    expect(dashboardStep(tutorial({}, { welcome: shown(MAX_SHOWS) }), context)).toBeNull();
    expect(dashboardStep(tutorial({}, { welcome: closed("PASSED") }), context)).toBeNull();
    expect(dashboardStep(tutorial(), { now: START, matchesPlayed: 1 })).toBeNull();
    expect(dashboardStep(tutorial({ endedBy: "SKIPPED", skippedAt: START }), context)).toBeNull();
  });
});

describe("liveSteps and fullTimeDue", () => {
  it("are the live steps still open, the « À demain » until the first day is over", () => {
    expect(liveSteps(tutorial(), START)).toEqual(["speed", "choice", "half-time", "full-time"]);
    const later = tutorial({ day1At: START }, { welcome: closed(), speed: closed("ADAPTED"), "full-time": closed() });
    expect(liveSteps(later, START)).toEqual(["choice", "half-time"]);
    expect(liveSteps(tutorial({}, { choice: shown(MAX_SHOWS) }), START)).toEqual(["speed", "half-time", "full-time"]);
  });

  it("brings the « À demain » once the first match is played, until it is seen", () => {
    expect(fullTimeDue(tutorial(), { now: START, matchesPlayed: 0 })).toBe(false);
    expect(fullTimeDue(tutorial(), { now: START, matchesPlayed: 1 })).toBe(true);
    expect(fullTimeDue(tutorial({ day1At: START }), { now: START, matchesPlayed: 1 })).toBe(false);
  });
});

describe("pendingWrites", () => {
  const context = { now: START, matchesPlayed: 0 };

  it("passes a step shown MAX_SHOWS times without its move", () => {
    expect(pendingWrites(tutorial({}, { welcome: shown(MAX_SHOWS) }), context)).toEqual({
      closures: [{ step: "welcome", outcome: "PASSED" }],
      ending: null,
    });
    expect(pendingWrites(tutorial({}, { welcome: shown(1) }), context)).toEqual({ closures: [], ending: null });
  });

  it("adapts the welcome of a match played another way, and, once away, the « À demain » seen without its links", () => {
    const played = tutorial({ day1At: START }, { welcome: shown(), "full-time": shown() });
    expect(pendingWrites(played, { now: START, matchesPlayed: 1 }).closures).toEqual([{ step: "welcome", outcome: "ADAPTED" }]);
    expect(pendingWrites(played, { now: START, matchesPlayed: 1 }, { away: true }).closures).toEqual([
      { step: "welcome", outcome: "ADAPTED" },
      { step: "full-time", outcome: "ADAPTED" },
    ]);
  });

  it("leaves the steps of the write's own events to them", () => {
    const played = tutorial({ day1At: START }, { welcome: shown(), "full-time": shown() });
    expect(pendingWrites(played, { now: START, matchesPlayed: 1 }, { excluded: ["full-time"], away: true }).closures).toEqual([
      { step: "welcome", outcome: "ADAPTED" },
    ]);
  });

  it("finishes the tutorial once every step is closed, one of them by the write's own event", () => {
    expect(pendingWrites(tutorial({}, allClosed()), context)).toEqual({ closures: [], ending: "FINISHED" });
    const last = tutorial({ day1At: START }, { ...allClosed(), "full-time": shown() });
    expect(pendingWrites(last, { now: START, matchesPlayed: 1 }, { excluded: ["full-time"] }).ending).toBeNull();
    expect(pendingWrites(tutorial({}, allClosed()), context, { excluded: ["welcome"] }).ending).toBe("FINISHED");
  });

  it("expires every step left once out of time", () => {
    const now = new Date(START.getTime() + TUTORIAL_DAYS * DAY_MS);
    const writes = pendingWrites(tutorial({}, { welcome: closed() }), { now, matchesPlayed: 0 });
    expect(writes.ending).toBe("EXPIRED");
    expect(writes.closures).toEqual(DAY_ONE_STEPS.slice(1).map((step) => ({ step, outcome: "EXPIRED" })));
    expect(pendingWrites(tutorial({}, allClosed()), { now, matchesPlayed: 0 })).toEqual({ closures: [], ending: "FINISHED" });
  });

  it("writes nothing more on a tutorial already over", () => {
    expect(pendingWrites(tutorial({ endedBy: "SKIPPED", skippedAt: START }, { welcome: shown(MAX_SHOWS) }), context)).toEqual({
      closures: [],
      ending: null,
    });
  });
});

describe("taking a passed tutorial up again", () => {
  const skipped = (steps: Partial<Record<TutorialStepKey, StepProgress>>, changes: Partial<TutorialProgress> = {}) =>
    tutorial({ endedBy: "SKIPPED", skippedAt: START, ...changes }, steps);

  it("opens again the passed steps whose moment can still come: the first day's until its match", () => {
    const steps = { welcome: closed("PASSED"), speed: closed("PASSED"), choice: closed("DONE") };
    expect(stepsToReopen(skipped(steps), { matchesPlayed: 0 })).toEqual(["welcome", "speed"]);
    expect(stepsToReopen(skipped(steps), { matchesPlayed: 1 })).toEqual([]);
    expect(stepsToReopen(skipped({ "full-time": closed("PASSED") }), { matchesPlayed: 1 })).toEqual(["full-time"]);
  });

  it("is offered only while something of it can still come", () => {
    expect(canResume(skipped({}), { now: START, matchesPlayed: 0 })).toBe(true);
    // The first match played, the first day seen: its live steps may still come at the next match live.
    const played = { ...allClosed(), choice: shown() };
    expect(canResume(skipped(played, { day1At: START }), { now: START, matchesPlayed: 1 })).toBe(true);
    expect(canResume(skipped(allClosed("PASSED"), { day1At: START }), { now: START, matchesPlayed: 1 })).toBe(false);
    expect(canResume(tutorial(), { now: START, matchesPlayed: 0 })).toBe(false);
  });
});

describe("tutorialDay and tutorialSetting", () => {
  it("count the tutorial's UTC days from its start, or from when it was taken up again", () => {
    expect(tutorialDay(tutorial(), START)).toBe(1);
    expect(tutorialDay(tutorial(), at("2026-11-19T23:59:00Z"))).toBe(1);
    expect(tutorialDay(tutorial(), at("2026-11-21T00:01:00Z"))).toBe(3);
    expect(tutorialDay(tutorial({ resumedAt: at("2026-11-24T09:00:00Z") }), at("2026-11-24T10:00:00Z"))).toBe(1);
    expect(utcDay(at("2026-11-19T23:30:00-02:00"))).toBe("2026-11-20");
  });

  it("say where the tutorial stands", () => {
    const context = { now: at("2026-11-21T08:00:00Z"), matchesPlayed: 1 };
    expect(tutorialSetting(tutorial({}, { choice: shown() }), context)).toEqual({ state: "running", day: 3 });
    expect(tutorialSetting(tutorial({ endedBy: "SKIPPED", skippedAt: START }), context)).toEqual({
      state: "skipped",
      skippedAt: START,
      canResume: true,
    });
    expect(tutorialSetting(tutorial({}, allClosed()), context)).toEqual({ state: "ended" });
    expect(tutorialSetting(tutorial({ endedBy: "MERGED" }), context)).toEqual({ state: "ended" });
  });
});

describe("scenario 2: the following days", () => {
  const DAY1 = at("2026-11-19T10:20:00Z");
  const DAY2 = at("2026-11-20T09:00:00Z");
  const DAY3 = at("2026-11-21T09:00:00Z");
  /** A tutorial of scenario 2 whose first day was done on START's day, its steps as given. */
  const v2 = (steps: Partial<Record<TutorialStepKey, StepProgress>> = {}, changes: Partial<TutorialProgress> = {}) =>
    tutorial({ version: 2, day1At: DAY1, ...changes }, { ...allClosed(), ...steps });
  /** The following days' steps closed as given, but those named. */
  const laterClosed = (except: readonly TutorialStepKey[] = [], outcome: StepProgress["outcome"] = "DONE") =>
    Object.fromEntries(LATER_STEPS.filter((step) => !except.includes(step)).map((step) => [step, closed(outcome)])) as Record<
      TutorialStepKey,
      StepProgress
    >;
  const LATER: LaterContext = {
    windowOpen: true,
    breakUpcoming: false,
    calledUp: 0,
    nextMatch: "league",
    tiredStarter: false,
    lineupByAssistant: false,
    judged: false,
    objectives: true,
    europe: true,
    nations: true,
  };
  const shownOn = (date: Date, shows = 1): StepProgress => ({ shows, shownAt: date, outcome: null });

  it("push nothing the first day, then the missions first, the market while the window is open", () => {
    expect(dashboardStep(v2(), { now: at("2026-11-19T22:00:00Z"), matchesPlayed: 1, later: LATER })).toBeNull();
    expect(dashboardStep(v2(), { now: DAY2, matchesPlayed: 1, later: LATER })).toBe("missions");
    const missionsDone = { missions: closed() };
    expect(dashboardStep(v2(missionsDone), { now: DAY2, matchesPlayed: 1, later: LATER })).toBe("market");
    expect(dashboardStep(v2(missionsDone), { now: DAY2, matchesPlayed: 1, later: { ...LATER, windowOpen: false } })).toBe("objectives");
    // A scenario 1 has no following days.
    expect(dashboardStep(tutorial({ day1At: DAY1 }, allClosed()), { now: DAY2, matchesPlayed: 1, later: LATER })).toBeNull();
  });

  it("put what has a moment before the rest: the break, the European match, the cup tie, a tired starter", () => {
    const steps = { missions: closed(), market: closed() };
    expect(dashboardStep(v2(steps), { now: DAY2, matchesPlayed: 1, later: { ...LATER, breakUpcoming: true } })).toBe("break");
    expect(dashboardStep(v2(steps), { now: DAY2, matchesPlayed: 1, later: { ...LATER, nextMatch: "europe" } })).toBe("europe");
    expect(dashboardStep(v2(steps), { now: DAY2, matchesPlayed: 1, later: { ...LATER, nextMatch: "cup" } })).toBe("cup");
    expect(dashboardStep(v2(steps), { now: DAY2, matchesPlayed: 1, later: { ...LATER, tiredStarter: true } })).toBe("fitness");
    // Never while the assistant makes the line-up: he rests a tired starter himself (docs/design/simplification.md § 8).
    const resting = { ...LATER, tiredStarter: true, lineupByAssistant: true };
    expect(dashboardStep(v2(steps), { now: DAY2, matchesPlayed: 1, later: resting })).toBe("objectives");
    // Then the objectives, the simulation after two matches, the judgement once the board judges, the line-up from day 3.
    expect(dashboardStep(v2(steps), { now: DAY2, matchesPlayed: 1, later: LATER })).toBe("objectives");
    const more = { ...steps, objectives: closed() };
    expect(dashboardStep(v2(more), { now: DAY2, matchesPlayed: 2, later: LATER })).toBe("simulate");
    const judged = { ...more, simulate: closed() };
    expect(dashboardStep(v2(judged), { now: DAY2, matchesPlayed: 5, later: { ...LATER, judged: true } })).toBe("judged");
    expect(dashboardStep(v2(judged), { now: DAY2, matchesPlayed: 5, later: LATER })).toBeNull();
    expect(dashboardStep(v2(judged), { now: DAY3, matchesPlayed: 5, later: LATER })).toBe("lineup");
  });

  it("push PUSHED_PER_DAY steps a day at most, a step already shown coming back whatever the count", () => {
    expect(PUSHED_PER_DAY).toBe(2);
    const today = { missions: { shows: 1, shownAt: DAY2, outcome: "DONE" as const }, market: shownOn(DAY2) };
    // Two shown today: the market, shown, comes back; nothing new is pushed.
    expect(dashboardStep(v2(today), { now: DAY2, matchesPlayed: 1, later: LATER })).toBe("market");
    const marketDone = { ...today, market: { shows: 1, shownAt: DAY2, outcome: "DONE" as const } };
    expect(dashboardStep(v2(marketDone), { now: DAY2, matchesPlayed: 1, later: LATER })).toBeNull();
    // The next day, room again.
    expect(dashboardStep(v2(marketDone), { now: DAY3, matchesPlayed: 1, later: LATER })).toBe("objectives");
    // The screens' own steps never count.
    const screens = { missions: closed(), squad: shownOn(DAY2), lineup: shownOn(DAY2) };
    expect(dashboardStep(v2(screens), { now: DAY2, matchesPlayed: 1, later: LATER })).toBe("market");
  });

  it("say farewell once every step is closed, from the second day", () => {
    const done = v2(laterClosed());
    expect(farewellDue(done, DAY2)).toBe(true);
    expect(dashboardStep(done, { now: DAY2, matchesPlayed: 3, later: LATER })).toBe(FAREWELL);
    expect(farewellDue(v2(laterClosed(), { day1At: null }), START)).toBe(false);
    expect(farewellDue(v2({ ...laterClosed(), farewell: closed() }), DAY2)).toBe(false);
    expect(farewellDue(v2(laterClosed(["judged"])), DAY2)).toBe(false);
    expect(farewellDue(v2(laterClosed(), { endedBy: "SKIPPED", skippedAt: DAY2 }), DAY2)).toBe(false);
    expect(farewellDue(tutorial({ day1At: DAY1, endedBy: "FINISHED" }, allClosed()), DAY2)).toBe(false);
  });

  it("show their screens' steps when their screen opens, the first day too, twice at most", () => {
    expect(screenStep(v2({}, { day1At: null }), "squad", START)).toBe(true);
    expect(screenStep(v2(), "lineup", DAY2)).toBe(true);
    expect(screenStep(v2({ lineup: shown(MAX_SHOWS) }), "lineup", DAY2)).toBe(false);
    expect(screenStep(v2({ squad: closed() }), "squad", DAY2)).toBe(false);
    expect(screenStep(tutorial(), "squad", START)).toBe(false);
    expect(screenStep(v2({}, { endedBy: "SKIPPED", skippedAt: DAY2 }), "squad", DAY2)).toBe(false);
  });

  it("show the Market's own bubble from the second day, the window open, a first match played", () => {
    expect(marketScreenStep(v2(), { now: DAY2, matchesPlayed: 1 }, true)).toBe(true);
    expect(marketScreenStep(v2(), { now: at("2026-11-19T20:00:00Z"), matchesPlayed: 1 }, true)).toBe(false);
    expect(marketScreenStep(v2(), { now: DAY2, matchesPlayed: 1 }, false)).toBe(false);
    expect(marketScreenStep(v2(), { now: DAY2, matchesPlayed: 0 }, true)).toBe(false);
    expect(marketScreenStep(v2({ market: closed() }), { now: DAY2, matchesPlayed: 1 }, true)).toBe(false);
    expect(marketScreenStep(tutorial({ day1At: DAY1 }), { now: DAY2, matchesPlayed: 1 }, true)).toBe(false);
  });

  it("replace the first steps' tips while a scenario 2 runs and once it is done; passed or run out, they come back", () => {
    expect(tipsReplaced(null, DAY2)).toBe(false);
    expect(tipsReplaced(tutorial(), DAY2)).toBe(false);
    expect(tipsReplaced(v2(), DAY2)).toBe(true);
    expect(tipsReplaced(v2({}, { day1At: null }), START)).toBe(true);
    expect(tipsReplaced(v2(laterClosed()), DAY2)).toBe(true);
    expect(tipsReplaced(v2({}, { endedBy: "SKIPPED", skippedAt: DAY2 }), DAY2)).toBe(false);
    expect(tipsReplaced(v2({}, { skippedAt: DAY2, resumedAt: DAY3 }), DAY3)).toBe(false);
    expect(tipsReplaced(v2({}, { endedBy: "MERGED" }), DAY2)).toBe(false);
    expect(tipsReplaced(v2(), new Date(START.getTime() + TUTORIAL_DAYS * DAY_MS))).toBe(false);
  });

  it("reveal each thing with its step, the one shown on this screen included, or with its moment", () => {
    const context = { now: DAY2, matchesPlayed: 1, later: LATER };
    expect(tutorialReveal(v2(), context)).toEqual({
      pills: false,
      missions: false,
      objectives: false,
      summary: true,
      todo: true,
      market: false,
      challenge: true,
      tips: false,
      hiddenTabs: ["rewards", "internationals", "europe", "cup"],
    });
    const withMissions = tutorialReveal(v2(), { ...context, step: "missions" });
    expect(withMissions.missions).toBe(true);
    expect(withMissions.hiddenTabs).toEqual(["internationals", "europe", "cup"]);
    const seen = tutorialReveal(v2({ missions: closed(), market: closed(), objectives: closed(), break: closed() }), context);
    expect(seen).toMatchObject({ pills: true, missions: true, objectives: true, market: true });
    expect(seen.hiddenTabs).toEqual(["europe", "cup"]);
    // The judgement shows the objectives too; the moments bring their tabs by themselves.
    expect(tutorialReveal(v2({ judged: closed("ADAPTED") }), context).objectives).toBe(true);
    const moments = { breakPassed: true, europePassed: true, cupPassed: false };
    expect(tutorialReveal(v2(), { ...context, moments }).hiddenTabs).toEqual(["rewards", "cup"]);
    // A step closed unshown, because it does not apply to the club, brings no tab: its moment does.
    const outOfEurope = v2({ europe: { shows: 0, outcome: "ADAPTED" } });
    expect(tutorialReveal(outOfEurope, context).hiddenTabs).toContain("europe");
    expect(tutorialReveal(outOfEurope, { ...context, moments: { ...moments, europePassed: true } }).hiddenTabs).not.toContain("europe");
  });

  it("show the money from the third day once the window is shut, everything once the tutorial is passed or over", () => {
    const shut = { ...LATER, windowOpen: false };
    expect(tutorialReveal(v2(), { now: DAY2, matchesPlayed: 1, later: shut }).pills).toBe(false);
    expect(tutorialReveal(v2(), { now: DAY3, matchesPlayed: 1, later: shut }).pills).toBe(true);
    // Passed, everything at once, its tips too; done, its own steps have said what the tips would.
    expect(tutorialReveal(v2({}, { endedBy: "SKIPPED", skippedAt: DAY2 }), { now: DAY2, matchesPlayed: 1 })).toEqual(FULL_REVEAL);
    expect(tutorialReveal(v2(laterClosed()), { now: DAY2, matchesPlayed: 1 })).toEqual({ ...FULL_REVEAL, tips: false });
    // The first day's calm stays the same in both scenarios.
    expect(tutorialReveal(v2({}, { day1At: null }), { now: START, matchesPlayed: 0 })).toEqual(
      tutorialReveal(tutorial(), { now: START, matchesPlayed: 0 }),
    );
  });

  it("adapt a step that does not apply, or whose moment went by once shown; one never shown waits", () => {
    const context = { now: DAY2, matchesPlayed: 1 };
    const away = { away: true };
    const noEurope = pendingWrites(v2(), { ...context, later: { ...LATER, europe: false, nations: false } }, away);
    expect(noEurope.closures).toEqual([
      { step: "break", outcome: "ADAPTED" },
      { step: "europe", outcome: "ADAPTED" },
    ]);
    const shownSteps = { market: shown(), break: shown(), europe: shown(), cup: shown(), fitness: shown() };
    const gone = { ...LATER, windowOpen: false, breakUpcoming: false, nextMatch: "league" as const, tiredStarter: false };
    expect(pendingWrites(v2(shownSteps), { ...context, later: gone }, away).closures).toEqual([
      { step: "market", outcome: "ADAPTED" },
      { step: "break", outcome: "ADAPTED" },
      { step: "europe", outcome: "ADAPTED" },
      { step: "cup", outcome: "ADAPTED" },
      { step: "fitness", outcome: "ADAPTED" },
    ]);
    expect(pendingWrites(v2(), { ...context, later: gone }, away).closures).toEqual([]);
    // Nothing for a tired starter while the assistant makes the line-up: closed at once, shown or not, a tired starter or not.
    for (const tiredStarter of [true, false]) {
      const assistant = { ...LATER, windowOpen: false, nextMatch: "league" as const, tiredStarter, lineupByAssistant: true };
      expect(pendingWrites(v2(), { ...context, later: assistant }, away).closures).toEqual([{ step: "fitness", outcome: "ADAPTED" }]);
      expect(pendingWrites(v2({ fitness: shown() }), { ...context, later: assistant }, away).closures).toEqual([
        { step: "fitness", outcome: "ADAPTED" },
      ]);
    }
    // Without what the dashboard knows, nothing of the kind.
    expect(pendingWrites(v2(shownSteps), context, away).closures).toEqual([]);
  });

  it("finish once the following days' steps are closed too, and expire those left", () => {
    expect(pendingWrites(v2(), { now: DAY2, matchesPlayed: 1 }).ending).toBeNull();
    expect(pendingWrites(v2(laterClosed()), { now: DAY2, matchesPlayed: 1 }).ending).toBe("FINISHED");
    const now = new Date(START.getTime() + TUTORIAL_DAYS * DAY_MS);
    const writes = pendingWrites(v2(laterClosed(["cup", "judged"])), { now, matchesPlayed: 9 });
    expect(writes).toEqual({
      closures: [
        { step: "cup", outcome: "EXPIRED" },
        { step: "judged", outcome: "EXPIRED" },
      ],
      ending: "EXPIRED",
    });
  });

  it("open again, taken up, every following day's step passed", () => {
    const skipped = v2({ market: closed("PASSED"), squad: closed("PASSED"), cup: closed("DONE") }, { endedBy: "SKIPPED", skippedAt: DAY2 });
    expect(stepsToReopen(skipped, { matchesPlayed: 3 })).toEqual(["market", "squad"]);
    expect(canResume(skipped, { now: DAY2, matchesPlayed: 3 })).toBe(true);
  });
});

describe("the assistant's lines", () => {
  /** A line's length without its names and figures: each argument one character. */
  const ARGUMENTS = {
    manager: "M",
    date: "D",
    opponent: "O",
    seconds: REPLAY_SECONDS,
    normal: "1",
    fast: "2",
    fastest: "4",
    coaching: "C",
    resume: "R",
    apply: "A",
    club: "C",
    rewards: "R",
    position: "P",
    market: "M",
    sign: "S",
    pass: "P",
    save: "S",
    prepare: "P",
    simulate: "S",
    count: 2,
    competition: "C",
    player: "P",
    fitness: 70,
    todo: "T",
  };
  const KEYS = [
    "welcome",
    "speed",
    "choice",
    "halfTime",
    "halfTimeAdvice",
    "halfTimeNoAdvice",
    "fullTime",
    "missions",
    "market",
    "marketProposal",
    "objectives",
    "objectivesOwn",
    "lineupPick",
    "lineupPush",
    "lineupPushAssistant",
    "simulate",
    "break",
    "breakNone",
    "europe",
    "cup",
    "fitness",
    "judged",
    "farewell",
  ] as const;

  it("each hold in 140 characters, names left out, in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const t = testTranslator(locale, "tutorial.steps");
      for (const key of KEYS) {
        const line = t(key, ARGUMENTS);
        expect(line.length, `${locale} ${key}: ${line}`).toBeLessThanOrEqual(140);
        // Typography only: a non-breaking space where French wants one, never a control character.
        expect(line, `${locale} ${key}`).not.toMatch(/\p{Cc}/u);
      }
      // A screen's lines name the gesture of the screen they are read on.
      for (const touch of ["touch", "click"] as const) {
        for (const key of ["lineup", "squad"] as const) {
          const line = t(key, { touch });
          expect(line.length, `${locale} ${key} ${touch}: ${line}`).toBeLessThanOrEqual(140);
        }
      }
    }
  });
});
