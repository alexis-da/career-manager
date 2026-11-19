import { useLocale, useTranslations } from "next-intl";
import type { CoachMatchLine } from "@/src/db/national-view";
import type { NationCode } from "@/src/engine/nations";
import { formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { nationalStage } from "../../_components/coach-names";
import { NationPill } from "../../_components/nation-pill";
import { ScoreNotes } from "../../_components/score-notes";
import { RESULT_CLASSES } from "../../_lib/results";
import { nationResult, opponentOf, venueOf } from "../_lib/nation";

const PILL = "inline-flex h-7.5 items-center gap-1 rounded-full px-2.5 whitespace-nowrap tabular-nums";

/** Its result and its score, home first as everywhere, whichever side his nation was on. */
function PlayedPill({ line, code }: { line: CoachMatchLine; code: NationCode }) {
  const tResults = useTranslations("results");
  const result = nationResult(line, code);
  if (result === null || line.homeGoals === null || line.awayGoals === null) {
    return null;
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <span data-result={result} title={tResults(`label.${result}`)} className={cn(PILL, "font-heading text-base", RESULT_CLASSES[result])}>
        <span aria-hidden>{tResults(`letter.${result}`)}</span>
        <span className="sr-only">{tResults(`label.${result}`)}</span> {line.homeGoals} – {line.awayGoals}
      </span>
      <ScoreNotes match={line} className="text-[0.6875rem]" />
    </span>
  );
}

type NationMatchLineProps = {
  line: CoachMatchLine;
  code: NationCode; // his nation
  testId: string;
  next?: boolean; // his next match at stake: set apart
  assistantShown?: boolean; // « joué par l'adjoint » on a friendly to come that his assistant plays
};

/**
 * A match of his nation, an item of a list: its opponent and where it is played, its day and its stage; then its result,
 * « En direct » while it waits live, « Suivant » for his next match at stake. The opponent has the whole width but the
 * result's: a phone's narrowest line keeps a long name on two lines at most.
 */
export function NationMatchLine({ line, code, testId, next = false, assistantShown = false }: NationMatchLineProps) {
  const t = useTranslations("nationalTeam");
  const tNations = useTranslations("nations");
  const tWorld = useTranslations("world");
  const locale = useLocale();
  const opponent = opponentOf(line, code);
  const byAssistant = assistantShown && line.byAssistant && !line.played;
  return (
    <li
      data-testid={testId}
      data-competition={line.competition}
      data-by-assistant={line.byAssistant}
      data-played={line.played}
      data-live={line.live || undefined}
      data-next={next || undefined}
      className={cn("grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2", next ? "bg-secondary" : "bg-background")}
    >
      <span className="min-w-0 space-y-1">
        <span className="flex min-w-0 items-center gap-2">
          <NationPill code={opponent} className={cn("h-6 min-w-10 text-xs", next && "bg-background")} />
          {/* On two lines if need be, never cut. */}
          <span className="min-w-0 text-[0.9375rem] leading-tight font-bold wrap-break-word">
            {tWorld(`nationalities.${opponent}`)}
            <span className="font-medium text-muted-foreground"> · {t(`venue.${venueOf(line, code)}`)}</span>
          </span>
        </span>
        <span className="block text-xs leading-snug text-muted-foreground">
          <time dateTime={line.date.toISOString()} className="font-semibold text-foreground tabular-nums">
            {formatShortDate(line.date, locale)}
          </time>{" "}
          · {nationalStage(line, tNations)}
          {byAssistant && <span className="text-highlight"> · {t("session.byAssistant")}</span>}
        </span>
      </span>
      {line.played ? (
        <PlayedPill line={line} code={code} />
      ) : line.live ? (
        <span className={cn(PILL, "bg-primary text-xs font-bold text-primary-foreground")}>{t("session.live")}</span>
      ) : next ? (
        <span className={cn(PILL, "border border-highlight/60 text-xs font-bold text-highlight")}>{t("session.next")}</span>
      ) : (
        // Nothing yet: its day and its stage say it all.
        <span aria-hidden className="px-2.5 text-muted-foreground">
          —
        </span>
      )}
    </li>
  );
}
