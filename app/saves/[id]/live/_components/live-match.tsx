"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { isNewVersionError } from "@/app/_lib/new-version";
import type { FixtureWithEvents, MatchEventView, ScoreTimeline } from "@/src/db/calendar";
import type { HalfTimeTeam } from "@/src/db/live-match";
import { EXTRA_TIME_END_MINUTE } from "@/src/engine/balance";
import type { LivePause } from "@/src/engine/live";
import { REGULATION_MINUTES, shootoutKicks } from "../../_lib/match-events";
import { matchResultFor } from "../../_lib/stage";
import { continueMatchAction } from "../../actions";
import { endMinute as endMinuteOf, goesToExtraTime, isMatchBreak, pauseKey, skipTarget, stepUntil } from "../_lib/live-pause";
import { countFor } from "../_lib/match-stats";
import { HalfTime } from "./half-time";
import { LiveControls, type Speed } from "./live-controls";
import { LiveFeed } from "./live-feed";
import { LiveOtherMatches } from "./live-other-matches";
import { LiveScoreCard } from "./live-score-card";
import { LiveShootout } from "./live-shootout";
import { LiveStats } from "./live-stats";

/** Real duration of the replay from kick-off to the 90th minute, at normal speed. */
const REPLAY_SECONDS = 45;
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

type LiveMatchProps = {
  saveId: string;
  dashboardHref: string;
  caption: string;
  match: FixtureWithEvents; // its events up to where it is played, never further
  others: ScoreTimeline[];
  pause: LivePause | null; // where the match waits; null once over
  breakTeam: HalfTimeTeam | null; // at a break (half-time, the end of regulation time of a level cup tie): the Coaching panel's
  startMinute: number; // 0 from kick-off; the pause's minute to go on from where the match waits
};

type ReplayProps = LiveMatchProps & {
  speed: Speed;
  onSpeedChange: (speed: Speed) => void;
};

/**
 * The match as the server plays it: a clock runs and the saved events appear as it passes their minute; nothing is
 * drawn here. The server plays one segment of 15 minutes at a time: the clock runs up to the pause the match waits at,
 * holds there while the page asks for the next segment, once per pause, then goes on with what comes back. At a break,
 * the Coaching panel opens, and the clock goes on from the break once it is resumed. « live-skip » takes the clock to the
 * pause and asks for all that comes before the next break, or the end, then on through the pauses on the way. A cup tie
 * that went to extra time runs on to 120' (« Prolongation »), then its shoot-out kick by kick. With reduced motion, the
 * breaks and the end are shown at once.
 */
function Replay({ saveId, dashboardHref, caption, match, others, pause, breakTeam, startMinute, speed, onSpeedChange }: ReplayProps) {
  const t = useTranslations("live");
  const tCommon = useTranslations("common");
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, () => false);
  const router = useRouter();
  const [clock, setClock] = useState(startMinute); // match minutes, fractional
  const [kicksTaken, setKicksTaken] = useState(0);
  const [skipping, setSkipping] = useState(false); // live-skip pressed: to the next break, or the end, at once
  const [closedAt, setClosedAt] = useState<string | null>(null); // the break whose Coaching panel the player closed
  const [failedAt, setFailedAt] = useState<string | null>(null); // the pause whose next step failed: live-skip asks again
  const askedAt = useRef<string | null>(null); // the pause the next step was asked from: once per pause
  const coachingRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLAnchorElement>(null);

  const key = pause === null ? null : pauseKey(pause);
  const atBreak = pause !== null && isMatchBreak(pause.phase);
  const extraTime = goesToExtraTime(pause, match.decidedBy);
  const endMinute = endMinuteOf(pause, match.decidedBy);
  const until = stepUntil(skipping, reducedMotion);
  const kicks = pause === null ? shootoutKicks(match.events) : [];
  const clockDone = reducedMotion || skipping || clock >= endMinute;
  const shownKicks = reducedMotion || skipping ? kicks.length : kicksTaken;
  // What the replay stops at: a break, or the end once the shoot-out is shown. Between two segments, the clock only
  // waits for the next one, the match still live.
  const finished = clockDone && (atBreak || (pause === null && shownKicks >= kicks.length));
  const stopped = clockDone && (atBreak || pause === null);
  const over = finished && pause === null;
  const minute = clockDone ? endMinute : Math.floor(clock);
  const inExtraTime = minute > REGULATION_MINUTES;
  // At the end, every event; before, those whose minute has come (the other matches stop where the clock is too).
  const isShown = (event: { minute: number; period: MatchEventView["period"] }): boolean => over || clockMinute(event) <= minute;

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

  // The clock at the pause: what follows is asked for, once, and read once played. A break needs its team for the panel:
  // without it, the match went on between the page's reads, which are read again.
  useEffect(() => {
    if (pause === null || !clockDone) {
      return;
    }
    const at = pauseKey(pause);
    if (askedAt.current === at || failedAt === at || (atBreak && breakTeam !== null)) {
      return;
    }
    askedAt.current = at;
    if (atBreak) {
      router.refresh();
      return;
    }
    continueMatchAction(saveId, { phase: pause.phase, minute: pause.minute }, null, until).then(
      (result) => {
        // Refused, the match no longer waits there (another tab): the page catches up with it.
        if (!result.ok) {
          toast.error(result.message);
        }
        router.refresh();
      },
      (error: unknown) => {
        askedAt.current = null;
        setFailedAt(at);
        toast.error(isNewVersionError(error) ? tCommon("newVersion") : t("stepFailed"));
      },
    );
  }, [pause, clockDone, atBreak, breakTeam, failedAt, until, saveId, router, t, tCommon]);

  // « live-skip » disappears with the final whistle: keep the keyboard focus on the next step.
  useEffect(() => {
    if (over && skipping) {
      continueRef.current?.focus();
    }
  }, [over, skipping]);

  // To the pause at once, then on to the next break or the end; after a failed step, it is asked for again.
  const skip = () => {
    setSkipping(true);
    setFailedAt(null);
  };

  // The break resumed: the clock goes on from it at its own pace, whatever took it there.
  const resumeFromBreak = () => {
    setSkipping(false);
    setClock(endMinute);
  };

  const shown = match.events.filter((event) => event.period !== "SHOOTOUT" && isShown(event));
  const goals = shown.filter((event) => event.type === "GOAL");
  const homeGoals = countFor(goals, "home");
  const awayGoals = countFor(goals, "away");
  const taken = kicks.slice(0, shownKicks);

  const stoppedLabel =
    pause?.phase === "HALF_TIME"
      ? t("status.halfTime")
      : pause?.phase === "REGULATION_END"
        ? t("status.regulationEnd")
        : finished
          ? t("status.finished")
          : t("status.shootout");

  return (
    <div
      data-live-page
      // Under lg, the score reaches the top and the sides of the screen: <main>'s margins are cancelled. The room it keeps at
      // its foot for the navigation, which is gone here, does for the bar of controls.
      className="space-y-5 max-lg:-mx-4 max-lg:-mt-6"
    >
      <h1 className="sr-only" data-testid="live-title">{t("title")}</h1>

      <LiveScoreCard
        caption={caption}
        dashboardHref={dashboardHref}
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
      >
        <LiveControls
          dashboardHref={dashboardHref}
          finished={finished}
          atBreak={atBreak}
          skipTo={skipTarget(pause)}
          speed={speed}
          onSpeedChange={onSpeedChange}
          onSkip={skip}
          panelOpen={closedAt !== key}
          onOpenPanel={() => setClosedAt(null)}
          coachingRef={coachingRef}
          continueRef={continueRef}
        />
      </LiveScoreCard>

      {finished && pause !== null && breakTeam !== null && (
        <HalfTime
          // A panel of its own at each break, which opens by itself.
          key={pauseKey(pause)}
          saveId={saveId}
          at={pause}
          team={breakTeam}
          open={closedAt !== key}
          onOpenChange={(open) => setClosedAt(open ? null : key)}
          returnFocusTo={coachingRef}
          home={match.home}
          away={match.away}
          homeGoals={homeGoals}
          awayGoals={awayGoals}
          onResume={resumeFromBreak}
        />
      )}

      <div className="space-y-5 max-lg:px-4">
        {kicks.length > 0 && clockDone && <LiveShootout taken={taken} />}

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-5">
          <LiveFeed
            className="xl:col-span-3"
            shown={shown}
            minute={minute}
            extraTime={extraTime}
            home={match.home}
            away={match.away}
          />
          <div className="space-y-5 xl:col-span-2">
            <LiveStats shown={shown} managedSide={match.home.isManaged ? "home" : "away"} />
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
 * The match live: one replay per match, whose clock and speed go on across its steps, the page reading each one the
 * server plays.
 */
export function LiveMatch(props: LiveMatchProps) {
  const [speed, setSpeed] = useState<Speed>(1);
  return <Replay key={props.match.id} {...props} speed={speed} onSpeedChange={setSpeed} />;
}
