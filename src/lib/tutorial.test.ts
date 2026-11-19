import { describe, expect, it } from "vitest";
import { testTranslator } from "../i18n/test-intl";
import {
  CALM_TABS,
  canResume,
  DAY_ONE_STEPS,
  dashboardStep,
  dayOnePlace,
  expiresAt,
  firstDayCalm,
  firstDayCalmOf,
  FULL_REVEAL,
  fullTimeDue,
  liveSteps,
  MAX_SHOWS,
  pendingWrites,
  REPLAY_SECONDS,
  stepsToReopen,
  TUTORIAL_DAYS,
  TUTORIAL_STEPS,
  TUTORIAL_VERSION,
  tutorialDay,
  tutorialReveal,
  tutorialSetting,
  tutorialStatus,
  utcDay,
  type StepProgress,
  type TutorialProgress,
  type TutorialStepKey,
} from "./tutorial";

const START = new Date("2026-11-19T10:00:00.000Z");
const at = (iso: string): Date => new Date(iso);
const DAY_MS = 24 * 60 * 60 * 1000;

/** A tutorial begun at START, its steps as given. */
function tutorial(changes: Partial<TutorialProgress> = {}, steps: Partial<Record<TutorialStepKey, StepProgress>> = {}): TutorialProgress {
  return {
    version: TUTORIAL_VERSION,
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
  it("are the first day's five, in the scenario's order, under keys never renamed", () => {
    expect(TUTORIAL_STEPS).toEqual(["welcome", "speed", "choice", "half-time", "full-time"]);
    expect(DAY_ONE_STEPS).toEqual(TUTORIAL_STEPS);
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

describe("the assistant's lines", () => {
  /** A line's length without its names and figures: each argument one character. */
  const ARGUMENTS = { manager: "M", date: "D", opponent: "O", seconds: REPLAY_SECONDS, normal: "1", fast: "2", fastest: "4", coaching: "C", resume: "R", apply: "A" };

  it("each hold in 140 characters, names left out, in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const t = testTranslator(locale, "tutorial.steps");
      for (const key of ["welcome", "speed", "choice", "halfTime", "halfTimeAdvice", "halfTimeNoAdvice", "fullTime"] as const) {
        const line = t(key, ARGUMENTS);
        expect(line.length, `${locale} ${key}: ${line}`).toBeLessThanOrEqual(140);
      }
    }
  });
});
