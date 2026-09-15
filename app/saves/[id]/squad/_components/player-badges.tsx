import type { ReactNode } from "react";
import type { SquadPlayerView } from "@/src/db/squad";
import { formatDate, formatDayMonth } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

type Tone = "warning" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  warning: "bg-warning/15 text-warning",
  danger: "bg-loss/15 text-loss",
  info: "bg-info/15 text-info",
};

function StatusBadge({ tone, title, children }: { tone: Tone; title: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className={cn("inline-flex h-5 items-center rounded-sm px-1.5 text-[0.6875rem] font-semibold whitespace-nowrap", TONE_CLASSES[tone])}
    >
      {children}
    </span>
  );
}

type PlayerBadgesProps = {
  player: Pick<SquadPlayerView, "injuredUntil" | "contractExpiring" | "arrivedThisSeason">;
};

/** Injury, expiring contract and young arrival, in their fixed colors. */
export function PlayerBadges({ player }: PlayerBadgesProps) {
  return (
    <>
      {player.injuredUntil !== null && (
        <StatusBadge tone="danger" title={`Blessé jusqu'au ${formatDate(player.injuredUntil)}`}>
          Blessé · {formatDayMonth(player.injuredUntil)}
        </StatusBadge>
      )}
      {player.contractExpiring && (
        <StatusBadge tone="warning" title="Contrat terminé en fin de saison">
          Expire
        </StatusBadge>
      )}
      {player.arrivedThisSeason && (
        <StatusBadge tone="info" title="Jeune arrivé cette saison">
          Jeune
        </StatusBadge>
      )}
    </>
  );
}
