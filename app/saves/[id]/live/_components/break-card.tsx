"use client";

import { useTranslations } from "next-intl";
import { PlayIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/src/components/ui/sheet";
import type { MatchEventView, TeamView } from "@/src/db/calendar";
import type { HalfTimeTeam, MatchBreak } from "@/src/db/live-match";
import { cn } from "@/src/lib/utils";
import { EventIcon } from "../../_components/event-icon";
import { breakMarks, type BreakMark } from "../_lib/break-summary";
import { coachAdvice, type AdviceLine } from "../_lib/coach-advice";
import { pauseRules, pauseState, suggestChange } from "../_lib/half-time-moves";
import { RESUME_GUARD_MS } from "../_lib/live-pause";
import { PauseScore } from "./pause-score";

/** Side margins of the card, its content and its foot alike: the Coaching panel's. */
const PANEL_GUTTER = "px-4 sm:px-6 lg:px-7";

/**
 * What the assistant says on a break's card, of all he says in the panel: the injured or a side short of players, then the
 * change he would make or why none; before extra time, what follows.
 */
const CARD_TOPICS: ReadonlySet<AdviceLine["topic"]> = new Set(["injured", "sentOff", "change"]);

type BreakCardProps = {
  phase: MatchBreak;
  team: HalfTimeTeam; // the managed club at the break, as the panel has it
  open: boolean;
  onOpenChange: (open: boolean) => void; // Escape or its cross close it: the bar keeps both ways on
  home: TeamView;
  away: TeamView;
  homeGoals: number; // at the break
  awayGoals: number;
  events: readonly MatchEventView[]; // the match's, up to the break
  pending: boolean; // the match is going on: nothing left to press
  onResume: () => void; // without a change, the assistant's as the match would have been simulated
  onCoaching: () => void;
  returnFocusTo: RefObject<HTMLElement | null>; // the bar's way on, once it closes
  assistantLine?: ReactNode; // the tutorial's line (its first break), above the ways on
};

/**
 * The card of a break, where the match stops by itself: half-time, and the end of regulation time of a level cup tie. A
 * compact card from the foot of the screen under lg, at the foot of the panel's column from there: the score, its scorers
 * and players sent off, a word of the assistant's, then the way on, the screen's one orange action, and « Coaching »,
 * which opens the panel. Both stay out of reach RESUME_GUARD_MS as it opens: it comes under the thumb that pressed the
 * bar's. Modal, as the panel: Escape and its cross close it, a press outside does not.
 */
export function BreakCard({
  phase,
  team,
  open,
  onOpenChange,
  home,
  away,
  homeGoals,
  awayGoals,
  events,
  pending,
  onResume,
  onCoaching,
  returnFocusTo,
  assistantLine = null,
}: BreakCardProps) {
  const t = useTranslations("live");
  const tHalfTime = useTranslations("halfTime");
  const [settled, setSettled] = useState(false); // the card has been open for RESUME_GUARD_MS
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), RESUME_GUARD_MS);
    return () => {
      window.clearTimeout(timer);
      setSettled(false);
    };
  }, [open]);

  const regulationEnd = phase === "REGULATION_END";
  const rules = pauseRules(team);
  const state = pauseState(team);
  const advice = coachAdvice(
    {
      phase,
      goalDifference: home.isManaged ? homeGoals - awayGoals : awayGoals - homeGoals,
      state,
      rules,
      suggestion: suggestChange(state, rules, team.players),
      booked: team.booked,
      hurt: team.hurt,
      players: new Map(team.players.map((player) => [player.id, player])),
    },
    tHalfTime,
  ).filter((line) => CARD_TOPICS.has(line.topic) || (regulationEnd && line.topic === "score"));
  const marks = { home: breakMarks(events, "home"), away: breakMarks(events, "away") };
  const resumeLabel = pending
    ? tHalfTime(regulationEnd ? "resuming.regulationEnd" : "resuming.halfTime")
    : t(regulationEnd ? "break.resume.regulationEnd" : "break.resume.halfTime");

  return (
    <Sheet modal disablePointerDismissal open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // The card's start rather than its first button: a stray Enter at the whistle would resume the match.
        initialFocus={body}
        finalFocus={returnFocusTo}
        data-break={phase}
        data-testid="break-card"
        className="max-h-[calc(100dvh-2.5rem)] gap-0 overflow-hidden rounded-t-card border-secondary bg-card lg:w-110 lg:rounded-card lg:border lg:data-[side=bottom]:inset-x-auto lg:data-[side=bottom]:right-6 lg:data-[side=bottom]:bottom-6"
      >
        <div ref={body} tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain outline-none">
          <div className={cn("mx-auto w-full max-w-lg grow space-y-4 pt-5 pb-4", PANEL_GUTTER)}>
            {/* The cross is in the corner of the card. */}
            <div className="pr-10">
              <SheetTitle data-testid="break-title" className="text-4xl leading-none font-bold">
                {regulationEnd ? t("status.regulationEnd") : t("status.halfTime")}
              </SheetTitle>
              <SheetDescription className="mt-1 font-bold text-(--club)">{tHalfTime("paused")}</SheetDescription>
            </div>

            <PauseScore home={home} away={away} homeGoals={homeGoals} awayGoals={awayGoals} scoreTestId="break-score" />

            {marks.home.length + marks.away.length === 0 ? (
              <p data-testid="break-marks" className="text-center text-sm text-muted-foreground">
                {t("break.noGoal")}
              </p>
            ) : (
              <div data-testid="break-marks" className="grid grid-cols-2 gap-x-4 text-sm">
                <MarkList marks={marks.home} managed={home.isManaged} align="end" />
                <MarkList marks={marks.away} managed={away.isManaged} align="start" />
              </div>
            )}

            <p data-testid="break-advice" className="text-[0.9375rem] leading-[1.45] text-muted-foreground">
              {tHalfTime("advice.intro")} {tHalfTime("advice.open")}
              {advice.map((line) => line.text).join(" ")}
              {tHalfTime("advice.close")}
            </p>

            {assistantLine}
          </div>

          {/* Stuck to the foot of the card, which can be taller than a short screen: the ways on. */}
          <div className="sticky bottom-0 z-20 border-t bg-card">
            <div className={cn("mx-auto flex w-full max-w-lg flex-col gap-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-5", PANEL_GUTTER)}>
              <Button variant="outline" className="h-11 w-full" disabled={pending || !settled} onClick={onCoaching} data-testid="break-coaching">
                {t("coaching")}
              </Button>
              <Button
                variant="club"
                className="h-14 w-full font-heading text-2xl font-semibold"
                disabled={pending || !settled}
                onClick={onResume}
                data-testid="break-resume"
              >
                <PlayIcon data-icon="inline-start" className="fill-current" />
                {resumeLabel}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** One side's marks, under its name: the scorers, then the players sent off, each drawn as the feed draws them. */
function MarkList({ marks, managed, align }: { marks: BreakMark[]; managed: boolean; align: "start" | "end" }) {
  const t = useTranslations("live");
  return (
    <ul className={cn("min-w-0 space-y-1", align === "end" ? "text-right" : "text-left")}>
      {marks.map((mark) => (
        <li
          key={`${mark.type}:${mark.key}`}
          data-break-mark={mark.type}
          className={cn("flex items-start gap-1.5", align === "end" && "flex-row-reverse")}
        >
          <EventIcon type={mark.type} managed={managed} className="mt-px size-5" />
          <span className="min-w-0 wrap-break-word">
            <span className="sr-only">{t(mark.type === "GOAL" ? "break.goal" : "break.redCard")} </span>
            <span className="font-semibold">{mark.name}</span> <span className="text-muted-foreground tabular-nums">{mark.minutes.join(", ")}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
