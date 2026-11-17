import { useTranslations } from "next-intl";
import type { FixtureWithEvents, ScoreTimeline } from "@/src/db/calendar";
import { competitionName } from "@/src/i18n/countries";
import { cn } from "@/src/lib/utils";
import { Panel } from "@/src/components/panel";
import { ScoreNotes } from "../../_components/score-notes";
import { cupRoundName, europeRoundName, isEuropeStage } from "../../_lib/stage";
import { LiveCardTitle } from "./live-card-title";

/** Another match of the day at the clock's minute. */
export type OtherScore = {
  match: ScoreTimeline;
  home: number;
  away: number;
  recent: boolean; // a goal has just gone in: the score lights up
};

type LiveOtherMatchesProps = {
  match: FixtureWithEvents; // the managed club's, whose competition and stage these are
  scores: OtherScore[];
  over: boolean; // the managed club's match is over: the others' are too, their notes can be read
};

/** The day's other matches, whose scores go on with the clock. Names go to the line, never cut. */
export function LiveOtherMatches({ match, scores, over }: LiveOtherMatchesProps) {
  const t = useTranslations("live");
  const tWorld = useTranslations("world");
  const tStage = useTranslations("stage");
  return (
    <Panel className="max-sm:p-4" data-testid="live-other-matches">
      <LiveCardTitle>{t("otherMatches")}</LiveCardTitle>
      <p className="text-sm text-muted-foreground">
        {competitionName(match.competitionCode, tWorld)}
        {match.cup && ` · ${cupRoundName(match.round, tStage)}`}
        {isEuropeStage(match) && ` · ${europeRoundName(match.round, tStage)}`}
      </p>
      <ul className="mt-3 space-y-2 text-sm leading-tight">
        {scores.map(({ match: other, home, away, recent }) => (
          <li key={other.id} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 max-sm:gap-2">
            <span className="text-right wrap-break-word">{other.home.name}</span>
            <span
              className={cn(
                "rounded-lg px-2.5 py-1 font-heading text-base leading-tight whitespace-nowrap tabular-nums transition-colors",
                recent ? "bg-(--club) text-(--club-fg)" : "bg-background",
              )}
            >
              {home} – {away}
            </span>
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 wrap-break-word">{other.away.name}</span>
              {over && <ScoreNotes match={other} />}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
