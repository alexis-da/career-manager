"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FixtureWithEvents, MatchEventView, ScoreTimeline } from "@/src/db/calendar";
import type { HalfTimeTeam } from "@/src/db/live-match";
import { EXTRA_TIME_END_MINUTE, HALF_TIME_MINUTE } from "@/src/engine/balance";
import { REGULATION_MINUTES, shootoutKicks } from "../../_lib/match-events";
import { matchResultFor } from "../../_lib/stage";
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
  match: FixtureWithEvents;
  others: ScoreTimeline[];
  // The break the match waits at: the replay stops there (45', or 90' for a level cup tie), on the Coaching panel.
  pause: HalfTimeTeam | null;
  startMinute: number; // 0 from kick-off; HALF_TIME_MINUTE or REGULATION_MINUTES to land on a break or replay what follows
};

/**
 * Replays an already simulated match: a clock runs and the saved events appear as it passes their minute. Nothing is
 * drawn here. A match paused at a break stops there, the Coaching panel open; once the rest is played, its replay starts
 * again from the break, the other matches' scores going on. A cup tie that went to extra time runs on to 120'
 * (« Prolongation »), then its shoot-out kick by kick. With reduced motion, the break or the end is shown at once.
 */
export function LiveMatch({ saveId, dashboardHref, caption, match, others, pause, startMinute }: LiveMatchProps) {
  const t = useTranslations("live");
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, () => false);
  const router = useRouter();
  const [clock, setClock] = useState(startMinute); // match minutes, fractional
  const [kicksTaken, setKicksTaken] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [panelOpen, setPanelOpen] = useState(true); // the Coaching panel opens by itself on reaching a break
  const skipped = useRef(false);
  const coachingRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLAnchorElement>(null);

  const playedExtraTime = match.decidedBy === "EXTRA_TIME" || match.decidedBy === "PENALTIES";
  const endMinute =
    pause?.phase === "HALF_TIME"
      ? HALF_TIME_MINUTE
      : pause?.phase === "REGULATION_END" || !playedExtraTime
        ? REGULATION_MINUTES
        : EXTRA_TIME_END_MINUTE;
  const kicks = pause === null ? shootoutKicks(match.events) : [];
  const clockDone = reducedMotion || clock >= endMinute;
  const shownKicks = reducedMotion ? kicks.length : kicksTaken;
  const finished = clockDone && shownKicks >= kicks.length;
  const minute = clockDone ? endMinute : Math.floor(clock);
  const inExtraTime = minute > REGULATION_MINUTES;
  // At the end, every event; before, those whose minute has come (the other matches stop at the break too).
  const isShown = (event: { minute: number; period: MatchEventView["period"] }): boolean =>
    (finished && pause === null) || clockMinute(event) <= minute;

  useEffect(() => {
    if (finished) {
      return;
    }
    const timer = clockDone
      ? window.setInterval(() => setKicksTaken((taken) => Math.min(kicks.length, taken + 1)), KICK_MS / speed)
      : window.setInterval(() => setClock((current) => Math.min(endMinute, current + MINUTES_PER_TICK * speed)), TICK_MS);
    return () => window.clearInterval(timer);
  }, [finished, clockDone, speed, endMinute, kicks.length]);

  // « Aller au résultat » disappears with the final whistle: keep the keyboard focus on the next step.
  useEffect(() => {
    if (finished && skipped.current) {
      continueRef.current?.focus();
    }
  }, [finished]);

  const skip = () => {
    skipped.current = true;
    setClock(endMinute);
    setKicksTaken(kicks.length);
  };

  const shown = match.events.filter((event) => event.period !== "SHOOTOUT" && isShown(event));
  const goals = shown.filter((event) => event.type === "GOAL");
  const homeGoals = countFor(goals, "home");
  const awayGoals = countFor(goals, "away");
  const over = finished && pause === null;
  const taken = kicks.slice(0, shownKicks);

  const stoppedLabel = finished
    ? pause?.phase === "HALF_TIME"
      ? t("status.halfTime")
      : pause?.phase === "REGULATION_END"
        ? t("status.regulationEnd")
        : t("status.finished")
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
          label: clockDone ? stoppedLabel : inExtraTime ? t("extraTimeLive") : t("live"),
          value: clockDone ? stoppedLabel : inExtraTime ? t("status.extraTime") : t("live"),
          running: !finished,
        }}
        result={over ? matchResultFor({ ...match, homeGoals, awayGoals }, match.home.isManaged) : null}
      >
        <LiveControls
          dashboardHref={dashboardHref}
          finished={finished}
          pausePhase={pause?.phase ?? null}
          speed={speed}
          onSpeedChange={setSpeed}
          onSkip={skip}
          panelOpen={panelOpen}
          onOpenPanel={() => setPanelOpen(true)}
          coachingRef={coachingRef}
          continueRef={continueRef}
        />
      </LiveScoreCard>

      {finished && pause !== null && (
        <HalfTime
          saveId={saveId}
          team={pause}
          open={panelOpen}
          onOpenChange={setPanelOpen}
          returnFocusTo={coachingRef}
          home={match.home}
          away={match.away}
          homeGoals={homeGoals}
          awayGoals={awayGoals}
          onResumed={() => router.replace(`/saves/${saveId}/live?reprise=${pause.phase === "HALF_TIME" ? 1 : 2}`)}
        />
      )}

      <div className="space-y-5 max-lg:px-4">
        {kicks.length > 0 && clockDone && <LiveShootout taken={taken} />}

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-5">
          <LiveFeed
            className="xl:col-span-3"
            shown={shown}
            minute={minute}
            extraTime={playedExtraTime || pause?.phase === "REGULATION_END"}
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
