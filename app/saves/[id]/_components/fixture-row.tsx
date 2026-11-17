import { useLocale, useTranslations } from "next-intl";
import type { FixtureWithEvents } from "@/src/db/calendar";
import { formatDayMonth } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { MatchSheetDialog } from "../fixtures/_components/match-sheet-dialog";
import { UpcomingMatchSheet } from "../fixtures/_components/upcoming-match-sheet";
import { weekdayAbbreviation } from "../fixtures/_lib/month-grid";
import { RESULT_CLASSES } from "../_lib/results";
import { europeKey } from "@/src/i18n/countries";
import { cupRoundName, europeRoundName, matchResultFor, stageLabel } from "../_lib/stage";
import { ScoreNotes } from "./score-notes";

const ROW =
  "grid min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg text-left transition-shadow hover:ring-1 hover:ring-(--club)/60 focus-visible:ring-2 focus-visible:ring-(--club) focus-visible:outline-none";
const PILL = "inline-flex h-7.5 items-center gap-1 rounded-full px-2.5 whitespace-nowrap tabular-nums";

/** The level of a league, in its code: « fr.2 » is a second division. */
const leagueTier = (competitionCode: string): number => Number(competitionCode.split(".")[1]);

/** The day of the match; in a card, whose matches run over several months, with its month. */
function MatchDay({ date, dense }: { date: Date; dense: boolean }) {
  const locale = useLocale();
  return (
    <span className={cn("flex flex-col gap-0.5 leading-none", !dense && "items-center")}>
      <span className="text-[0.6875rem] font-bold text-muted-foreground uppercase">{weekdayAbbreviation(date, locale)}</span>
      <span className={cn("font-heading tabular-nums", dense ? "text-[0.9375rem] normal-case" : "text-[1.625rem]")}>
        {dense ? formatDayMonth(date, locale) : date.getUTCDate()}
      </span>
    </span>
  );
}

/**
 * Its competition, then its stage: « D2 · Journée 12 ». A cup tie keeps its name, « COUPE — 16es », its first word the tag;
 * a European match its competition's short name, « LAURIERS — 3e journée », in the green of its laurels.
 */
function MatchStage({ fixture }: { fixture: FixtureWithEvents }) {
  const t = useTranslations("fixtures");
  const tStage = useTranslations("stage");
  const europe = europeKey(fixture.competitionCode);
  return (
    <span className="block text-xs text-muted-foreground">
      {europe !== null ? (
        <>
          <span data-europe={fixture.competitionCode} className="font-bold text-win uppercase">
            {t(`tag.europe.${europe}`)}
          </span>{" "}
          — {europeRoundName(fixture.round, tStage)}
        </>
      ) : fixture.cup ? (
        <>
          <span className="font-bold text-(--club) uppercase">{t("tag.cup")}</span> — {cupRoundName(fixture.round, tStage)}
        </>
      ) : (
        <>
          <span className="font-bold text-highlight">{t("tag.league", { tier: leagueTier(fixture.competitionCode) })}</span> ·{" "}
          {stageLabel(fixture, tStage)}
        </>
      )}
    </span>
  );
}

/** The result of a played match and its score, home first as everywhere, whichever side the club was on. */
function PlayedPill({ fixture, homeGoals, awayGoals }: { fixture: FixtureWithEvents; homeGoals: number; awayGoals: number }) {
  const tResults = useTranslations("results");
  const result = matchResultFor({ ...fixture, homeGoals, awayGoals }, fixture.home.isManaged);
  return (
    <span className="flex flex-col items-end gap-1">
      <span data-result={result} title={tResults(`label.${result}`)} className={cn(PILL, "font-heading text-base", RESULT_CLASSES[result])}>
        <span aria-hidden>{tResults(`letter.${result}`)}</span>
        <span className="sr-only">{tResults(`label.${result}`)}</span> {homeGoals} – {awayGoals}
      </span>
      <ScoreNotes match={fixture} className="text-[0.6875rem]" />
    </span>
  );
}

type FixtureRowProps = {
  saveId: string;
  fixture: FixtureWithEvents;
  next: boolean; // the managed club's next match, set apart from the others
  dense?: boolean; // in a card rather than on the page: tighter, and on the page's own background
};

/**
 * A match of the managed club, an item of a list: its day, its opponent and competition, then its result or its place in
 * what comes next. The whole row opens the match sheet of a played match, the opponent's panel of a match to come. Nothing
 * here but phrasing content: the row is one button.
 */
export function FixtureRow({ saveId, fixture, next, dense = false }: FixtureRowProps) {
  const t = useTranslations("fixtures");
  const { homeGoals, awayGoals } = fixture;
  const atHome = fixture.home.isManaged;
  const opponent = atHome ? fixture.away : fixture.home;
  const className = cn(
    ROW,
    dense ? "grid-cols-[3.5rem_minmax(0,1fr)_auto] px-3 py-1.5" : "grid-cols-[2.75rem_minmax(0,1fr)_auto] px-3.5 py-3",
    next ? "bg-secondary" : dense ? "bg-background" : "bg-card",
  );
  const match = (
    <>
      <MatchDay date={fixture.scheduledAt} dense={dense} />
      <span className="min-w-0 space-y-0.5 wrap-break-word">
        <span className="block text-[0.9375rem] leading-tight font-bold">
          {opponent.name}
          <span className="font-medium text-muted-foreground lowercase"> · {t(atHome ? "venueShort.home" : "venueShort.away")}</span>
        </span>
        <MatchStage fixture={fixture} />
      </span>
    </>
  );

  return (
    <li data-testid="fixture-row" data-next={next || undefined}>
      {fixture.played && homeGoals !== null && awayGoals !== null ? (
        <MatchSheetDialog fixture={fixture} triggerClassName={className}>
          {match}
          <PlayedPill fixture={fixture} homeGoals={homeGoals} awayGoals={awayGoals} />
        </MatchSheetDialog>
      ) : (
        <UpcomingMatchSheet saveId={saveId} fixtureId={fixture.id} className={className}>
          {match}
          {next ? (
            <span className={cn(PILL, "bg-(--club) text-sm font-bold text-(--club-fg)")}>{t("next")}</span>
          ) : (
            // The venue is already said beside the opponent.
            <span aria-hidden className="px-2.5 text-muted-foreground">
              —
            </span>
          )}
        </UpcomingMatchSheet>
      )}
    </li>
  );
}
