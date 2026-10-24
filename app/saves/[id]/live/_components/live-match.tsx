"use client";

import { FastForwardIcon, SkipForwardIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PlayerFace } from "@/src/components/player-face";
import { Button, buttonVariants } from "@/src/components/ui/button";
import type { FixtureWithEvents, MatchEventView, ScoreTimeline, TeamView } from "@/src/db/calendar";
import type { HalfTimeTeam } from "@/src/db/live-match";
import { HALF_TIME_MINUTE } from "@/src/engine/balance";
import type { Side } from "@/src/engine/match";
import { cn } from "@/src/lib/utils";
import { Panel, PanelTitle } from "../../_components/panel";
import { ScoreNotes } from "../../_components/score-notes";
import { describeEvent, EVENT_LABELS, EVENT_MARKS, formatMinute, REGULATION_MINUTES } from "../../_lib/match-events";
import { RESULT_CLASSES, resultFor } from "../../_lib/results";
import { stageLabel } from "../../_lib/stage";
import { HalfTime } from "./half-time";

/** Real duration of the replay from kick-off to the 90th minute, at normal speed. */
const REPLAY_SECONDS = 45;
const FAST_FORWARD_FACTOR = 4;
const TICK_MS = 100;
const MINUTES_PER_TICK = (REGULATION_MINUTES * TICK_MS) / (REPLAY_SECONDS * 1000);
/** A score of the other matches stays highlighted this many match minutes after a goal. */
const RECENT_GOAL_MINUTES = 3;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const prefersReducedMotion = (): boolean => window.matchMedia(REDUCED_MOTION_QUERY).matches;

const goalsOf = (goals: { minute: number; side: Side }[], side: Side): number =>
  goals.filter((goal) => goal.side === side).length;

type LiveMatchProps = {
  saveId: string;
  dashboardHref: string;
  caption: string;
  match: FixtureWithEvents;
  others: ScoreTimeline[];
  // The match waits at half-time: the replay stops at 45' on the half-time screen.
  halfTime: HalfTimeTeam | null;
  startMinute: number; // 0 from kick-off; HALF_TIME_MINUTE to land on the break, or to replay the second half only
};

/**
 * Replays an already simulated match: a clock runs to 90' and the saved events appear as it passes their minute.
 * Nothing is drawn here. A match paused at half-time stops at 45' on the half-time screen; once the second half is
 * played, its replay starts again from 45', the other matches' scores going on. With reduced motion, the break or
 * the final whistle is shown at once.
 */
export function LiveMatch({ saveId, dashboardHref, caption, match, others, halfTime, startMinute }: LiveMatchProps) {
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, () => false);
  const router = useRouter();
  const [clock, setClock] = useState(startMinute); // match minutes, fractional
  const [fast, setFast] = useState(false);
  const skipped = useRef(false);
  const continueRef = useRef<HTMLAnchorElement>(null);

  const endMinute = halfTime === null ? REGULATION_MINUTES : HALF_TIME_MINUTE;
  const finished = reducedMotion || clock >= endMinute;
  const minute = finished ? endMinute : Math.floor(clock);
  // Stoppage-time events come with the final whistle; at the break, the other matches stop at 45' too.
  const isShown = (event: { minute: number }): boolean => (finished && halfTime === null) || event.minute <= minute;

  useEffect(() => {
    if (finished) {
      return;
    }
    const speed = fast ? FAST_FORWARD_FACTOR : 1;
    const timer = window.setInterval(
      () => setClock((current) => Math.min(endMinute, current + MINUTES_PER_TICK * speed)),
      TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [finished, fast, endMinute]);

  // « Passer » disappears with the final whistle: keep the keyboard focus on the next step.
  useEffect(() => {
    if (finished && skipped.current) {
      continueRef.current?.focus();
    }
  }, [finished]);

  const skip = () => {
    skipped.current = true;
    setClock(endMinute);
  };

  const events = match.events.filter(isShown);
  const goals = events.filter((event) => event.type === "GOAL");
  const homeGoals = goalsOf(goals, "home");
  const awayGoals = goalsOf(goals, "away");
  const result = resultFor(homeGoals, awayGoals, match.home.isManaged);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="sr-only">Match en direct</h1>

      <Panel className="space-y-5 p-6">
        <p className="eyebrow text-center">{caption}</p>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-6">
          <TeamName team={match.home} align="right" />
          <p
            className={cn(
              "rounded-md px-5 py-1 font-heading text-5xl leading-tight font-bold tabular-nums sm:text-6xl",
              finished && halfTime === null && RESULT_CLASSES[result],
            )}
          >
            <Goals value={homeGoals} /> – <Goals value={awayGoals} />
          </p>
          <TeamName team={match.away} align="left" />
        </div>

        <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
          <div className="flex items-center gap-3">
            <span className="font-heading text-3xl font-bold tabular-nums">{minute}&apos;</span>
            {finished ? (
              <span className="eyebrow">{halfTime === null ? "Terminé" : "Mi-temps"}</span>
            ) : (
              <span className="eyebrow flex items-center gap-1.5 text-loss">
                <span aria-hidden className="size-2 rounded-full bg-loss motion-safe:animate-pulse" />
                En direct
              </span>
            )}
          </div>
          <div aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-(--club)" style={{ width: `${(minute / REGULATION_MINUTES) * 100}%` }} />
          </div>
        </div>

        <div className="flex justify-center gap-2">
          {finished && halfTime !== null ? null : finished ? (
            <Link
              ref={continueRef}
              href={dashboardHref}
              className={buttonVariants({ variant: "club", className: "h-9 px-4 font-heading text-base font-semibold" })}
            >
              Continuer
            </Link>
          ) : (
            <>
              <Button variant={fast ? "secondary" : "outline"} className="h-9 px-3" aria-pressed={fast} onClick={() => setFast(!fast)}>
                <FastForwardIcon data-icon="inline-start" />
                Accélérer ×{FAST_FORWARD_FACTOR}
              </Button>
              <Button variant="outline" className="h-9 px-3" onClick={skip}>
                <SkipForwardIcon data-icon="inline-start" />
                Passer
              </Button>
            </>
          )}
        </div>
      </Panel>

      {finished && halfTime !== null && (
        <HalfTime saveId={saveId} team={halfTime} onResumed={() => router.replace(`/saves/${saveId}/live?reprise=1`)} />
      )}

      <Panel>
        <PanelTitle>Fil du match</PanelTitle>
        {events.length === 0 ? (
          <p className="mt-3 text-center text-sm text-muted-foreground">Coup d&apos;envoi…</p>
        ) : (
          // Newest first: the latest event is always in view.
          <ol role="log" aria-label="Événements du match" className="mt-3 space-y-1 text-sm">
            {events.toReversed().map((event) => (
              <li
                key={event.id}
                className={cn(
                  "grid grid-cols-[1fr_3.5rem_1fr] items-baseline gap-3 rounded-md px-2 py-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1",
                  event.type === "GOAL" && "bg-muted",
                )}
              >
                <span className="text-right">{event.side === "home" && <EventText event={event} team={match.home} align="right" />}</span>
                <span className="text-center text-muted-foreground tabular-nums">{formatMinute(event.minute)}</span>
                <span>{event.side === "away" && <EventText event={event} team={match.away} align="left" />}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {others.length > 0 && (
        <Panel>
          <PanelTitle>
            Autres matchs · {match.competitionName}
            {match.cup && ` · ${stageLabel(match)}`}
          </PanelTitle>
          <ul className="mt-3 divide-y text-sm">
            {others.map((other) => {
              const otherGoals = other.goals.filter(isShown);
              const recent = !finished && otherGoals.some((goal) => minute - goal.minute < RECENT_GOAL_MINUTES);
              return (
                <li key={other.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2">
                  <span className="truncate text-right">{other.home.name}</span>
                  <span
                    className={cn(
                      "rounded-md px-3 py-0.5 font-heading text-lg font-bold tabular-nums transition-colors",
                      recent && "bg-(--club)/18",
                    )}
                  >
                    {goalsOf(otherGoals, "home")} – {goalsOf(otherGoals, "away")}
                  </span>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate">{other.away.name}</span>
                    {finished && halfTime === null && <ScoreNotes match={other} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function TeamName({ team, align }: { team: TeamView; align: "left" | "right" }) {
  return (
    <p
      className={cn(
        "flex min-w-0 items-center gap-2 font-heading text-xl leading-tight font-bold sm:text-2xl",
        align === "right" && "flex-row-reverse text-right",
      )}
    >
      {team.isManaged && <span aria-hidden className="h-7 w-1 shrink-0 rounded-full bg-(--club)" />}
      <span className="min-w-0">{team.name}</span>
    </p>
  );
}

/** A side's goals; a new key at each goal replays the entrance. */
function Goals({ value }: { value: number }) {
  return (
    <span key={value} className="inline-block motion-safe:animate-in motion-safe:zoom-in-150 motion-safe:duration-500">
      {value}
    </span>
  );
}

/** An event of one side; a goal shows the scorer's face, in his club's colors. */
function EventText({ event, team, align }: { event: MatchEventView; team: TeamView; align: "left" | "right" }) {
  return (
    <span className={cn("inline-flex items-center gap-2", align === "right" && "flex-row-reverse")}>
      <span aria-hidden>{EVENT_MARKS[event.type]}</span>
      {event.type === "GOAL" && event.playerKey !== null && event.playerAge !== null && (
        <PlayerFace playerKey={event.playerKey} age={event.playerAge} clubColors={team.colors} size={20} className="shrink-0" />
      )}
      <span>
        <span className="sr-only">
          {EVENT_LABELS[event.type]}, {team.name} :{" "}
        </span>
        <span className={cn(event.type === "GOAL" && "font-medium")}>{describeEvent(event)}</span>
      </span>
    </span>
  );
}
