import { useTranslations } from "next-intl";
import type { MatchEventType, Side } from "@/src/engine/match";
import { cn } from "@/src/lib/utils";
import { Panel } from "../../_components/panel";
import { matchStats, type MatchStat } from "../_lib/match-stats";
import { LiveCardTitle } from "./live-card-title";

/** A side's share of a bar. Nothing at 0: the gap between the two would stay alone at the end of the bar. */
function Segment({ share, managed }: { share: number; managed: boolean }) {
  return share === 0 ? null : <span className={cn("basis-0 rounded-full", managed ? "bg-(--club)" : "bg-secondary")} style={{ flexGrow: share }} />;
}

function StatBar({ stat: { home, away }, managedSide }: { stat: MatchStat; managedSide: Side }) {
  const nothing = home + away === 0;
  return (
    <div aria-hidden className="flex h-2 gap-1">
      {/* At 0-0, two equal halves, for neither club. */}
      <Segment share={nothing ? 1 : home} managed={!nothing && managedSide === "home"} />
      <Segment share={nothing ? 1 : away} managed={!nothing && managedSide === "away"} />
    </div>
  );
}

type LiveStatsProps = {
  shown: { type: MatchEventType; side: Side }[]; // the match's events the clock has passed
  managedSide: Side;
};

/** The two clubs compared on what the match has shown so far, and nothing the engine does not play. */
export function LiveStats({ shown, managedSide }: LiveStatsProps) {
  const t = useTranslations("live");
  return (
    <Panel className="max-sm:p-4" data-testid="live-stats">
      <LiveCardTitle>{t("stats.title")}</LiveCardTitle>
      <ul className="mt-3 space-y-3.5">
        {matchStats(shown).map((stat) => (
          <li key={stat.type} data-stat={stat.type} className="space-y-1.5">
            <p className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-bold tabular-nums">{stat.home}</span>
              <span className="text-muted-foreground">{t(`stats.${stat.type}`)}</span>
              <span className="font-bold tabular-nums">{stat.away}</span>
            </p>
            <StatBar stat={stat} managedSide={managedSide} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
