// The first career's tutorial (docs/design/tutoriel.md): the assistant shows, the player makes the move himself. Pure
// rules, from what the database keeps of a player's tutorial (src/db/tutorial.ts) and what a screen already reads: no
// query, no simulation, no clock of its own (`now` is the caller's real time). Its days are UTC days, as the missions'.

/** The steps of the first day, from the dashboard to the « À demain » of the first match, in the scenario's order. */
export const DAY_ONE_STEPS = ["welcome", "speed", "choice", "half-time", "full-time"] as const;

/** Every step, by its key: stored in TutorialStep.step, never renamed (as MISSION_KINDS). */
export const TUTORIAL_STEPS = [...DAY_ONE_STEPS] as const;

export type TutorialStepKey = (typeof TUTORIAL_STEPS)[number];

/** What a screen does with a step: shows it, or closes it, its move made, passed, or made another way. */
export const TUTORIAL_EVENTS = ["show", "done", "pass", "adapt"] as const;

export type TutorialEventKind = (typeof TUTORIAL_EVENTS)[number];

/** A step shown or closed by a screen (src/db/tutorial.ts writes it). */
export type TutorialEvent = { step: TutorialStepKey; event: TutorialEventKind };

/** The steps of the match live: closed at the start for a player who has already played one live (the challenge's). */
export const LIVE_STEPS = ["speed", "choice", "half-time"] as const satisfies readonly TutorialStepKey[];

/**
 * How a step closes: its move made (DONE); passed, by Escape or « Passer l'étape », or shown MAX_SHOWS times without its
 * move (PASSED); the move made another way, or the step no longer applies (ADAPTED); the tutorial over before its time
 * (EXPIRED).
 */
export const STEP_OUTCOMES = ["DONE", "PASSED", "ADAPTED", "EXPIRED"] as const;

export type StepOutcome = (typeof STEP_OUTCOMES)[number];

/** How a tutorial ends: every step closed, « Passer le tutoriel », out of time, or merged into an account that had a career. */
export const TUTORIAL_ENDINGS = ["FINISHED", "SKIPPED", "EXPIRED", "MERGED"] as const;

export type TutorialEnding = (typeof TUTORIAL_ENDINGS)[number];

/**
 * The scenario of the tutorials created now (Tutorial.version): 1, the first day alone, its first release. A tutorial
 * keeps the scenario it began with: a later one never replays an earlier one.
 */
export const TUTORIAL_VERSION = 1;

/** A tutorial ends this many days after it began, or after it was last taken up again, whatever is left of it. */
export const TUTORIAL_DAYS = 14;

/** A step shown this many times without its move is not shown again: passed. */
export const MAX_SHOWS = 2;

/** Its first release: a player created from then on may have it after the challenge (src/db/tutorial.ts). */
export const TUTORIAL_SINCE = new Date("2026-11-19T00:00:00.000Z");

/** The real duration of the live replay from kick-off to the 90th minute at x1, which the speed step announces. */
export const REPLAY_SECONDS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the database keeps of a step: how many times it was shown, and how it closed (null while it is open). */
export type StepProgress = { shows: number; outcome: StepOutcome | null };

/** What the database keeps of a player's tutorial: its dates, and each step shown or closed. */
export type TutorialProgress = {
  version: number;
  startedAt: Date;
  day1At: Date | null; // the first match's « À demain », seen
  skippedAt: Date | null; // the last « Passer le tutoriel »: what was hidden stays shown
  resumedAt: Date | null; // the last time it was taken up again from Club → Réglages
  endedBy: TutorialEnding | null;
  steps: Partial<Record<TutorialStepKey, StepProgress>>;
};

/** The dates of a tutorial alone: enough to know what its first day hides. */
export type TutorialDates = Pick<TutorialProgress, "startedAt" | "day1At" | "skippedAt" | "resumedAt" | "endedBy">;

/** What a screen knows of the save, beyond the tutorial: its club's matches played (counted up to one at least). */
export type TutorialContext = { now: Date; matchesPlayed: number };

/** « 2026-11-19 »: a date's UTC day. */
export const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

/** When a tutorial runs out: TUTORIAL_DAYS after it began, or after it was last taken up again. */
export const expiresAt = ({ startedAt, resumedAt }: Pick<TutorialProgress, "startedAt" | "resumedAt">): Date =>
  new Date((resumedAt ?? startedAt).getTime() + TUTORIAL_DAYS * DAY_MS);

/** Each scenario's steps, in its order: version 1 has the first day's alone. */
const SCENARIOS: Readonly<Record<number, readonly TutorialStepKey[]>> = { 1: DAY_ONE_STEPS };

/** The steps of a scenario, in its order (the first day's for one this code does not know). */
export const scenarioSteps = (version: number): readonly TutorialStepKey[] => SCENARIOS[version] ?? DAY_ONE_STEPS;

/** Whether a step is closed, whatever its outcome. */
export const isClosed = (progress: TutorialProgress, step: TutorialStepKey): boolean => (progress.steps[step]?.outcome ?? null) !== null;

/** How many times a step has been shown. */
const showsOf = (progress: TutorialProgress, step: TutorialStepKey): number => progress.steps[step]?.shows ?? 0;

/** Where a tutorial stands: running; or over, and how (its every step closed counts, even before it is written). */
export type TutorialStatus = "running" | "skipped" | "finished" | "expired" | "merged";

export function tutorialStatus(progress: TutorialProgress, now: Date): TutorialStatus {
  switch (progress.endedBy) {
    case "SKIPPED":
      return "skipped";
    case "MERGED":
      return "merged";
    case "EXPIRED":
      return "expired";
    case "FINISHED":
      return "finished";
    case null:
      break;
  }
  if (scenarioSteps(progress.version).every((step) => isClosed(progress, step))) {
    return "finished";
  }
  return now >= expiresAt(progress) ? "expired" : "running";
}

/**
 * The calm of the first day: from the tutorial's start to the end of the UTC day of the first match's « À demain », the
 * dashboard has its hero and little more (§ 2 of the cahier). Never once the tutorial is passed (even taken up again:
 * nothing new is hidden), merged, or out of time.
 */
export function firstDayCalm(dates: TutorialDates, now: Date): boolean {
  if (dates.skippedAt !== null || (dates.endedBy !== null && dates.endedBy !== "FINISHED")) {
    return false;
  }
  if (dates.day1At !== null) {
    return utcDay(now) === utcDay(dates.day1At);
  }
  return now < expiresAt(dates);
}

/** A tutorial's dates as a query brings them beside another table's: all null without one. */
export type NullableTutorialDates = {
  startedAt: Date | null;
  day1At: Date | null;
  skippedAt: Date | null;
  resumedAt: Date | null;
  endedBy: string | null;
};

const isEnding = (value: string): value is TutorialEnding => (TUTORIAL_ENDINGS as readonly string[]).includes(value);

/** The first day's calm from a query's columns: none without a tutorial. */
export function firstDayCalmOf(row: NullableTutorialDates, now: Date): boolean {
  if (row.startedAt === null) {
    return false;
  }
  const endedBy = row.endedBy !== null && isEnding(row.endedBy) ? row.endedBy : null;
  return firstDayCalm({ startedAt: row.startedAt, day1At: row.day1At, skippedAt: row.skippedAt, resumedAt: row.resumedAt, endedBy }, now);
}

/** A save's tabs the first day can hide: they come with their own moment. */
export const CALM_TABS = ["challenge", "rewards", "internationals", "europe", "cup"] as const;

export type CalmTab = (typeof CALM_TABS)[number];

/**
 * What a save's screens show. Everything, but in the calm of its tutorial's first day: neither money nor missions nor
 * objectives nor challenge, and the summary of the season and « À faire » once its first match is played (their « — »
 * would say nothing before), without the market's offer and weak spot.
 */
export type Reveal = {
  pills: boolean; // the dashboard's budget, payroll and transfer window
  missions: boolean; // their card, the « À demain » line, the Settings' streak; none drawn nor counted that day
  objectives: boolean; // the dashboard's card (the Club screen always has them)
  summary: boolean; // the dashboard's tiles and small table
  todo: boolean; // « À faire »
  market: boolean; // its offer received and its weak spot
  challenge: boolean; // the dashboard's card and the « À demain » line
  tips: boolean; // the dashboard's tips: money, simulation
  hiddenTabs: readonly CalmTab[];
};

export const FULL_REVEAL: Reveal = {
  pills: true,
  missions: true,
  objectives: true,
  summary: true,
  todo: true,
  market: true,
  challenge: true,
  tips: true,
  hiddenTabs: [],
};

/** What a save shows: everything without a tutorial of its own, else what its first day's calm leaves. */
export function tutorialReveal(dates: TutorialDates | null, { now, matchesPlayed }: TutorialContext): Reveal {
  if (dates === null || !firstDayCalm(dates, now)) {
    return FULL_REVEAL;
  }
  const played = matchesPlayed > 0;
  return {
    pills: false,
    missions: false,
    objectives: false,
    summary: played,
    todo: played,
    market: false,
    challenge: false,
    tips: false,
    hiddenTabs: CALM_TABS,
  };
}

/** Whether a step may still be shown: the tutorial running, the step open, shown fewer than MAX_SHOWS times. */
const showable = (progress: TutorialProgress, step: TutorialStepKey, now: Date): boolean =>
  tutorialStatus(progress, now) === "running" && !isClosed(progress, step) && showsOf(progress, step) < MAX_SHOWS;

/** The dashboard's step: the welcome, until the club's first match. */
export function dashboardStep(progress: TutorialProgress, { now, matchesPlayed }: TutorialContext): TutorialStepKey | null {
  return matchesPlayed === 0 && showable(progress, "welcome", now) ? "welcome" : null;
}

/**
 * The steps a live match of the club may show, each at its moment (the page knows when): its speed, its first choice
 * event's card, its first break's card; the final whistle's « À demain » until the first day is over.
 */
export function liveSteps(progress: TutorialProgress, now: Date): TutorialStepKey[] {
  return (["speed", "choice", "half-time", "full-time"] as const).filter(
    (step) => showable(progress, step, now) && (step !== "full-time" || progress.day1At === null),
  );
}

/**
 * The first day's « À demain », once the club's first match is played: after the match live, or at the end of a simulation
 * that played it (the live steps waiting for the next match live).
 */
export const fullTimeDue = (progress: TutorialProgress, { now, matchesPlayed }: TutorialContext): boolean =>
  matchesPlayed > 0 && progress.day1At === null && showable(progress, "full-time", now);

/** « Premier jour · 2 sur 5 »: a step's place in the first day, while it lasts; null for any other. */
export function dayOnePlace(progress: TutorialProgress, step: TutorialStepKey): { index: number; total: number } | null {
  const index = (DAY_ONE_STEPS as readonly TutorialStepKey[]).indexOf(step);
  return progress.day1At !== null || index < 0 ? null : { index: index + 1, total: DAY_ONE_STEPS.length };
}

/** A step closed by the tutorial itself rather than by a move of the player's. */
export type Closure = { step: TutorialStepKey; outcome: StepOutcome };

/** What a tutorial's next write brings besides its own event: the closures due, and its end. */
export type PendingWrites = { closures: Closure[]; ending: TutorialEnding | null };

/** Where a write comes from: its own events' steps, which decide them; and whether the player has left the match. */
export type WriteOrigin = {
  excluded?: readonly TutorialStepKey[];
  away?: boolean; // a page away from the match and its « À demain »: the dashboard
};

/**
 * What the tutorial closes by itself from what it is, before a write (src/db/tutorial.ts): a step shown MAX_SHOWS times
 * without its move, passed; the welcome once the first match is played another way, and, away from it, the « À demain »
 * seen but left without its links, adapted; out of time, every step left expired. Then its end, once every step is
 * closed.
 */
export function pendingWrites(
  progress: TutorialProgress,
  { now, matchesPlayed }: TutorialContext,
  { excluded = [], away = false }: WriteOrigin = {},
): PendingWrites {
  if (progress.endedBy !== null) {
    return { closures: [], ending: null };
  }
  const open = scenarioSteps(progress.version).filter((step) => !isClosed(progress, step) && !excluded.includes(step));
  if (now >= expiresAt(progress) && open.length > 0) {
    return { closures: open.map((step) => ({ step, outcome: "EXPIRED" })), ending: "EXPIRED" };
  }
  const closures: Closure[] = open.flatMap((step): Closure[] => {
    if (step === "welcome" && matchesPlayed > 0) {
      return [{ step, outcome: "ADAPTED" }];
    }
    if (step === "full-time" && progress.day1At !== null && away) {
      return [{ step, outcome: "ADAPTED" }];
    }
    return showsOf(progress, step) >= MAX_SHOWS ? [{ step, outcome: "PASSED" }] : [];
  });
  const deciding = scenarioSteps(progress.version).filter((step) => excluded.includes(step) && !isClosed(progress, step));
  const left = open.length - closures.length + deciding.length;
  return { closures, ending: left === 0 ? "FINISHED" : null };
}

/**
 * The steps « Reprendre le tutoriel » opens again: the passed ones whose moment can still come. Those of the first day
 * stay closed once its match is played, but the « À demain » until it is seen.
 */
export function stepsToReopen(progress: TutorialProgress, { matchesPlayed }: Pick<TutorialContext, "matchesPlayed">): TutorialStepKey[] {
  return scenarioSteps(progress.version).filter(
    (step) =>
      progress.steps[step]?.outcome === "PASSED" &&
      (step === "full-time" ? progress.day1At === null : matchesPlayed === 0),
  );
}

/** Whether a step left open can still come: the welcome before the first match, the « À demain » before it is seen. */
function stillToCome(progress: TutorialProgress, step: TutorialStepKey, matchesPlayed: number): boolean {
  if (isClosed(progress, step)) {
    return false;
  }
  if (step === "welcome") {
    return matchesPlayed === 0;
  }
  return step !== "full-time" || progress.day1At === null;
}

/** Whether a passed tutorial has anything left to show once taken up again: Club → Réglages offers it only then. */
export function canResume(progress: TutorialProgress, context: TutorialContext): boolean {
  return (
    tutorialStatus(progress, context.now) === "skipped" &&
    (stepsToReopen(progress, context).length > 0 ||
      scenarioSteps(progress.version).some((step) => stillToCome(progress, step, context.matchesPlayed)))
  );
}

/** Where a tutorial stands, as Club → Réglages says it (docs/design/tutoriel.md § 3.2). */
export type TutorialSettingState =
  | { state: "running"; day: number }
  | { state: "skipped"; skippedAt: Date; canResume: boolean }
  | { state: "ended" };

export function tutorialSetting(progress: TutorialProgress, context: TutorialContext): TutorialSettingState {
  const status = tutorialStatus(progress, context.now);
  if (status === "running") {
    return { state: "running", day: tutorialDay(progress, context.now) };
  }
  if (status === "skipped" && progress.skippedAt !== null) {
    return { state: "skipped", skippedAt: progress.skippedAt, canResume: canResume(progress, context) };
  }
  return { state: "ended" };
}

/** The tutorial's day: 1 on the UTC day it began (or was taken up again), 2 the next one… */
export function tutorialDay(progress: Pick<TutorialProgress, "startedAt" | "resumedAt">, now: Date): number {
  const start = Date.parse(utcDay(progress.resumedAt ?? progress.startedAt));
  return Math.max(1, Math.floor((Date.parse(utcDay(now)) - start) / DAY_MS) + 1);
}
