"use client";

import { competitionName } from "@/src/i18n/countries";
import { useLocale, useTranslations } from "next-intl";
import { SplitIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import type { DecisionView, FixtureWithEvents, MatchEventView } from "@/src/db/calendar";
import type { Side } from "@/src/engine/match";
import { formatDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { EventIcon, IconChip } from "../../_components/event-icon";
import { ScoreNotes } from "../../_components/score-notes";
import { decisionMoment, describeDecision, withDecisions, type MatchLine } from "../../_lib/decisions";
import { describeEvent, formatMinute, shootoutKicks } from "../../_lib/match-events";
import { RESULT_CLASSES } from "../../_lib/results";
import { matchResultFor, stageLabel } from "../../_lib/stage";

type Align = "left" | "right";

function EventItem({ event, align, managed }: { event: MatchEventView; align: Align; managed: boolean }) {
  const t = useTranslations("matchSheet");
  const tEvents = useTranslations("events");
  return (
    <li
      // The players by their keys: two players of a match may share a name.
      data-player-key={event.playerKey ?? undefined}
      data-related-player-key={event.relatedPlayerKey ?? undefined}
      className={cn(
        "flex items-baseline gap-2 rounded-md px-2 py-1",
        align === "right" && "flex-row-reverse text-right",
        event.type === "GOAL" && "bg-muted",
      )}
    >
      <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{formatMinute(event.minute, event.period)}</span>
      <EventIcon type={event.type} managed={managed} className="size-5 self-start" />
      <span className="min-w-0 wrap-break-word">
        <span className="sr-only">{t("eventLabel", { type: tEvents(`type.${event.type}`) })}</span>
        <span className={cn(event.type === "GOAL" && "font-medium")}>{describeEvent(event, tEvents)}</span>
      </span>
    </li>
  );
}

/**
 * A decision of the managed club among its events, at the minute after its boundary: what was decided and what came of
 * it, read in the match's events, then the event's name. Framed on the blue, with the fork of the live feed: a choice,
 * never an event.
 */
function DecisionItem({ decision, align, matchEvents }: { decision: DecisionView; align: Align; matchEvents: readonly MatchEventView[] }) {
  const t = useTranslations("decisions");
  const moment = decisionMoment(decision);
  return (
    <li
      data-testid="match-sheet-decision"
      data-decision-kind={decision.kind}
      data-decision-option={decision.option}
      className={cn(
        "flex items-baseline gap-2 rounded-md border border-primary/60 bg-primary/15 px-2 py-1",
        align === "right" && "flex-row-reverse text-right",
      )}
    >
      <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{formatMinute(moment.minute, moment.period)}</span>
      <IconChip className="size-5 self-start bg-primary text-primary-foreground">
        <SplitIcon strokeWidth={2.5} />
      </IconChip>
      <span className="min-w-0 wrap-break-word">
        <span className="block">{describeDecision(decision, matchEvents, t)}</span>
        <span className="block text-xs text-muted-foreground">{t(`kind.${decision.kind}`)}</span>
      </span>
    </li>
  );
}

type EventColumnProps = {
  lines: MatchLine[]; // a side's events of a period, with the managed club's decisions among its own
  align: Align;
  managed: boolean;
  matchEvents: readonly MatchEventView[]; // all of the match's, where its decisions' effects are read
};

function EventColumn({ lines, align, managed, matchEvents }: EventColumnProps) {
  const t = useTranslations("matchSheet");
  if (lines.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", align === "right" && "text-right")}>{t("noEvents")}</p>;
  }
  return (
    <ol className="space-y-1">
      {lines.map((line) =>
        line.kind === "decision" ? (
          <DecisionItem key={`decision-${line.decision.sequence}`} decision={line.decision} align={align} matchEvents={matchEvents} />
        ) : (
          <EventItem key={line.event.id} event={line.event} align={align} managed={managed} />
        ),
      )}
    </ol>
  );
}

/** The two sides' events of a period, face to face, the managed club's decisions of the period among its own. */
function EventColumns({ fixture, events, decisions }: { fixture: FixtureWithEvents; events: MatchEventView[]; decisions: DecisionView[] }) {
  const linesOf = (side: Side): MatchLine[] =>
    withDecisions(
      events.filter((event) => event.side === side),
      fixture[side].isManaged ? decisions : [],
    );
  return (
    <div className="grid grid-cols-2 gap-4">
      <EventColumn lines={linesOf("home")} align="right" managed={fixture.home.isManaged} matchEvents={fixture.events} />
      <EventColumn lines={linesOf("away")} align="left" managed={fixture.away.isManaged} matchEvents={fixture.events} />
    </div>
  );
}

/** The shoot-out kick by kick: who took it, scored or missed, and the shoot-out's score after it. */
function ShootoutList({ fixture }: { fixture: FixtureWithEvents }) {
  const t = useTranslations("matchSheet");
  const kicks = shootoutKicks(fixture.events);
  return (
    <ol className="space-y-1" data-match-sheet="shootout">
      {kicks.map(({ event, scored, home, away }) => (
        <li
          key={event.id}
          data-kick={scored ? "scored" : "missed"}
          className="grid grid-cols-[2rem_1fr_auto_3rem] items-baseline gap-3 rounded-md px-2 py-1 odd:bg-muted/50"
        >
          <span className="text-muted-foreground tabular-nums">{event.minute}</span>
          <span className="min-w-0 truncate max-sm:whitespace-normal">
            {event.playerName} <span className="text-muted-foreground">· {(event.side === "home" ? fixture.home : fixture.away).name}</span>
          </span>
          <span className={cn("text-xs font-semibold", scored ? "text-win" : "text-loss")}>
            <EventIcon
              type={event.type}
              managed={(event.side === "home" ? fixture.home : fixture.away).isManaged}
              className="mr-1 inline-flex size-4 align-text-bottom"
            />
            {scored ? t("kick.scored") : t("kick.missed")}
          </span>
          <span className="text-right font-heading font-bold tabular-nums">
            {home}-{away}
          </span>
        </li>
      ))}
    </ol>
  );
}

type MatchSheetDialogProps = {
  fixture: FixtureWithEvents;
  children: ReactNode; // what opens the sheet: a calendar row, or the match in a day of the grid
  triggerClassName: string;
};

export function MatchSheetDialog({ fixture, children, triggerClassName }: MatchSheetDialogProps) {
  const t = useTranslations("matchSheet");
  const tWorld = useTranslations("world");
  const tStage = useTranslations("stage");
  const locale = useLocale();
  const homeGoals = fixture.homeGoals ?? 0;
  const awayGoals = fixture.awayGoals ?? 0;
  const score = `${homeGoals} – ${awayGoals}`;
  const result = matchResultFor({ ...fixture, homeGoals, awayGoals }, fixture.home.isManaged);
  const regular = fixture.events.filter((event) => event.period === "REGULAR");
  const extraTime = fixture.events.filter((event) => event.period === "EXTRA_TIME");
  // A decision past the 90th is one of extra time's.
  const decisionsOf = (period: MatchEventView["period"]): DecisionView[] =>
    fixture.decisions.filter((decision) => decisionMoment(decision).period === period);
  const playedExtraTime = fixture.decidedBy === "EXTRA_TIME" || fixture.decidedBy === "PENALTIES";
  const hasShootout = fixture.events.some((event) => event.period === "SHOOTOUT");

  return (
    <Dialog>
      <DialogTrigger className={triggerClassName} data-testid="match-sheet-trigger">{children}</DialogTrigger>
      <DialogContent className="gap-5 p-6 sm:max-w-2xl max-sm:p-4" data-testid="match-sheet">
        <DialogTitle className="sr-only">
          {fixture.home.name} {score} {fixture.away.name}
        </DialogTitle>
        <DialogDescription className="eyebrow text-center">
          {fixture.cup ? "" : `${competitionName(fixture.competitionCode, tWorld)} · `}
          {stageLabel(fixture, tStage)} · {formatDate(fixture.scheduledAt, locale)}
        </DialogDescription>

        {/* On a phone, home, score and away one above the other: side by side, they were wider than the screen. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 max-sm:grid-cols-1 max-sm:justify-items-center max-sm:gap-1 max-sm:text-center">
          <p className="text-right font-heading text-2xl leading-tight font-bold max-sm:text-center max-sm:text-xl">{fixture.home.name}</p>
          <p
            className={cn(
              "rounded-md px-5 py-1 font-heading text-6xl leading-tight font-bold tabular-nums max-sm:text-5xl",
              RESULT_CLASSES[result],
            )}
          >
            {score}
          </p>
          <p className="font-heading text-2xl leading-tight font-bold max-sm:text-xl">{fixture.away.name}</p>
        </div>
        <ScoreNotes match={fixture} className="-mt-3 block text-center text-sm" />
        {fixture.homeHalfTimeGoals !== null && fixture.awayHalfTimeGoals !== null && (
          <p className="-mt-3 text-center text-sm text-muted-foreground tabular-nums" data-match-sheet="half-time">
            {t("halfTime", { home: fixture.homeHalfTimeGoals, away: fixture.awayHalfTimeGoals })}
          </p>
        )}

        <div className="max-h-[55vh] space-y-4 overflow-y-auto border-t pt-4 text-sm">
          <EventColumns fixture={fixture} events={regular} decisions={decisionsOf("REGULAR")} />
          {playedExtraTime && (
            <section className="space-y-2 border-t pt-3" data-match-sheet="extra-time">
              <h3 className="eyebrow text-center">{t("extraTime")}</h3>
              <EventColumns fixture={fixture} events={extraTime} decisions={decisionsOf("EXTRA_TIME")} />
            </section>
          )}
          {hasShootout && (
            <section className="space-y-2 border-t pt-3">
              <h3 className="eyebrow text-center">{t("shootout")}</h3>
              <ShootoutList fixture={fixture} />
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
