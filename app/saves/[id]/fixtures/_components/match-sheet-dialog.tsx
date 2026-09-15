"use client";

import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import type { FixtureWithEvents, MatchEventView } from "@/src/db/calendar";
import type { MatchEventType } from "@/src/engine/match";
import { formatDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { RESULT_CLASSES, resultFor } from "../../_lib/results";

const REGULATION_MINUTES = 90;

const EVENT_LABELS: Record<MatchEventType, string> = {
  GOAL: "But",
  YELLOW_CARD: "Carton jaune",
  RED_CARD: "Carton rouge",
  INJURY: "Blessure",
  SUBSTITUTION: "Remplacement",
};

const EVENT_MARKS: Record<MatchEventType, string> = {
  GOAL: "⚽",
  YELLOW_CARD: "🟨",
  RED_CARD: "🟥",
  INJURY: "✚",
  SUBSTITUTION: "⇄",
};

/** « 37' », or « 90+3' » in stoppage time. */
const formatMinute = (minute: number): string =>
  minute > REGULATION_MINUTES ? `${REGULATION_MINUTES}+${minute - REGULATION_MINUTES}'` : `${minute}'`;

function describe(event: MatchEventView): string {
  if (event.type === "GOAL") {
    return event.relatedPlayerName === null ? event.playerName : `${event.playerName} (passe de ${event.relatedPlayerName})`;
  }
  if (event.type === "SUBSTITUTION") {
    return event.relatedPlayerName === null
      ? `Entrée de ${event.playerName}`
      : `${event.playerName} remplace ${event.relatedPlayerName}`;
  }
  return event.playerName;
}

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
            <span className={cn(event.type === "GOAL" && "font-medium")}>{describe(event)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function MatchSheetDialog({ fixture }: { fixture: FixtureWithEvents }) {
  const homeGoals = fixture.homeGoals ?? 0;
  const awayGoals = fixture.awayGoals ?? 0;
  const score = `${homeGoals} – ${awayGoals}`;
  const result = resultFor(homeGoals, awayGoals, fixture.home.isManaged);

  return (
    <Dialog>
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
