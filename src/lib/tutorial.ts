// The first career's tutorial (docs/design/tutoriel.md): the assistant shows, the player makes the move himself. Pure
// rules, from what the database keeps of a player's tutorial (src/db/tutorial.ts) and what a screen already reads: no
// query, no simulation, no clock of its own (`now` is the caller's real time). Its days are UTC days, as the missions'.

/** The steps of the first day, from the dashboard to the « À demain » of the first match, in the scenario's order. */
export const DAY_ONE_STEPS = ["welcome", "speed", "choice", "half-time", "full-time"] as const;

/**
 * The steps of the following days (scenario 2, § 1.3 of the cahier), from the day after the first one's « À demain »: the
 * dashboard's, two new ones a day at most, the most pressing first; the squad's and the line-up's when their screen opens.
 */
export const LATER_STEPS = [
  "missions",
  "market",
  "objectives",
  "lineup",
  "squad",
  "simulate",
  "break",
  "europe",
  "cup",
  "fitness",
  "judged",
] as const;

/** The assistant's farewell, once every step of a scenario 2 is closed: said once, outside every scenario. */
export const FAREWELL = "farewell";

/** Every step, by its key: stored in TutorialStep.step, never renamed (as MISSION_KINDS). */
export const TUTORIAL_STEPS = [...DAY_ONE_STEPS, ...LATER_STEPS, FAREWELL] as const;

export type TutorialStepKey = (typeof TUTORIAL_STEPS)[number];

export type LaterStep = (typeof LATER_STEPS)[number];

/** The steps shown when their screen opens, the first day too, never counted among a day's pushed steps. */
export const SCREEN_STEPS = ["squad", "lineup"] as const satisfies readonly LaterStep[];

export type ScreenStep = (typeof SCREEN_STEPS)[number];

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
 * The scenario of the tutorials created now (Tutorial.version): 2, the first day then the following days' steps (its
 * second release; 1 had the first day alone). A tutorial keeps the scenario it began with: a later one never replays an
 * earlier one.
 */
export const TUTORIAL_VERSION = 2;

/** A tutorial ends this many days after it began, or after it was last taken up again, whatever is left of it. */
export const TUTORIAL_DAYS = 14;

/** A step shown this many times without its move is not shown again: passed. */
export const MAX_SHOWS = 2;

/** From the second day, at most this many steps first shown a day on the dashboard: the others wait for the next. */
export const PUSHED_PER_DAY = 2;

/** Its first release: a player created from then on may have it after the challenge (src/db/tutorial.ts). */
export const TUTORIAL_SINCE = new Date("2026-11-23T00:00:00.000Z");

/** The real duration of the live replay from kick-off to the 90th minute at x1, which the speed step announces. */
export const REPLAY_SECONDS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the database keeps of a step: how many times it was shown, first when, and how it closed (null while open). */
export type StepProgress = { shows: number; shownAt?: Date | null; outcome: StepOutcome | null };

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

/**
 * What the dashboard knows of the save for the following days' steps, all of it read for its own screen already: the
 * transfer window, an international break before the club's next match, that match's competition, a tired starter, the
 * board judging, and whether the season has objectives, the club a European competition, the save national teams.
 */
export type LaterContext = {
  windowOpen: boolean;
  breakUpcoming: boolean;
  calledUp: number; // the club's players called up for that break
  nextMatch: "league" | "cup" | "europe" | null;
  tiredStarter: boolean; // a starter of the eleven under ROTATION_FITNESS at the next kick-off
  judged: boolean; // no longer « Trop tôt pour juger »
  objectives: boolean;
  europe: boolean;
  nations: boolean;
};

/** The dashboard's context: the save, and what its following days' steps need. */
export type DashboardContext = TutorialContext & { later?: LaterContext };

/** The season's moments after which a hidden tab comes by itself: its first break over, its first European matchday, its cup's first round. */
export type TutorialMoments = { breakPassed: boolean; europePassed: boolean; cupPassed: boolean };

/** « 2026-11-19 »: a date's UTC day. */
export const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

/** When a tutorial runs out: TUTORIAL_DAYS after it began, or after it was last taken up again. */
export const expiresAt = ({ startedAt, resumedAt }: Pick<TutorialProgress, "startedAt" | "resumedAt">): Date =>
  new Date((resumedAt ?? startedAt).getTime() + TUTORIAL_DAYS * DAY_MS);

/** Each scenario's steps, in its order: version 1 has the first day's alone, version 2 the following days' too. */
const SCENARIOS: Readonly<Record<number, readonly TutorialStepKey[]>> = { 1: DAY_ONE_STEPS, 2: [...DAY_ONE_STEPS, ...LATER_STEPS] };

/** The steps of a scenario, in its order (the first day's for one this code does not know). */
export const scenarioSteps = (version: number): readonly TutorialStepKey[] => SCENARIOS[version] ?? DAY_ONE_STEPS;

/** Whether a tutorial has the following days' steps. */
const hasLaterSteps = (progress: Pick<TutorialProgress, "version">): boolean => progress.version >= 2;

/** Whether a step is closed, whatever its outcome. */
export const isClosed = (progress: TutorialProgress, step: TutorialStepKey): boolean => (progress.steps[step]?.outcome ?? null) !== null;

/** How many times a step has been shown. */
const showsOf = (progress: TutorialProgress, step: TutorialStepKey): number => progress.steps[step]?.shows ?? 0;

/** Whether a step has been shown at least once, or closed: what it reveals stays shown. */
export const seenStep = (progress: TutorialProgress, step: TutorialStepKey): boolean => showsOf(progress, step) > 0 || isClosed(progress, step);

/** The days since the first day's « À demain »: 0 that UTC day, 1 the next one (the second day)…; null before it. */
export function laterDay(progress: Pick<TutorialProgress, "day1At">, now: Date): number | null {
  return progress.day1At === null ? null : Math.round((Date.parse(utcDay(now)) - Date.parse(utcDay(progress.day1At))) / DAY_MS);
}

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

/** A save's tabs the tutorial can hide: they come with their own moment. */
export const CALM_TABS = ["challenge", "rewards", "internationals", "europe", "cup"] as const;

export type CalmTab = (typeof CALM_TABS)[number];

/**
 * What a save's screens show. Everything, but in a tutorial: its first day has neither money nor missions nor objectives
 * nor challenge, and the summary of the season and « À faire » once its first match is played (their « — » would say
 * nothing before), without the market's offer and weak spot; then each comes with its step (scenario 2).
 */
export type Reveal = {
  pills: boolean; // the dashboard's budget, payroll and transfer window
  missions: boolean; // their card, the « À demain » line, the Settings' streak; none drawn nor counted the first day
  objectives: boolean; // the dashboard's card (the Club screen always has them)
  summary: boolean; // the dashboard's tiles and small table
  todo: boolean; // « À faire »
  market: boolean; // its offer received and its weak spot
  challenge: boolean; // the dashboard's and the Club screen's card, the « À demain » line
  tips: boolean; // the first steps' tips: a scenario 2 has steps of its own in their place
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

/** What a screen shows of the save: its tutorial, what it knows of the save, the season's moments, the dashboard's step. */
export type RevealContext = DashboardContext & { moments?: TutorialMoments; step?: TutorialStepKey | null };

/**
 * What a save shows: everything without a tutorial of its own; else what its first day's calm leaves, then, in a
 * scenario 2, each thing hidden once its step is shown (the one shown on this very screen included), or its moment
 * passed: money with the market (the third day, the window shut), missions and rewards with theirs, objectives with
 * theirs, the challenge from the second day, the national teams, Europe and the cup with their step shown (not one
 * closed unshown because it does not apply: a club out of Europe sees its tab with the first European matchday) or their
 * moment.
 * What was shown stays shown: a step seen never hides again, and a passed tutorial shows everything for good.
 */
/**
 * Whether the first steps' tips (« rating », « secondary », « money », « simulation ») give way to the tutorial's own
 * steps (`squad`, `lineup`, `market`, `simulate`): for the player of a scenario 2 while it runs, and once it is done.
 * Passed (even taken up again), merged into an account or run out, they come back with everything else; a scenario 1
 * keeps them but on its first day.
 */
export function tipsReplaced(progress: TutorialProgress | null, now: Date): boolean {
  if (progress === null || !hasLaterSteps(progress) || progress.skippedAt !== null) {
    return false;
  }
  const status = tutorialStatus(progress, now);
  return status === "running" || status === "finished";
}

export function tutorialReveal(progress: TutorialProgress | null, context: RevealContext): Reveal {
  if (progress === null) {
    return FULL_REVEAL;
  }
  const { now, matchesPlayed, later, moments, step = null } = context;
  const tips = !tipsReplaced(progress, now);
  if (firstDayCalm(progress, now)) {
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
  const day = laterDay(progress, now);
  if (!hasLaterSteps(progress) || progress.skippedAt !== null || tutorialStatus(progress, now) !== "running" || day === null) {
    return { ...FULL_REVEAL, tips };
  }
  const shown = (key: TutorialStepKey): boolean => seenStep(progress, key) || step === key;
  const presented = (key: TutorialStepKey): boolean => showsOf(progress, key) > 0 || step === key;
  const market = shown("market");
  return {
    pills: market || (day >= 2 && later?.windowOpen === false),
    missions: shown("missions"),
    objectives: shown("objectives") || shown("judged"),
    summary: matchesPlayed > 0,
    todo: matchesPlayed > 0,
    market,
    challenge: true,
    tips: false,
    hiddenTabs: [
      ...(shown("missions") ? [] : (["rewards"] as const)),
      ...(presented("break") || moments?.breakPassed === true ? [] : (["internationals"] as const)),
      ...(presented("europe") || moments?.europePassed === true ? [] : (["europe"] as const)),
      ...(presented("cup") || moments?.cupPassed === true ? [] : (["cup"] as const)),
    ],
  };
}

/** Whether a step may still be shown: the tutorial running, the step open, shown fewer than MAX_SHOWS times. */
const showable = (progress: TutorialProgress, step: TutorialStepKey, now: Date): boolean =>
  tutorialStatus(progress, now) === "running" && !isClosed(progress, step) && showsOf(progress, step) < MAX_SHOWS;

/**
 * The dashboard's following days' steps, the most pressing first (§ 1.3): the missions promised by the first day's
 * « À demain », then what has a deadline (the window that shuts, the break, the European match, the cup tie, a tired
 * starter), then the rest; the line-up pushed by « Préparer » from the third day if its screen never opened.
 */
const LATER_ORDER: readonly { step: LaterStep; due: (progress: TutorialProgress, later: LaterContext, day: number, matches: number) => boolean }[] = [
  { step: "missions", due: () => true },
  { step: "market", due: (_progress, later, _day, matches) => later.windowOpen && matches > 0 },
  { step: "break", due: (_progress, later) => later.breakUpcoming },
  { step: "europe", due: (_progress, later) => later.nextMatch === "europe" },
  { step: "cup", due: (_progress, later) => later.nextMatch === "cup" },
  { step: "fitness", due: (_progress, later) => later.tiredStarter },
  { step: "objectives", due: (progress, later) => later.objectives && seenStep(progress, "missions") },
  { step: "simulate", due: (_progress, _later, _day, matches) => matches >= 2 },
  { step: "judged", due: (progress, later) => later.judged && seenStep(progress, "objectives") },
  { step: "lineup", due: (_progress, _later, day) => day >= 2 },
];

/** The steps pushed on the dashboard today, first shown this UTC day: its screens' own never count. */
function pushedToday(progress: TutorialProgress, now: Date): number {
  const today = utcDay(now);
  return LATER_STEPS.filter((step) => {
    const shownAt = progress.steps[step]?.shownAt ?? null;
    return !(SCREEN_STEPS as readonly LaterStep[]).includes(step) && shownAt !== null && utcDay(shownAt) === today;
  }).length;
}

/** The farewell: once every step of a scenario 2 is closed, from the second day, said once. */
export const farewellDue = (progress: TutorialProgress, now: Date): boolean =>
  hasLaterSteps(progress) &&
  (progress.endedBy === null || progress.endedBy === "FINISHED") &&
  tutorialStatus(progress, now) === "finished" &&
  progress.steps[FAREWELL] === undefined &&
  (laterDay(progress, now) ?? 0) >= 1;

/**
 * The dashboard's step, one at a time: the welcome until the club's first match; then, in a scenario 2 and from the
 * second day, the first due of the following days' steps that was already shown or still fits in the day's
 * PUSHED_PER_DAY; once every step is closed, the farewell.
 */
export function dashboardStep(progress: TutorialProgress, { now, matchesPlayed, later }: DashboardContext): TutorialStepKey | null {
  if (matchesPlayed === 0 && showable(progress, "welcome", now)) {
    return "welcome";
  }
  if (farewellDue(progress, now)) {
    return FAREWELL;
  }
  const day = laterDay(progress, now);
  if (!hasLaterSteps(progress) || later === undefined || day === null || day < 1) {
    return null;
  }
  const room = pushedToday(progress, now) < PUSHED_PER_DAY;
  const due = LATER_ORDER.find(
    ({ step, due: isDue }) =>
      showable(progress, step, now) && isDue(progress, later, day, matchesPlayed) && ((progress.steps[step]?.shownAt ?? null) !== null || room),
  );
  return due?.step ?? null;
}


/** A screen's own step, the squad's or the line-up's: shown when its screen opens, the first day too. */
export const screenStep = (progress: TutorialProgress, step: ScreenStep, now: Date): boolean =>
  hasLaterSteps(progress) && showable(progress, step, now);

/** The Market's own bubble, its step's move made: while the market step is due there (second day on, window open, first match played). */
export function marketScreenStep(progress: TutorialProgress, { now, matchesPlayed }: TutorialContext, windowOpen: boolean): boolean {
  const day = laterDay(progress, now);
  return hasLaterSteps(progress) && day !== null && day >= 1 && windowOpen && matchesPlayed > 0 && showable(progress, "market", now);
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
 * A following day's step whose moment is gone, from what the dashboard knows: one that does not apply to the save (no
 * European competition, no national teams), adapted at once; one shown whose moment went by without its move (the window
 * shut, the break played, the European match or the cup tie no longer next, no starter tired any more), adapted too.
 * One never shown waits for its next occurrence.
 */
function laterClosure(progress: TutorialProgress, step: TutorialStepKey, later: LaterContext): boolean {
  const shown = showsOf(progress, step) > 0;
  switch (step) {
    case "europe":
      return !later.europe || (shown && later.nextMatch !== "europe");
    case "break":
      return !later.nations || (shown && !later.breakUpcoming);
    case "market":
      return shown && !later.windowOpen;
    case "cup":
      return shown && later.nextMatch !== "cup";
    case "fitness":
      return shown && !later.tiredStarter;
    default:
      return false;
  }
}

/**
 * What the tutorial closes by itself from what it is, before a write (src/db/tutorial.ts): a step shown MAX_SHOWS times
 * without its move, passed; the welcome once the first match is played another way, and, away from it, the « À demain »
 * seen but left without its links, adapted; with what the dashboard knows, a following day's step whose moment is gone
 * (laterClosure), adapted; out of time, every step left expired. Then its end, once every step is closed.
 */
export function pendingWrites(
  progress: TutorialProgress,
  { now, matchesPlayed, later }: DashboardContext,
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
    if (later !== undefined && hasLaterSteps(progress) && laterClosure(progress, step, later)) {
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
 * stay closed once its match is played, but the « À demain » until it is seen; the following days' always can.
 */
export function stepsToReopen(progress: TutorialProgress, { matchesPlayed }: Pick<TutorialContext, "matchesPlayed">): TutorialStepKey[] {
  return scenarioSteps(progress.version).filter(
    (step) =>
      progress.steps[step]?.outcome === "PASSED" &&
      ((LATER_STEPS as readonly TutorialStepKey[]).includes(step) || (step === "full-time" ? progress.day1At === null : matchesPlayed === 0)),
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
