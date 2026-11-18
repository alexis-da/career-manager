import { useTranslations } from "next-intl";
import type { CurrentSeason } from "@/src/engine/career-history";
import { EUROPE_STAGES } from "@/src/engine/europe";
import { seasonLabel } from "@/src/engine/world";
import { competitionName } from "@/src/i18n/countries";
import { Panel } from "@/src/components/panel";
import { cupLabel, europeLabel } from "../../_lib/seasons";

/** The season in progress, above the completed ones: its place in the league, where its cup and its Europe stand. */
export function CurrentSeasonLine({ season }: { season: CurrentSeason }) {
  const t = useTranslations("seasons.history.current");
  const tWorld = useTranslations("world");
  const tStage = useTranslations("stage");
  const cup = season.cup === null ? null : cupLabel({ cupRound: season.cup.round, cupWinner: season.cup.won }, tStage);
  const europe =
    season.europe === null
      ? null
      : europeLabel(
          { europeCode: season.europe.code, europeStage: Math.min(season.europe.stage, EUROPE_STAGES.FINAL), europeWinner: season.europe.won },
          tStage,
        );
  return (
    <Panel data-testid="history-current" className="space-y-1 border-dashed">
      <p className="text-xs font-bold tracking-wider text-highlight uppercase">{t("title", { season: seasonLabel(season.startYear) })}</p>
      <p className="font-semibold">{competitionName(season.competitionCode, tWorld)}</p>
      <p className="text-sm text-muted-foreground tabular-nums">
        {season.rank === null || season.played === 0 ? t("noMatch") : t("rank", { rank: season.rank, points: season.points })}
      </p>
      {cup !== null && (
        <p data-column="cup" className="text-xs font-semibold text-muted-foreground">
          {season.cup?.out === true ? `${cup} · ${t("out")}` : cup}
        </p>
      )}
      {europe !== null && (
        <p data-column="europe" className="text-xs font-semibold text-muted-foreground">
          {season.europe?.out === true ? `${europe} · ${t("out")}` : europe}
        </p>
      )}
    </Panel>
  );
}
