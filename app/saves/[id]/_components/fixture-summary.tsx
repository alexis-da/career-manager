import type { FixtureView } from "@/src/db/calendar";
import { formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

const teamClass = (isManaged: boolean): string => cn("truncate", isManaged && "font-semibold");

/** One fixture: date and competition, then both teams with the score when played. */
export function FixtureSummary({ fixture }: { fixture: FixtureView }) {
  const managedAtHome = fixture.home.isManaged;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        <span className="tabular-nums">{formatShortDate(fixture.scheduledAt)}</span> · {fixture.competitionName} ·
        journée {fixture.round} · {managedAtHome ? "domicile" : "extérieur"}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className={cn(teamClass(fixture.home.isManaged), "text-right")}>{fixture.home.name}</span>
        <span className="rounded-md bg-muted px-2 py-1 text-base font-semibold tabular-nums">
          {fixture.played ? `${fixture.homeGoals} – ${fixture.awayGoals}` : "–"}
        </span>
        <span className={teamClass(fixture.away.isManaged)}>{fixture.away.name}</span>
      </div>
    </div>
  );
}
