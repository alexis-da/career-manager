import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { PlayerProfile } from "@/src/db/players";
import { formatDate, formatDayMonth } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

type Tone = "warning" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  warning: "bg-warning/15 text-warning",
  danger: "bg-loss/15 text-loss",
  info: "bg-info/15 text-info",
};

type StatusBadgeProps = {
  tone: Tone;
  title: string;
  testId: string;
  onBlue: boolean;
  children: ReactNode;
};

function StatusBadge({ tone, title, testId, onBlue, children }: StatusBadgeProps) {
  return (
    <span
      title={title}
      data-testid={testId}
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 text-[0.6875rem] font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        // A tone's faint fill and its text would both fade into the bright blue.
        onBlue && "bg-background",
      )}
    >
      {children}
    </span>
  );
}

type PlayerBadgesProps = {
  player: Pick<PlayerProfile, "injuredUntil" | "contractExpiring" | "arrivedThisSeason">;
  onBlue?: boolean; // on the bright blue rather than on a card
};

/** Injury, expiring contract and young arrival, in their fixed colors. */
export function PlayerBadges({ player, onBlue = false }: PlayerBadgesProps) {
  const t = useTranslations("player");
  const locale = useLocale();
  return (
    <>
      {player.injuredUntil !== null && (
        <StatusBadge
          tone="danger"
          title={t("badges.injuredTitle", { date: formatDate(player.injuredUntil, locale) })}
          testId="player-badge-injured"
          onBlue={onBlue}
        >
          {t("badges.injured", { date: formatDayMonth(player.injuredUntil, locale) })}
        </StatusBadge>
      )}
      {player.contractExpiring && (
        <StatusBadge tone="warning" title={t("badges.expiringTitle")} testId="player-badge-expiring" onBlue={onBlue}>
          {t("badges.expiring")}
        </StatusBadge>
      )}
      {player.arrivedThisSeason && (
        <StatusBadge tone="info" title={t("badges.youngTitle")} testId="player-badge-young" onBlue={onBlue}>
          {t("badges.young")}
        </StatusBadge>
      )}
    </>
  );
}
