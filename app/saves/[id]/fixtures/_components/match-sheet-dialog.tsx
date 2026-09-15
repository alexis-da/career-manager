"use client";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import type { FixtureWithEvents, MatchEventView } from "@/src/db/calendar";
import type { MatchEventType } from "@/src/engine/match";
import { formatDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

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

export function MatchSheetDialog({ fixture }: { fixture: FixtureWithEvents }) {
  const score = `${fixture.homeGoals} – ${fixture.awayGoals}`;
  const teamName = (side: MatchEventView["side"]): string =>
    side === "home" ? fixture.home.name : side === "away" ? fixture.away.name : "";

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" className="tabular-nums" />}>{score}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="tabular-nums">
            {fixture.home.name} {score} {fixture.away.name}
          </DialogTitle>
          <DialogDescription>
            {fixture.competitionName} · journée {fixture.round} · {formatDate(fixture.scheduledAt)}
          </DialogDescription>
        </DialogHeader>

        {fixture.events.length === 0 ? (
          <p className="text-muted-foreground">Aucun événement.</p>
        ) : (
          <ol className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            {fixture.events.map((event) => (
              <li
                key={event.id}
                className={cn(
                  "grid grid-cols-[3.5rem_1.5rem_1fr] items-baseline gap-2 rounded-md px-2 py-1",
                  event.type === "GOAL" && "bg-muted",
                )}
              >
                <span className="text-right tabular-nums text-muted-foreground">{formatMinute(event.minute)}</span>
                <span aria-hidden>{EVENT_MARKS[event.type]}</span>
                <span className="min-w-0">
                  <span className="sr-only">{EVENT_LABELS[event.type]} : </span>
                  <span className={cn(event.type === "GOAL" && "font-medium")}>{describe(event)}</span>
                  {event.side !== null && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {EVENT_LABELS[event.type]} · {teamName(event.side)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
