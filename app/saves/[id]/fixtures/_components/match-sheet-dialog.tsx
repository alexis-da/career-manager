"use client";

import type { ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import type { FixtureWithEvents, MatchEventView } from "@/src/db/calendar";
import { formatDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { describeEvent, EVENT_LABELS, EVENT_MARKS, formatMinute } from "../../_lib/match-events";
import { RESULT_CLASSES, resultFor } from "../../_lib/results";

function EventColumn({ events, align }: { events: MatchEventView[]; align: "left" | "right" }) {
  if (events.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", align === "right" && "text-right")}>Aucun événement</p>;
  }
  return (
    <ol className="space-y-1">
      {events.map((event) => (
        <li
          key={event.id}
          className={cn(
            "flex items-baseline gap-2 rounded-md px-2 py-1",
            align === "right" && "flex-row-reverse text-right",
            event.type === "GOAL" && "bg-muted",
          )}
        >
          <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{formatMinute(event.minute)}</span>
          <span aria-hidden>{EVENT_MARKS[event.type]}</span>
          <span className="min-w-0">
            <span className="sr-only">{EVENT_LABELS[event.type]} : </span>
            <span className={cn(event.type === "GOAL" && "font-medium")}>{describeEvent(event)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

type MatchSheetDialogProps = {
  fixture: FixtureWithEvents;
  // What opens the sheet, in place of the score button: a calendar cell's match.
  children?: ReactNode;
  triggerClassName?: string;
};

export function MatchSheetDialog({ fixture, children, triggerClassName }: MatchSheetDialogProps) {
  const homeGoals = fixture.homeGoals ?? 0;
  const awayGoals = fixture.awayGoals ?? 0;
  const score = `${homeGoals} – ${awayGoals}`;
  const result = resultFor(homeGoals, awayGoals, fixture.home.isManaged);

  return (
    <Dialog>
      {children === undefined ? (
        <DialogTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className={cn("font-heading text-base font-bold tabular-nums", RESULT_CLASSES[result])}
            />
          }
        >
          {score}
        </DialogTrigger>
      ) : (
        <DialogTrigger className={triggerClassName}>{children}</DialogTrigger>
      )}
      <DialogContent className="gap-5 p-6 sm:max-w-2xl">
        <DialogTitle className="sr-only">
          {fixture.home.name} {score} {fixture.away.name}
        </DialogTitle>
        <DialogDescription className="eyebrow text-center">
          {fixture.competitionName} · Journée {fixture.round} · {formatDate(fixture.scheduledAt)}
        </DialogDescription>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <p className="text-right font-heading text-2xl leading-tight font-bold">{fixture.home.name}</p>
          <p className={cn("rounded-md px-5 py-1 font-heading text-6xl leading-tight font-bold tabular-nums", RESULT_CLASSES[result])}>
            {score}
          </p>
          <p className="font-heading text-2xl leading-tight font-bold">{fixture.away.name}</p>
        </div>

        <div className="grid max-h-[55vh] grid-cols-2 gap-4 overflow-y-auto border-t pt-4 text-sm">
          <EventColumn events={fixture.events.filter((event) => event.side === "home")} align="right" />
          <EventColumn events={fixture.events.filter((event) => event.side === "away")} align="left" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
