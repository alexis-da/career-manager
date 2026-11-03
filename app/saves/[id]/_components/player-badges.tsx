import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { DisciplineStatus } from "@/src/db/discipline-view";
import type { PlayerProfile } from "@/src/db/players";
import type { Translator } from "@/src/i18n/translator";
import { formatDate, formatDayMonth } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

type Tone = "warning" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  warning: "bg-warning/15 text-warning",
  danger: "bg-loss/15 text-loss",
  info: "bg-info/15 text-info",
};

/** A suspension or yellow cards at risk, as every screen names it: its label on the badge, its sentence on hover. */
export type DisciplineBadge = {
  id: "suspended" | "suspended-later" | "booking-risk";
  tone: "danger" | "warning"; // danger: out of the next match, as an injured player; warning: a later match's matter
  label: string; // « Suspendu », « Suspendu en coupe », « 4 jaunes », « 4 jaunes en coupe »
  title: string;
};

/**
 * A player's suspensions and yellow cards at risk, the most pressing first: suspended for the next match, then for a later
 * one of the other competition, then one booking from a suspension in each competition. None without a status: an
 * opponent's, a player at a break.
 */
export function disciplineBadges(discipline: DisciplineStatus | null | undefined, t: Translator<"player">): DisciplineBadge[] {
  if (discipline === null || discipline === undefined) {
    return [];
  }
  const badges: DisciplineBadge[] = [];
  if (discipline.suspended) {
    badges.push({ id: "suspended", tone: "danger", label: t("badges.suspended"), title: t("badges.suspendedTitle") });
  }
  if (discipline.suspendedLater !== null) {
    badges.push({
      id: "suspended-later",
      tone: "warning",
      label: t(`badges.suspendedIn.${discipline.suspendedLater}`),
      title: t(`badges.suspendedInTitle.${discipline.suspendedLater}`),
    });
  }
  for (const { competition, yellows } of discipline.bookingRisks) {
    badges.push({
      id: "booking-risk",
      tone: "warning",
      label: t(`badges.bookingRisk.${competition}`, { yellows }),
      title: t(`badges.bookingRiskTitle.${competition}`, { yellows }),
    });
  }
  return badges;
}

/**
 * The card a player's slot or tile shows for the next match: red when he is suspended for it, yellow when a booking in
 * it would suspend him; none otherwise, nor for a player without a status.
 */
export function nextMatchCard(discipline: DisciplineStatus | null | undefined): DisciplineBadge["tone"] | null {
  if (discipline === null || discipline === undefined) {
    return null;
  }
  return discipline.suspended ? "danger" : discipline.bookingRiskNextMatch ? "warning" : null;
}

/**
 * A card, upright, drawn in CSS where a word has no room (a slot of the pitch, a tile of the bench): red or yellow, as the
 * referee's. Decorative: the slot or the tile names it.
 */
export function CardMark({ tone, className }: { tone: DisciplineBadge["tone"]; className?: string }) {
  return (
    <span
      aria-hidden
      data-card-mark={tone === "danger" ? "red" : "yellow"}
      className={cn("block h-3 w-2 rounded-[2px] ring-2 ring-background", tone === "danger" ? "bg-loss" : "bg-warning", className)}
    />
  );
}

type StatusBadgeProps = {
  tone: Tone;
  title: string;
  testId: string;
  onBlue: boolean;
  children: ReactNode;
};

/**
 * A badge, on one line from lg. Under it, on two if its card has no room left: « Suspendu en coupe » beside a fitness at
 * 360 px, rather than a card wider than the screen.
 */
function StatusBadge({ tone, title, testId, onBlue, children }: StatusBadgeProps) {
  return (
    <span
      title={title}
      data-testid={testId}
      className={cn(
        "inline-flex min-h-5 items-center rounded-sm px-1.5 text-[0.6875rem] leading-tight font-semibold whitespace-nowrap max-lg:py-0.5 max-lg:whitespace-normal",
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
  player: Pick<PlayerProfile, "injuredUntil" | "discipline" | "contractExpiring" | "arrivedThisSeason">;
  onBlue?: boolean; // on the bright blue rather than on a card
};

/** Whether a player has a badge to show: the squad's card keeps no room for none. */
export function hasPlayerBadges(player: PlayerBadgesProps["player"]): boolean {
  const { discipline } = player;
  return (
    player.injuredUntil !== null ||
    player.contractExpiring ||
    player.arrivedThisSeason ||
    (discipline !== null && (discipline.suspended || discipline.suspendedLater !== null || discipline.bookingRisks.length > 0))
  );
}

/** Injury, suspensions and yellow cards at risk, expiring contract and young arrival, in their fixed colors. */
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
      {disciplineBadges(player.discipline, t).map(({ id, tone, label, title }) => (
        <StatusBadge key={`${id}:${label}`} tone={tone} title={title} testId={`player-badge-${id}`} onBlue={onBlue}>
          {label}
        </StatusBadge>
      ))}
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
