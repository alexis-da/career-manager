import { useTranslations } from "next-intl";
import type { FixtureWithEvents, ScoreTimeline } from "@/src/db/calendar";
import { competitionName } from "@/src/i18n/countries";
import { cn } from "@/src/lib/utils";
import { Panel } from "@/src/components/panel";
import { ScoreNotes } from "../../_components/score-notes";
import { cupRoundName, europeRoundName, internationalRoundName, isEuropeStage, isInternationalStage } from "../../_lib/stage";
import { LiveCardTitle } from "./live-card-title";

/** Another match of the day at the clock's minute. */
export type OtherScore = {
  match: ScoreTimeline;
  home: number;
  away: number;
  recent: boolean; // a goal has just gone in: the score lights up
};

type LiveOtherMatchesProps = {
  match: FixtureWithEvents; // the managed club's, whose competition and stage these are; or the national coach's
  scores: OtherScore[];
  over: boolean; // the managed club's match is over: the others' are too, their notes can be read
};

/**
 * The day's other matches, whose scores go on with the clock. Names go to the line, never cut. A club's are its
 * competition's, named once above them; a national team's are those of every national teams' competition that day,
 * qualifiers and friendlies on one date: each round is named above its first match, as the Sélections tab names them
 * (the page puts those of the same competition together).
 */
export function LiveOtherMatches({ match, scores, over }: LiveOtherMatchesProps) {
  const t = useTranslations("live");
  const tWorld = useTranslations("world");
  const tStage = useTranslations("stage");
  const tNations = useTranslations("nations");
  const tNational = useTranslations("nationalLive");
  // A tournament's other group matches come without their group: their matchday is named without it.
  const rounds = isInternationalStage(match)
    ? scores.map(({ match: other }) => internationalRoundName(other, tNations) ?? tNational("groupRound", { round: other.round }))
    : null;
  return (
    <Panel className="max-sm:p-4" data-testid="live-other-matches">
      <LiveCardTitle>{t("otherMatches")}</LiveCardTitle>
      {rounds === null && (
        <p className="text-sm text-muted-foreground">
          {competitionName(match.competitionCode, tWorld)}
          {match.cup && ` · ${cupRoundName(match.round, tStage)}`}
          {isEuropeStage(match) && ` · ${europeRoundName(match.round, tStage)}`}
        </p>
      )}
      <ul className="mt-3 space-y-2 text-sm leading-tight">
        {scores.map(({ match: other, home, away, recent }, index) => {
          const round = rounds?.[index] ?? null;
          const heading = round !== null && (index === 0 || rounds?.[index - 1] !== round) ? round : null;
          return (
            <li
              key={other.id}
              data-competition={rounds === null ? undefined : other.competitionCode}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 max-sm:gap-2",
                heading !== null && "gap-y-1 max-sm:gap-y-1",
                heading !== null && index > 0 && "pt-2",
              )}
            >
              {heading !== null && (
                <span className="col-span-3 text-[0.6875rem] font-semibold tracking-wide wrap-break-word text-muted-foreground uppercase">
                  {heading}
                </span>
              )}
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
          );
        })}
      </ul>
    </Panel>
  );
}
