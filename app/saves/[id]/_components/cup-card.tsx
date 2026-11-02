import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/src/components/ui/badge";
import type { CupBracket } from "@/src/db/cup-view";
import { CUP_WINNER_PRIZE } from "@/src/engine/balance";
import { competitionName } from "@/src/i18n/countries";
import { formatMoney, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { cupProgress, type CupRoundState, type CupStatus, type NextCupRound } from "../_lib/cup-progress";
import { cupRoundName } from "../_lib/stage";

const STATUS_STYLES: Record<CupStatus, string> = {
  in: "bg-(--club) text-(--club-fg)",
  out: "bg-background text-foreground",
  won: "bg-(--club) text-(--club-fg)",
};

/** A round on the blue: white behind the club, orange for the tie it has to play, red where it went out, dark ahead. */
const SEGMENT_STYLES: Record<CupRoundState, string> = {
  passed: "bg-primary-foreground",
  exempt: "bg-primary-foreground",
  current: "bg-(--club)",
  lost: "bg-loss-on-blue",
  upcoming: "bg-background",
  unreached: "bg-background",
};

/** The round to come: when, against whom and where, or that its draw has yet to tell. */
function NextRound({ next }: { next: NextCupRound }) {
  const t = useTranslations("cup");
  const tStage = useTranslations("stage");
  const locale = useLocale();
  const { draw } = next;
  return (
    <div data-testid="cup-next-round" className="flex items-center justify-between gap-3 rounded-lg bg-background px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-muted-foreground">
          {cupRoundName(next.round, tStage)} · {formatShortDate(next.date, locale)}
        </p>
        <p className="font-bold wrap-break-word">
          {draw === null ? t("drawToCome") : t(draw.atHome ? "versus.home" : "versus.away", { club: draw.opponent })}
        </p>
      </div>
      {draw !== null && <p className="shrink-0 text-[0.8125rem] text-on-blue">{t("drawDone")}</p>}
    </div>
  );
}

type CupCardProps = {
  saveId: string;
  bracket: CupBracket;
  linked?: boolean;
  className?: string;
};

/**
 * The managed club's cup at a glance, in the bright blue: its status, its six rounds and the one to come. It heads the
 * cup's page, with the prize at stake; `linked`, beside the table, it leads to that page instead.
 */
export function CupCard({ saveId, bracket, linked = false, className }: CupCardProps) {
  const t = useTranslations("cup");
  const tStage = useTranslations("stage");
  const tWorld = useTranslations("world");
  const locale = useLocale();
  const { status, rounds, next } = cupProgress(bracket);
  return (
    <section
      aria-labelledby="cup-card-title"
      data-testid="cup-card"
      className={cn("flex flex-col gap-3.5 rounded-card bg-primary p-5 text-primary-foreground", className)}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Beside the table, the country is already said. */}
        <h2 id="cup-card-title" className="min-w-0 font-heading text-[1.75rem] leading-none">
          {linked ? t("title") : competitionName(bracket.competitionCode, tWorld)}
        </h2>
        <Badge data-testid="cup-status" className={cn("h-auto px-2.5 py-1 tracking-wide", STATUS_STYLES[status])}>
          {t(`status.${status}`)}
        </Badge>
      </div>

      <ol aria-label={t("progress")} data-testid="cup-progress" className="grid grid-cols-6 gap-1.5">
        {rounds.map(({ round, state }) => (
          <li
            key={round}
            data-state={state}
            className="flex min-w-0 flex-col items-center gap-1.5 text-xs font-bold data-[state=unreached]:text-on-blue data-[state=upcoming]:text-on-blue"
          >
            <span aria-hidden className={cn("h-2 w-full rounded-full", SEGMENT_STYLES[state])} />
            <span aria-hidden>{t(`rounds.${round}`)}</span>
            <span className="sr-only">{`${cupRoundName(round, tStage)}, ${t(`roundState.${state}`)}`}</span>
          </li>
        ))}
      </ol>

      {next !== null && <NextRound next={next} />}

      {linked ? (
        <Link
          href={`/saves/${saveId}/cup`}
          data-testid="cup-card-link"
          className="self-start text-sm font-semibold underline underline-offset-4 hover:text-on-blue max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
        >
          {t("viewCup")}
        </Link>
      ) : (
        status === "in" && (
          <p data-testid="cup-prize" className="text-sm font-bold text-on-blue">
            {t("prize", { amount: formatMoney(CUP_WINNER_PRIZE, locale) })}
          </p>
        )
      )}
    </section>
  );
}
