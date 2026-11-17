import { useLocale, useTranslations } from "next-intl";
import { Panel } from "@/src/components/panel";
import { Badge } from "@/src/components/ui/badge";
import type { EuropeCompetitionView } from "@/src/db/europe-view";
import { formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { ScoreNotes } from "../../_components/score-notes";
import { europeRoundName } from "../../_lib/stage";
import { bracketRounds, isUndecided, sideLabel, type BracketRound, type BracketSide, type BracketTie } from "../_lib/europe";

const isManaged = (side: BracketSide): boolean => side.kind === "club" && side.club.isManaged;

/** A side of a tie: the club through in bold, the one out muted, the managed club orange whatever its fate; a side to come in italics. */
function Side({ side, tie, align }: { side: BracketSide; tie: BracketTie; align: "left" | "right" }) {
  const t = useTranslations("europe");
  const winner = tie.match?.played === true ? tie.match.winnerClubSaveId : null;
  const won = side.kind === "club" && winner !== null && winner === side.club.clubSaveId;
  return (
    // On two lines rather than cut, a long word broken if it must.
    <span
      className={cn(
        "min-w-0 wrap-break-word",
        align === "right" && "text-right",
        side.kind !== "club" && "text-muted-foreground italic",
        won && "font-semibold",
        isManaged(side) ? "text-(--club)" : winner !== null && !won && "text-muted-foreground",
      )}
    >
      {sideLabel(side, t)}
    </span>
  );
}

function RoundBlock({ round }: { round: BracketRound }) {
  const t = useTranslations("europe");
  const tStage = useTranslations("stage");
  const locale = useLocale();
  const titleId = `europe-round-${round.round}-title`;
  return (
    <section
      aria-labelledby={titleId}
      data-round={round.round}
      data-testid={`europe-round-${round.round}`}
      className="space-y-2 rounded-lg bg-background p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h4 id={titleId} className="font-heading text-xl font-bold normal-case">
          {europeRoundName(round.round, tStage)}
        </h4>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="first-letter:uppercase">{formatShortDate(round.date, locale)}</span>
          {round.neutral && (
            <Badge data-testid="europe-neutral" variant="secondary" className="h-auto px-2 py-0.5">
              {tStage("neutral")}
            </Badge>
          )}
        </p>
      </div>
      {isUndecided(round) ? (
        <p className="text-sm text-muted-foreground">{t("bracket.toCome")}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {round.ties.map((tie, index) => {
            const managed = isManaged(tie.home) || isManaged(tie.away);
            const played = tie.match !== null && tie.match.played;
            return (
              <li
                key={tie.match?.id ?? index}
                data-testid="europe-tie"
                data-managed={managed || undefined}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-2 py-1.5 max-sm:gap-2 max-sm:px-1",
                  managed && "rounded-md bg-secondary",
                )}
              >
                <Side side={tie.home} tie={tie} align="right" />
                <span className="flex flex-col items-center">
                  <span className="font-heading text-base font-bold tabular-nums">
                    {played && tie.match !== null ? `${tie.match.homeGoals} – ${tie.match.awayGoals}` : "–"}
                  </span>
                  {tie.match !== null && (
                    // On two lines rather than as wide as a name cut in half.
                    <ScoreNotes match={tie.match} className="text-center text-[0.625rem] leading-tight whitespace-normal" />
                  )}
                </span>
                <Side side={tie.away} tie={tie} align="left" />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * A European competition's knockout phase, round by round with their dates: nothing known before the end of the league
 * phase, then the fixed bracket, each tie's result once played (the club through in bold), the final on neutral ground.
 */
export function EuropeBracket({ competition, className }: { competition: EuropeCompetitionView; className?: string }) {
  const t = useTranslations("europe");
  return (
    <Panel aria-labelledby="europe-bracket-title" data-testid="europe-bracket" className={cn("min-w-0 space-y-4 p-3 sm:p-5", className)}>
      <div className="space-y-1">
        <h3 id="europe-bracket-title" className="font-heading text-2xl leading-tight sm:text-[1.75rem]">
          {t("bracket.title")}
        </h3>
        <p className="text-[0.8125rem] text-muted-foreground">{t("bracket.hint")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {bracketRounds(competition).map((round) => (
          <RoundBlock key={round.round} round={round} />
        ))}
      </div>
    </Panel>
  );
}
