"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { isNewVersionError } from "@/app/_lib/new-version";
import type { FixtureWithEvents, MatchEventView, ScoreTimeline } from "@/src/db/calendar";
import type { HalfTimeTeam, LivePauseView, LiveStep } from "@/src/db/live-match";
import { EXTRA_TIME_END_MINUTE, HALF_TIME_MINUTE } from "@/src/engine/balance";
import { DAY_ONE_STEPS, REPLAY_SECONDS, type TutorialEvent, type TutorialStepKey } from "@/src/lib/tutorial";

/** How the player's move closes a tutorial's step: made, or made another way. */
type TutorialCloseEvent = Exclude<TutorialEvent["event"], "show">;
import type { LivePause } from "@/src/engine/live";
import type { Instruction, InstructionSpan } from "@/src/engine/match";
import { SessionEndCard } from "../../_components/session-end-card";
import { TutorialBubble } from "../../_components/tutorial/tutorial-bubble";
import { TutorialLine } from "../../_components/tutorial/tutorial-line";
import { useTutorialEvents } from "../../_components/tutorial/use-tutorial";
import { decisionMoment } from "../../_lib/decisions";
import type { SessionEnd } from "../../_lib/session-end";
import { REGULATION_MINUTES, shootoutKicks } from "../../_lib/match-events";
import { matchResultFor } from "../../_lib/stage";
import { playLiveStepAction, type DecisionInput, type HalfTimeChoiceInput, type LiveMoveInput } from "../../actions";
import { playNationLiveStepAction } from "../../nation/actions";
import { decidedTeam } from "../_lib/decided-team";
import { shownInstruction } from "../_lib/live-instruction";
import { instructionChanges } from "../../_lib/instruction-changes";
import {
  coachingTarget,
  endMinute as endMinuteOf,
  goesToExtraTime,
  isMatchBreak,
  pauseKey,
  skipTarget,
  stepUntil,
  type StepUntil,
} from "../_lib/live-pause";
import { readAgain, withStep, type LiveData } from "../_lib/live-step";
import { countFor } from "../_lib/match-stats";
import { readStopRequest, stopRequestKey, subscribeToStopRequests, writeStopRequest } from "../_lib/stop-request";
import { BreakCard } from "./break-card";
import { ChoiceCard, type ChoiceCardDecision, type ChoiceThen } from "./choice-card";
import { HalfTime } from "./half-time";
import { LiveControls, type Speed } from "./live-controls";
import { LiveFeed } from "./live-feed";
import { LiveOtherMatches } from "./live-other-matches";
import { LiveScoreCard } from "./live-score-card";
import { LiveShootout } from "./live-shootout";
import { LiveStats } from "./live-stats";

const TICK_MS = 100;
const MINUTES_PER_TICK = (REGULATION_MINUTES * TICK_MS) / (REPLAY_SECONDS * 1000);
/** A shoot-out kick every this many milliseconds, at normal speed. */
const KICK_MS = 1_400;
/** A score of the other matches stays highlighted this many match minutes after a goal. */
const RECENT_GOAL_MINUTES = 3;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const prefersReducedMotion = (): boolean => window.matchMedia(REDUCED_MOTION_QUERY).matches;

/**
 * The clock minute an event appears at: its minute, but a regular-time event in stoppage time (91' and on, the
 * second half's) comes with the 90th, before extra time's 91st.
 */
const clockMinute = (event: { minute: number; period: MatchEventView["period"] }): number =>
  event.period === "REGULAR" ? Math.min(event.minute, REGULATION_MINUTES) : event.minute;

/** Nothing brought to a pause: the assistant's decision, no change, no instruction. */
const NO_MOVE: LiveMoveInput = { decision: null, changes: null, instruction: null };

/**
 * The step of the match from a pause, as the server plays it: the managed club's match, or his national team's (N4b), the
 * same moves, the same result.
 */
const STEP_ACTIONS = { club: playLiveStepAction, nation: playNationLiveStepAction } as const;

/**
 * The player's decision on the choice event of a pause, taken on its card: sent at once (« Valider », the card staying
 * until the match goes on), or with what the Coaching panel brings (« Coaching », or a stop asked for at that pause).
 */
type Chosen = { at: string; decision: DecisionInput; index: number; then: ChoiceThen };

/**
 * What a stop shows once its choice event is answered: a break's card, the Coaching panel, or the match alone, the bar
 * keeping the ways on. A break opens on its card, any other stop on the panel: one asked for, or the card's « Coaching ».
 */
type StopView = "break" | "coaching" | "none";

/**
 * The tutorial's steps of a match live (docs/design/tutoriel.md § 1.1): those that may still show here, each at its moment
 * (the speed while the clock first runs, the first choice event's card, the first break's card), whether its welcome is
 * left to close (the match it spoke of is open), and whether its first day still runs (its place in the day shown).
 */
export type LiveTutorial = { steps: TutorialStepKey[]; welcome: boolean; dayOne: boolean };

type LiveMatchProps = {
  saveId: string;
  dashboardHref: string; // where the way out and « Continuer » lead: the save's home, or the national team's tab
  caption: string;
  match: FixtureWithEvents; // its events up to where it is played, never further
  others: ScoreTimeline[];
  pause: LivePauseView | null; // where the match waits, with its choice event; null once over
  team: HalfTimeTeam | null; // the managed club at that pause: the Coaching panel's
  instructions: InstructionSpan[] | null; // the managed club's up to that pause; null once over, its state gone
  startMinute: number; // 0 from kick-off; the pause's minute to go on from where the match waits
  sessionEnd: SessionEnd | null; // the « À demain » card's, read once the match is over; null before
  // The national coach's match (N4b) rather than his club's: its two nations' codes, their marks on the score card; its
  // steps are his nation's, the way out leads to his national team's tab. Absent for the club's.
  nations?: { home: string; away: string };
  tutorial?: LiveTutorial | null; // the club's match of a save following a tutorial; never a national match
};

type ReplayProps = Omit<LiveMatchProps, "match" | "pause" | "team" | "instructions"> & {
  data: LiveData;
  onStep: (step: LiveStep) => void;
  speed: Speed;
  onSpeedChange: (speed: Speed) => void;
};

/**
 * The match as the server plays it: a clock runs and the saved events appear as it passes their minute; nothing is
 * drawn here. The server plays one segment of 15 minutes at a time, one call a step that brings what the page shows,
 * never read again: the clock runs up to the pause the match waits at, holds there while the page asks for the next
 * segment, once per pause, then goes on with what comes back. The match stops for its manager at a break, with its card
 * (the score, a word of his assistant's, « Reprendre » and « Coaching »), at a choice event, whose card he answers, the
 * match going on at once unless he asks for the panel, and where he asked for it (« Pause à la 30e »), where the panel
 * opens. The Coaching panel never opens by itself. « live-skip » takes the clock to the pause and asks for all that
 * comes before the next break, or the end, his assistant deciding the choice events on the way. A cup tie that went to
 * extra time runs on to 120' (« Prolongation »), then its shoot-out kick by kick. With reduced motion, the match goes
 * from one stop to the next at once, its choice events and breaks shown. The national coach's match is played the same
 * way, its nations by their codes, its steps his nation's.
 */
function Replay({
  saveId,
  dashboardHref,
  caption,
  others,
  startMinute,
  sessionEnd,
  nations,
  tutorial = null,
  data,
  onStep,
  speed,
  onSpeedChange,
}: ReplayProps) {
  const t = useTranslations("live");
  const tTutorial = useTranslations("tutorial");
  const tHalfTime = useTranslations("halfTime");
  const tNational = useTranslations("nationalLive");
  const tCommon = useTranslations("common");
  const playStep = STEP_ACTIONS[nations === undefined ? "club" : "nation"];
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, () => false);
  const router = useRouter();
  const { match, pause, team, instructions } = data;
  const [clock, setClock] = useState(startMinute); // match minutes, fractional
  const [kicksTaken, setKicksTaken] = useState(0);
  const [skipping, setSkipping] = useState(false); // live-skip pressed: to the next break, or the end, at once
  const [shownAt, setShownAt] = useState<{ at: string; view: StopView } | null>(null); // what a stop shows, once changed
  const [coachedAt, setCoachedAt] = useState<string | null>(null); // the break whose Coaching panel has been opened
  const [resumingAt, setResumingAt] = useState<string | null>(null); // the pause the match is going on from
  const [failedAt, setFailedAt] = useState<string | null>(null); // the pause whose next step failed: live-skip asks again
  // The pause asked for (« Pause à la 30e »), kept for the tab's session, so a reload stops there too: read once the
  // page runs in the browser, undefined until then (the server has no session), when nothing is asked from a pause.
  const stopKey = stopRequestKey(saveId, match.id);
  const storedStop = useSyncExternalStore(subscribeToStopRequests, () => readStopRequest(stopKey), () => undefined);
  const stopKnown = storedStop !== undefined;
  const stopAt = storedStop ?? null;
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const askedAt = useRef<string | null>(null); // the pause the next step was asked from: once per pause
  const resuming = useRef<string | null>(null); // the same, for a resume: one per pause, however fast the presses
  const coachingRef = useRef<HTMLButtonElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLAnchorElement>(null);
  // The tutorial (docs/design/tutoriel.md § 1.1): its steps closed here by the player's moves, the tutorial skipped from
  // here, the break whose Coaching panel has its line, and the events sent by the page itself, each once.
  const sendTutorial = useTutorialEvents(saveId);
  const [tutorialClosed, setTutorialClosed] = useState<ReadonlySet<TutorialStepKey>>(() => new Set());
  const [tutorialSkipped, setTutorialSkipped] = useState(false);
  const [coachingLineAt, setCoachingLineAt] = useState<string | null>(null);
  const tutorialSent = useRef(new Set<string>());
  const speedSeen = useRef(false); // the speed's bubble has been shown in this match

  const key = pause === null ? null : pauseKey(pause);
  const breakPhase = pause !== null && isMatchBreak(pause.phase) ? pause.phase : null;
  const atBreak = breakPhase !== null;
  const choice = pause?.choice ?? null;
  const decided = chosen !== null && chosen.at === key ? chosen : null;
  // Where the match stops for its manager: a break; a choice event, or a stop he asked for, unless he skips them.
  const stopsHere = pause !== null && (atBreak || (!skipping && (choice !== null || stopAt === key)));
  const extraTime = goesToExtraTime(pause, match.decidedBy);
  const endMinute = endMinuteOf(pause, match.decidedBy);
  const until = stepUntil(skipping, reducedMotion);
  const kicks = pause === null ? shootoutKicks(match.events) : [];
  const clockDone = reducedMotion || skipping || clock >= endMinute;
  const shownKicks = reducedMotion || skipping ? kicks.length : kicksTaken;
  // What the replay stops at: a stop for the manager, or the end once the shoot-out is shown. Elsewhere, the clock only
  // waits for the next segment, the match still live.
  const finished = clockDone && (stopsHere || (pause === null && shownKicks >= kicks.length));
  const stopped = clockDone && (stopsHere || pause === null);
  const over = finished && pause === null;
  const atStop = clockDone && stopsHere;
  // The choice event's card, until it is answered, or until the match goes on with a decision sent at once.
  const cardOpen = atStop && choice !== null && (decided === null || decided.then === "resume");
  const view: StopView = shownAt !== null && shownAt.at === key ? shownAt.view : atBreak ? "break" : "coaching";
  const breakOpen = atStop && atBreak && team !== null && view === "break";
  const panelOpen = atStop && !cardOpen && team !== null && view === "coaching";
  // At a break whose panel has not been opened, no change can be lost: the bar has the card's way on too.
  const resumeOffered = atStop && atBreak && coachedAt !== key;
  const minute = clockDone ? endMinute : Math.floor(clock);
  const inExtraTime = minute > REGULATION_MINUTES;
  // At the end, every event; before, those whose minute has come (the other matches stop where the clock is too).
  const isShown = (event: { minute: number; period: MatchEventView["period"] }): boolean => over || clockMinute(event) <= minute;

  // A tutorial's step still open in this match: the server's, but for one closed here or the tutorial skipped.
  const tutorialOpen = (step: TutorialStepKey): boolean =>
    tutorial !== null && !tutorialSkipped && tutorial.steps.includes(step) && !tutorialClosed.has(step);
  // A step closed by a move of the player's, its event sent; one the bubble closed itself has sent its own.
  const closeTutorial = (step: TutorialStepKey, event: TutorialCloseEvent | null): void => {
    if (!tutorialOpen(step)) {
      return;
    }
    setTutorialClosed((closed) => new Set([...closed, step]));
    if (event !== null) {
      sendTutorial([{ step, event }]);
    }
  };
  const place = (step: (typeof DAY_ONE_STEPS)[number]) =>
    tutorial?.dayOne === true ? { index: DAY_ONE_STEPS.indexOf(step) + 1, total: DAY_ONE_STEPS.length } : null;
  // The speed, from the kick-off of a match opened at its start to its first stop (a choice event, half-time): its
  // moment is over then, whatever the clock does next.
  const firstStop = Math.min(
    HALF_TIME_MINUTE,
    ...match.decisions.map((decision) => decision.minute),
    ...(pause !== null && pause.choice !== null ? [pause.minute] : []),
  );
  const speedBubble = tutorialOpen("speed") && !reducedMotion && startMinute === 0 && !skipping && !atStop && minute < firstStop;
  const choiceLine = tutorialOpen("choice") && cardOpen;
  const breakLine = tutorialOpen("half-time") && breakOpen;

  // What the page tells the tutorial by itself, each once: the welcome done (the match it spoke of is open), the speed's
  // moment over without a speed chosen (its first stop reached, or never a clock with reduced motion), a card's line shown.
  useEffect(() => {
    const sendOnce = (once: string, events: TutorialEvent[]) => {
      if (!tutorialSent.current.has(once)) {
        tutorialSent.current.add(once);
        sendTutorial(events);
      }
    };
    if (tutorial === null || tutorialSkipped) {
      return;
    }
    if (tutorial.welcome) {
      sendOnce("welcome", [{ step: "welcome", event: "done" }]);
    }
    if (speedBubble) {
      speedSeen.current = true;
    } else if (tutorial.steps.includes("speed") && !tutorialClosed.has("speed") && (speedSeen.current || reducedMotion)) {
      sendOnce("speed", [{ step: "speed", event: "adapt" }]);
    }
    if (key !== null && choiceLine) {
      sendOnce(`choice:${key}`, [{ step: "choice", event: "show" }]);
    }
    if (key !== null && breakLine) {
      sendOnce(`half-time:${key}`, [{ step: "half-time", event: "show" }]);
    }
  });

  const ticking = !clockDone;
  const kicking = clockDone && pause === null && shownKicks < kicks.length;
  useEffect(() => {
    if (!ticking && !kicking) {
      return;
    }
    const timer = ticking
      ? window.setInterval(() => setClock((current) => Math.min(endMinute, current + MINUTES_PER_TICK * speed)), TICK_MS)
      : window.setInterval(() => setKicksTaken((taken) => Math.min(kicks.length, taken + 1)), KICK_MS / speed);
    return () => window.clearInterval(timer);
  }, [ticking, kicking, speed, endMinute, kicks.length]);

  /**
   * One step of the match from a pause, as the server plays it: what comes back is added to the page. A pause the player
   * resumed (`resumed`) has the clock go on from it at its own pace, whatever took it there, in the same render: before
   * the step, inside the Coaching panel's transition, it came after the step's own update. Refused, the match no longer
   * waits there (another tab): the page reads where it stands. Failed, live-skip asks again.
   */
  const play = useCallback(
    (at: LivePause, move: LiveMoveInput, mode: StepUntil, resumed = false): Promise<void> =>
      playStep(saveId, { phase: at.phase, minute: at.minute }, move, mode).then(
        (result) => {
          if (result.ok) {
            if (resumed) {
              setSkipping(false);
              writeStopRequest(stopKey, null);
              setClock(at.minute);
            }
            onStep(result.step);
          } else {
            toast.error(result.message);
            router.refresh();
          }
        },
        (error: unknown) => {
          askedAt.current = null;
          setFailedAt(pauseKey(at));
          toast.error(isNewVersionError(error) ? tCommon("newVersion") : t("stepFailed"));
        },
      ),
    [playStep, saveId, stopKey, onStep, router, t, tCommon],
  );

  // The clock at a pause: where the manager acts, the card or the panel opens, which needs the team at the pause: without
  // it, the match went on between the page's reads, which are read again. Anywhere else what follows is asked for, once,
  // never before the stop asked for is read: after a reload, the clock is at the pause from the first render.
  useEffect(() => {
    if (pause === null || !clockDone || !stopKnown) {
      return;
    }
    const at = pauseKey(pause);
    if (askedAt.current === at || failedAt === at || (stopsHere && team !== null)) {
      return;
    }
    askedAt.current = at;
    if (stopsHere) {
      router.refresh();
      return;
    }
    void play(pause, NO_MOVE, until);
  }, [pause, clockDone, stopKnown, stopsHere, team, failedAt, until, play, router]);

  // A stop asked for at a pause the match has gone past (another tab, the end of the match): forgotten.
  useEffect(() => {
    if (stopAt !== null && stopAt !== key) {
      writeStopRequest(stopKey, null);
    }
  }, [stopAt, key, stopKey]);

  // « live-skip » disappears with the final whistle: keep the keyboard focus on the next step.
  useEffect(() => {
    if (over && skipping) {
      continueRef.current?.focus();
    }
  }, [over, skipping]);

  // To the pause at once, then on to the next break or the end; after a failed step, it is asked for again. The speed's
  // moment is over.
  const skip = () => {
    closeTutorial("speed", "adapt");
    setSkipping(true);
    setFailedAt(null);
    writeStopRequest(stopKey, null);
  };

  /**
   * The pause resumed, once: the clock goes on from it once its step is played (play). Refused or failed, the ways on come
   * back, the card's and the panel's as the bar's.
   */
  const resumeWith = (move: LiveMoveInput): Promise<void> => {
    if (pause === null || key === null || resuming.current === key) {
      return Promise.resolve();
    }
    resuming.current = key;
    setResumingAt(key);
    return play(pause, move, stepUntil(false, reducedMotion), true).finally(() => {
      resuming.current = null;
      setResumingAt(null);
    });
  };

  // What the stop shows: its card, the panel or the match alone.
  const show = (shownView: StopView): void => {
    if (key !== null) {
      setShownAt({ at: key, view: shownView });
    }
  };

  // The Coaching panel, on demand: from a break's card, the bar, or a choice event's card.
  const openPanel = (): void => {
    show("coaching");
    setCoachedAt(key);
  };

  /**
   * The card answered. With « Valider », the decision goes to the server at once and the match goes on, the card staying
   * until it has; with « Coaching », or at a stop he asked for there, the panel opens on the team as the decision leaves it,
   * and the decision goes with what the panel brings.
   */
  const confirmChoice = (decision: ChoiceCardDecision, then: ChoiceThen): void => {
    if (key === null || choice === null) {
      return;
    }
    const index = choice.options.findIndex(
      (offered) => offered.option === decision.option && (offered.option !== "TAKER" || offered.playerKey === decision.playerKey),
    );
    const input: DecisionInput = { option: decision.option, ...(decision.playerKey === null ? {} : { playerKey: decision.playerKey }) };
    const next: ChoiceThen = then === "coaching" || stopAt === key ? "coaching" : "resume";
    // « Valider », the tutorial's move; « Coaching » decides too, another way.
    closeTutorial("choice", then === "resume" ? "done" : "adapt");
    setChosen({ at: key, decision: input, index, then: next });
    if (next === "coaching") {
      openPanel();
    } else {
      void resumeWith({ decision: input, changes: null, instruction: null });
    }
  };

  // The pause resumed from the panel, with the decision on its card if there is one.
  const resume = (changes: HalfTimeChoiceInput, instruction: Instruction | null): Promise<void> => {
    closeTutorial("half-time", "adapt");
    return resumeWith({ decision: decided?.decision ?? null, changes, instruction });
  };

  // A break resumed from its card or the bar: no change, the assistant's as the match would have been simulated.
  const resumeUnchanged = (): void => {
    void resumeWith({ decision: decided?.decision ?? null, changes: null, instruction: null });
  };

  // The break's card, the tutorial's moves: « Reprendre », or « Coaching » and the panel with its line. The bar's own way
  // on makes the same move another way.
  const resumeFromCard = (): void => {
    closeTutorial("half-time", "done");
    resumeUnchanged();
  };
  const coachingFromCard = (): void => {
    if (tutorialOpen("half-time") && key !== null) {
      setCoachingLineAt(key);
    }
    closeTutorial("half-time", "done");
    openPanel();
  };
  const resumeFromBar = (): void => {
    closeTutorial("half-time", "adapt");
    resumeUnchanged();
  };

  const shown = match.events.filter((event) => event.period !== "SHOOTOUT" && isShown(event));
  // A decision comes with its effect, the minute after its boundary.
  const decisions = match.decisions.filter((decision) => isShown(decisionMoment(decision)));
  // The club's changes of instruction the clock has passed: those of its state while it plays, those kept with the match
  // once over (read again, its state gone). Never one of a segment still to come.
  const changes = instructionChanges(instructions ?? match.instructions).filter(isShown);
  const goals = shown.filter((event) => event.type === "GOAL");
  const homeGoals = countFor(goals, "home");
  const awayGoals = countFor(goals, "away");
  const taken = kicks.slice(0, shownKicks);
  const managedSide = match.home.isManaged ? "home" : "away";
  const panel = team === null ? null : decided !== null && choice !== null ? decidedTeam(team, choice, decided.index) : { team, change: null };
  // The club's instruction at the clock's minute; at a pause, the one the decision on its card gives, as the panel has it.
  // Gone with the final whistle, the result in its place.
  const decidedInstruction = decided === null || choice === null ? null : (choice.options[decided.index]?.instruction ?? null);
  const instruction = over ? null : shownInstruction(instructions, minute, decidedInstruction);

  const stoppedLabel =
    pause?.phase === "HALF_TIME"
      ? t("status.halfTime")
      : pause?.phase === "REGULATION_END"
        ? t("status.regulationEnd")
        : pause !== null
          ? t("status.paused")
          : finished
            ? t("status.finished")
            : t("status.shootout");

  return (
    <div
      data-live-page
      // The national coach's match: its tests tell it from the club's.
      data-national={nations === undefined ? undefined : ""}
      // Under lg, the score reaches the top and the sides of the screen: <main>'s margins are cancelled. The room it keeps at
      // its foot for the navigation, which is gone here, does for the bar of controls.
      className="space-y-5 max-lg:-mx-4 max-lg:-mt-6"
    >
      <h1 className="sr-only" data-testid="live-title">{nations === undefined ? t("title") : tNational("title")}</h1>

      <LiveScoreCard
        caption={caption}
        dashboardHref={dashboardHref}
        exitLabel={nations === undefined ? undefined : tNational("exit")}
        nations={nations}
        match={match}
        homeGoals={homeGoals}
        awayGoals={awayGoals}
        minute={minute}
        progress={(minute / (endMinute > REGULATION_MINUTES ? EXTRA_TIME_END_MINUTE : REGULATION_MINUTES)) * 100}
        status={{
          label: stopped ? stoppedLabel : inExtraTime ? t("extraTimeLive") : t("live"),
          value: stopped ? stoppedLabel : inExtraTime ? t("status.extraTime") : t("live"),
          running: !finished,
        }}
        result={over ? matchResultFor({ ...match, homeGoals, awayGoals }, match.home.isManaged) : null}
        instruction={instruction}
      >
        <LiveControls
          dashboardHref={dashboardHref}
          finished={finished}
          atStop={pause !== null}
          skipTo={skipTarget(pause)}
          coaching={{
            target: coachingTarget(pause),
            asked: stopAt !== null && stopAt === key,
            // At the pause, the step from it is being played: too late to stop there.
            busy: clockDone,
            onToggle: () => {
              closeTutorial("speed", "adapt");
              writeStopRequest(stopKey, stopAt === key ? null : key);
            },
          }}
          speed={speed}
          onSpeedChange={(value) => {
            closeTutorial("speed", "done");
            onSpeedChange(value);
          }}
          onSkip={skip}
          overlaid={cardOpen || breakOpen || panelOpen}
          onOpenPanel={openPanel}
          resume={
            resumeOffered
              ? {
                  label: breakPhase === "REGULATION_END" ? t("break.resume.regulationEnd") : t("break.resume.halfTime"),
                  pending: resumingAt === key,
                  onResume: resumeFromBar,
                }
              : null
          }
          coachingRef={coachingRef}
          resumeRef={resumeRef}
          continueRef={continueRef}
          // The first day's « À demain » followed: its move.
          onContinue={sessionEnd?.tutorial == null ? undefined : () => sendTutorial([{ step: "full-time", event: "done" }])}
        />
      </LiveScoreCard>

      {atStop && choice !== null && (
        <ChoiceCard
          // A card of its own at each choice event.
          key={`${key}:card`}
          event={choice}
          open={cardOpen}
          opponent={managedSide === "home" ? match.away : match.home}
          ownGoals={managedSide === "home" ? homeGoals : awayGoals}
          otherGoals={managedSide === "home" ? awayGoals : homeGoals}
          playerFitness={team?.players.find((candidate) => candidate.id === choice.playerKey)?.fitness ?? null}
          pending={resumingAt === key}
          onConfirm={confirmChoice}
          assistantLine={
            choiceLine ? (
              <TutorialLine
                text={tTutorial("steps.choice")}
                place={place("choice")}
                skip={{ saveId, step: "choice", onSkipped: () => setTutorialSkipped(true) }}
              />
            ) : null
          }
        />
      )}

      {atStop && breakPhase !== null && team !== null && (
        <BreakCard
          // A card of its own at each break.
          key={`${key}:break`}
          phase={breakPhase}
          team={team}
          open={breakOpen}
          onOpenChange={(open) => show(open ? "break" : "none")}
          home={match.home}
          away={match.away}
          homeGoals={homeGoals}
          awayGoals={awayGoals}
          events={shown}
          pending={resumingAt === key}
          onResume={resumeFromCard}
          onCoaching={coachingFromCard}
          returnFocusTo={resumeRef}
          assistantLine={
            breakLine ? (
              <TutorialLine
                text={tTutorial("steps.halfTime", { coaching: t("coaching"), resume: t("break.resume.halfTime") })}
                place={place("half-time")}
                skip={{ saveId, step: "half-time", onSkipped: () => setTutorialSkipped(true) }}
              />
            ) : null
          }
        />
      )}

      {atStop && pause !== null && panel !== null && !cardOpen && (
        <HalfTime
          // A panel of its own at each pause, which opens on demand only.
          key={pauseKey(pause)}
          team={panel.team}
          decided={panel.change}
          open={panelOpen}
          onOpenChange={(open) => (open ? openPanel() : show("none"))}
          returnFocusTo={coachingRef}
          home={match.home}
          away={match.away}
          homeGoals={homeGoals}
          awayGoals={awayGoals}
          onResume={resume}
          // After the break card's « Coaching » of the tutorial's half-time: the assistant's advice already open, or how to make one.
          assistantLine={
            coachingLineAt !== null && coachingLineAt === key
              ? (withAdvice: boolean) => (
                  <TutorialLine
                    text={
                      withAdvice
                        ? tTutorial("steps.halfTimeAdvice", { apply: tHalfTime("compare.apply"), resume: tHalfTime("resume.halfTime") })
                        : tTutorial("steps.halfTimeNoAdvice", { resume: tHalfTime("resume.halfTime") })
                    }
                  />
                )
              : undefined
          }
        />
      )}

      <div className="space-y-5 max-lg:px-4">
        {/* The tutorial's speed, while the clock first runs: under lg above the controls, from lg under the score card. */}
        {speedBubble && (
          <TutorialBubble
            saveId={saveId}
            step="speed"
            text={tTutorial("steps.speed", {
              seconds: REPLAY_SECONDS,
              normal: t("speedFactor", { factor: 1 }),
              fast: t("speedFactor", { factor: 2 }),
              fastest: t("speedFactor", { factor: 4 }),
            })}
            place={place("speed")}
            target='[data-testid="live-speeds"]'
            live
            onClosed={(how) => (how === "skip" ? setTutorialSkipped(true) : closeTutorial("speed", null))}
            className="lg:max-w-2xl"
          />
        )}
        {/* The final whistle: what comes next, and why to come back. */}
        {over && sessionEnd !== null && (
          <SessionEndCard
            saveId={saveId}
            appointment={sessionEnd.appointment}
            word={sessionEnd.word}
            mission={sessionEnd.mission}
            tutorial={sessionEnd.tutorial}
          />
        )}
        {kicks.length > 0 && clockDone && <LiveShootout taken={taken} />}

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-5">
          <LiveFeed
            className="xl:col-span-3"
            shown={shown}
            decisions={decisions}
            changes={changes}
            minute={minute}
            extraTime={extraTime}
            home={match.home}
            away={match.away}
          />
          <div className="space-y-5 xl:col-span-2">
            <LiveStats shown={shown} managedSide={managedSide} />
            {others.length > 0 && (
              <LiveOtherMatches
                match={match}
                over={over}
                scores={others.map((other) => {
                  const otherGoals = other.goals.filter(isShown);
                  return {
                    match: other,
                    home: countFor(otherGoals, "home"),
                    away: countFor(otherGoals, "away"),
                    recent: !finished && otherGoals.some((goal) => minute - clockMinute(goal) < RECENT_GOAL_MINUTES),
                  };
                })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The match live: one replay per match, whose clock and speed go on across its steps. The page's data is the server's
 * first, then each step's: the page is read again only when a step is refused, and once the match is over, when the
 * save's screens change; what it reads then replaces what the steps brought, but for the instructions of the match over,
 * which the server no longer has.
 */
export function LiveMatch({ match, pause, team, instructions, ...props }: LiveMatchProps) {
  const [speed, setSpeed] = useState<Speed>(1);
  const [data, setData] = useState<LiveData>({ match, pause, team, instructions });
  const [read, setRead] = useState(match);
  if (match !== read) {
    setRead(match);
    setData(readAgain(data, { match, pause, team, instructions }));
  }
  const onStep = useCallback((step: LiveStep) => setData((current) => withStep(current, step)), []);
  return <Replay key={match.id} {...props} data={data} onStep={onStep} speed={speed} onSpeedChange={setSpeed} />;
}
