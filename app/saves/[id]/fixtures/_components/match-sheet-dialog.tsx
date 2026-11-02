"use client";

import { competitionName } from "@/src/i18n/countries";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import type { FixtureWithEvents, MatchEventView } from "@/src/db/calendar";
import { formatDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { EventIcon } from "../../_components/event-icon";
import { ScoreNotes } from "../../_components/score-notes";
import { describeEvent, formatMinute, shootoutKicks } from "../../_lib/match-events";
import { RESULT_CLASSES } from "../../_lib/results";
import { matchResultFor, stageLabel } from "../../_lib/stage";

function EventColumn({ events, align, managed }: { events: MatchEventView[]; align: "left" | "right"; managed: boolean }) {
  const t = useTranslations("matchSheet");
  const tEvents = useTranslations("events");
  if (events.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", align === "right" && "text-right")}>{t("noEvents")}</p>;
  }
  return (
    <ol className="space-y-1">
      {events.map((event) => (
        <li
          key={event.id}
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
      ))}
    </ol>
  );
}

/** The two sides' events of a period, face to face. */
function EventColumns({ fixture, events }: { fixture: FixtureWithEvents; events: MatchEventView[] }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <EventColumn events={events.filter((event) => event.side === "home")} align="right" managed={fixture.home.isManaged} />
      <EventColumn events={events.filter((event) => event.side === "away")} align="left" managed={fixture.away.isManaged} />
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
          <EventColumns fixture={fixture} events={regular} />
          {playedExtraTime && (
            <section className="space-y-2 border-t pt-3" data-match-sheet="extra-time">
              <h3 className="eyebrow text-center">{t("extraTime")}</h3>
              <EventColumns fixture={fixture} events={extraTime} />
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
