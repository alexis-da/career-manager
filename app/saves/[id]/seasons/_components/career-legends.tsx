import { useTranslations } from "next-intl";
import type { CareerHistoryView } from "@/src/db/career-history";
import { LEGEND_THRESHOLD, LEGENDS_SHOWN, type LegendLine } from "@/src/engine/career-history";
import { seasonLabel } from "@/src/engine/world";
import Link from "@/src/components/link";
import { PlayerFace } from "@/src/components/player-face";
import { Panel } from "@/src/components/panel";
import { HISTORY_TITLE } from "./trophy-room";

/**
 * The club's legends (docs/design/historique.md § 4): the players of the highest legend index, from LEGEND_THRESHOLD,
 * each with his face, his seasons at the club and his figures, LEGENDS_SHOWN of them unless `showAll` (« Voir toutes les
 * légendes », the same page with ?legends=all, `paths.all`; « Voir moins » goes back to `paths.some`); then the players
 * still at the club on their way, above ON_THE_WAY_THRESHOLD.
 */
export function CareerLegends({
  history,
  showAll = false,
  paths,
}: {
  history: CareerHistoryView;
  showAll?: boolean;
  paths?: { some: string; all: string };
}) {
  const t = useTranslations("seasons.history.legends");
  const tRecords = useTranslations("seasons.history.records");
  const tPositions = useTranslations("positions");
  const { players, clubColors } = history;

  const line = (legend: LegendLine, testId: string, extra: string | null) => {
    const player = players.get(legend.playerKey);
    return (
      <li key={legend.playerKey} data-testid={testId} data-key={legend.playerKey} data-index={legend.index} className="flex items-center gap-3 py-2.5">
        <PlayerFace playerKey={legend.playerKey} age={player?.age ?? 25} clubColors={clubColors} size={44} className="shrink-0" />
        <div className="min-w-0 flex-1 leading-snug">
          <div className="flex items-baseline justify-between gap-x-3">
            <span className="min-w-0 font-semibold wrap-break-word">
              {player?.name ?? legend.playerKey}
              {player !== undefined && <span className="ml-1.5 text-xs text-muted-foreground">{tPositions(`short.${player.position}`)}</span>}
            </span>
            <span className="shrink-0 font-heading text-lg leading-none normal-case tabular-nums">{t("index", { index: legend.index })}</span>
          </div>
          <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
            {legend.firstYear === legend.lastYear ? seasonLabel(legend.firstYear) : t("years", { from: seasonLabel(legend.firstYear), to: seasonLabel(legend.lastYear) })} ·{" "}
            {t("figures", {
              matches: tRecords("matches", { count: legend.matches }),
              goals: tRecords("goals", { count: legend.goals }),
              assists: t("assists", { count: legend.assists }),
            })}
          </p>
          {(legend.titles > 0 || legend.awards > 0 || extra !== null) && (
            <p className="text-[0.8125rem] font-semibold text-(--club)">
              {[legend.titles > 0 ? t("titles", { count: legend.titles }) : null, legend.awards > 0 ? t("awards", { count: legend.awards }) : null, extra]
                .filter((part) => part !== null)
                .join(" · ")}
            </p>
          )}
        </div>
      </li>
    );
  };

  const shown = showAll ? history.legends : history.legends.slice(0, LEGENDS_SHOWN);
  const more = history.legends.length > LEGENDS_SHOWN && paths !== undefined;

  return (
    <Panel id="legendes" aria-labelledby="career-legends-title" data-testid="career-legends" className="scroll-mt-4 space-y-2">
      <h2 id="career-legends-title" className={HISTORY_TITLE}>
        {t("title")}
      </h2>
      {history.legends.length === 0 ? (
        <p data-testid="career-legends-none" className="text-sm text-muted-foreground">
          {t("none")}
        </p>
      ) : (
        <ul className="divide-y">{shown.map((legend) => line(legend, "legend", null))}</ul>
      )}
      {more && (
        <Link
          href={showAll ? `${paths.some}#legendes` : `${paths.all}#legendes`}
          data-testid="career-legends-all"
          className="inline-flex text-sm font-semibold text-highlight underline-offset-4 hover:underline max-sm:min-h-11 max-sm:items-center"
        >
          {showAll ? t("fewer") : t("all", { count: history.legends.length })}
        </Link>
      )}
      {history.onTheWay.length > 0 && (
        <div data-testid="career-on-the-way" className="space-y-1 border-t pt-3">
          <h3 className="eyebrow">{t("onTheWay")}</h3>
          <ul className="divide-y">
            {history.onTheWay.map((player) => line(player, "on-the-way", t("missing", { points: LEGEND_THRESHOLD - player.index })))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("explain", { threshold: LEGEND_THRESHOLD })}</p>
    </Panel>
  );
}
