import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/src/components/ui/badge";
import type { FixtureView } from "@/src/db/calendar";
import type { EuropeCompetitionView } from "@/src/db/europe-view";
import { competitionName } from "@/src/i18n/countries";
import { formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { europeRoundName, europeStageReached } from "../../_lib/stage";
import {
  europeNext,
  europeSteps,
  managedStanding,
  nextMatchSentence,
  nextPrize,
  prizeSentence,
  standingSentence,
  standingStatus,
  type EuropeNext,
  type EuropeStatus,
  type StepState,
} from "../_lib/europe";

const STATUS_STYLES: Record<EuropeStatus, string> = {
  in: "bg-(--club) text-(--club-fg)",
  out: "bg-background text-foreground",
  won: "bg-(--club) text-(--club-fg)",
};

/** A stage on the blue, as the cup card draws its rounds: white behind the club, orange where it stands, red where it went out. */
const STEP_STYLES: Record<StepState, string> = {
  passed: "bg-primary-foreground",
  exempt: "bg-primary-foreground",
  current: "bg-(--club)",
  lost: "bg-loss-on-blue",
  upcoming: "bg-background",
  unreached: "bg-background",
};

/** What comes next: the round, its date and the opponent, or when the league phase's table ends. */
function NextStep({ next }: { next: EuropeNext }) {
  const t = useTranslations("europe");
  const tStage = useTranslations("stage");
  const locale = useLocale();
  if (next.kind === "tableEnd") {
    return (
      <p data-testid="europe-next-match" className="rounded-lg bg-background px-3.5 py-3 text-sm font-semibold">
        {t("next.tableEnd", { date: formatShortDate(next.date, locale) })}
      </p>
    );
  }
  return (
    <div data-testid="europe-next-match" className="min-w-0 rounded-lg bg-background px-3.5 py-3">
      <p className="text-xs font-bold text-muted-foreground first-letter:uppercase">
        {europeRoundName(next.round, tStage)} · {formatShortDate(next.date, locale)}
      </p>
      <p className="font-bold wrap-break-word">{nextMatchSentence(next, t)}</p>
    </div>
  );
}

type EuropeCardProps = {
  competition: EuropeCompetitionView | null; // the managed club's competition this year; null when it did not qualify
  matches: readonly FixtureView[]; // its matches there, by date
  className?: string;
};

/**
 * The managed club's European season at a glance, in the bright blue like the cup's card: where it stands, its five
 * stages, its next match and the prize at stake; or why it plays none this year.
 */
export function EuropeCard({ competition, matches, className }: EuropeCardProps) {
  const t = useTranslations("europe");
  const tStage = useTranslations("stage");
  const tWorld = useTranslations("world");
  const locale = useLocale();
  const standing = managedStanding(competition);
  const status = standingStatus(standing);
  const steps = europeSteps(competition, standing);
  const next = europeNext(competition, matches);
  const prize = competition === null ? null : nextPrize(competition.code, standing);
  return (
    <section
      aria-labelledby="europe-card-title"
      data-testid="europe-card"
      data-standing={standing.kind}
      className={cn("flex flex-col gap-3.5 rounded-card bg-primary p-5 text-primary-foreground", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="europe-card-title" className="min-w-0 font-heading text-[1.75rem] leading-none">
          {competition === null ? t("card.none") : competitionName(competition.code, tWorld)}
        </h2>
        {status !== null && (
          <Badge data-testid="europe-status-badge" className={cn("h-auto px-2.5 py-1 tracking-wide", STATUS_STYLES[status])}>
            {t(`status.${status}`)}
          </Badge>
        )}
      </div>

      <p data-testid="europe-status" className="text-[1.0625rem] leading-snug font-bold">
        {standingSentence(standing, competition?.leagueMatches ?? 0, t)}
      </p>

      {steps !== null && (
        <ol aria-label={t("progress")} data-testid="europe-progress" className="grid grid-cols-5 gap-1.5">
          {steps.map(({ stage, state }) => (
            <li
              key={stage}
              data-state={state}
              className="flex min-w-0 flex-col items-center gap-1.5 text-center text-[0.6875rem] font-bold hyphens-auto wrap-break-word data-[state=unreached]:text-on-blue data-[state=upcoming]:text-on-blue"
            >
              <span aria-hidden className={cn("h-2 w-full rounded-full", STEP_STYLES[state])} />
              <span aria-hidden className="max-w-full">
                {t(`steps.${stage}`)}
              </span>
              <span className="sr-only">{`${europeStageReached(stage, tStage)}, ${t(`stepState.${state}`)}`}</span>
            </li>
          ))}
        </ol>
      )}

      {next !== null && <NextStep next={next} />}

      {prize !== null && (
        <p data-testid="europe-prize" className="text-sm font-bold text-on-blue">
          {prizeSentence(prize, t, locale)}
        </p>
      )}
    </section>
  );
}
