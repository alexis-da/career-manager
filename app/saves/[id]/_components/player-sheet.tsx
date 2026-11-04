"use client";

import { nationalityName } from "../_lib/nationalities";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeftIcon, XIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import type { PlayerProfile, TransferHistoryItem } from "@/src/db/players";
import { seasonLabel } from "@/src/engine/world";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatDate, formatMoney } from "@/src/lib/format";
import { playerInitials } from "@/src/lib/player-initials";
import { cn } from "@/src/lib/utils";

import { SecondaryPositionBadges } from "./position-badge";
import { AttributeBars } from "./attribute-bars";
import { PlayerBadges } from "./player-badges";

function transferLabel(transfer: TransferHistoryItem, t: Translator<"player">, locale: Locale): string {
  const from = transfer.fromClubName ?? "?";
  const to = transfer.toClubName ?? "?";
  switch (transfer.type) {
    case "TRANSFER":
      return t("transfer.transfer", { from, to, fee: formatMoney(transfer.fee, locale) });
    case "LOAN":
      return t("transfer.loan", { from, to });
    case "FREE":
      if (transfer.toClubName !== null) {
        return t("transfer.signedFree", { club: transfer.toClubName });
      }
      return transfer.fromClubName === null ? t("transfer.released") : t("transfer.releasedBy", { club: transfer.fromClubName });
    case "RETIREMENT":
      return t("transfer.retirement");
  }
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    // The figure above its label, which a screen reader still reads first.
    <div className="flex min-w-0 flex-col-reverse items-center gap-0.5 rounded-lg bg-background px-1 py-2.5 text-center">
      <dt className="text-xs leading-tight text-muted-foreground">{label}</dt>
      <dd className="font-heading text-[1.75rem] leading-none tabular-nums">{value}</dd>
    </div>
  );
}

function ContractLine({ label, warning = false, children }: { label: string; warning?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-bold tabular-nums", warning && "text-warning")}>{children}</dd>
    </div>
  );
}

type PlayerSheetProps = {
  profile: PlayerProfile;
  startYear: number;
  footer: ReactNode; // the actions, which depend on where the player plays
  onClose: () => void;
  pinned?: boolean; // from xl, always on screen beside the pitch: no cross there
};

/**
 * A player's sheet, over the page under xl, beside the list it was opened from at xl and above. Its own width rules its
 * layout: in the 296 px of a computer's lineup page, the rating goes above the name and the tiles on two rows. The head
 * scrolls away with the rest, or a short screen would have no room left; the close button and the actions stay.
 */
export function PlayerSheet({ profile, startYear, footer, onClose, pinned = false }: PlayerSheetProps) {
  const t = useTranslations("player");
  const tWorld = useTranslations("world");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  // Escape closes the sheet, unless it is closing one of the dialogs opened from it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const inDialog = event.target instanceof Element && event.target.closest('[role="dialog"]') !== null;
      if (event.key === "Escape" && !inDialog) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const name = `${profile.firstName} ${profile.lastName}`;
  const arrival =
    profile.clubName === null ? undefined : profile.transfers.find((transfer) => transfer.toClubName === profile.clubName);
  const arrivalYear = arrival !== undefined ? arrival.date.getUTCFullYear() : profile.arrivedThisSeason ? startYear : null;
  const { seasonStats } = profile;

  return (
    <aside
      aria-label={t("sheetLabel", { name })}
      data-testid="player-sheet"
      className={cn(
        "@container fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col overflow-hidden border-l bg-card shadow-2xl",
        // Over the page under xl, where the sidebar leaves the list too little room beside it. Next to the list from xl,
        // the main column's margins, 32 px, under the top of the window and above its bottom; held by its top only (no
        // bottom left of inset-y-0): held by its bottom too, it would rise above its row to the top of its grid.
        "xl:sticky xl:top-8 xl:bottom-auto xl:z-auto xl:h-[calc(100dvh-4rem)] xl:rounded-card xl:border xl:shadow-none",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("close")}
        onClick={onClose}
        className={cn(
          "absolute top-[calc(1rem+env(safe-area-inset-top))] left-5 z-10 size-11 bg-background dark:hover:bg-secondary lg:top-2 lg:right-2 lg:left-auto lg:size-9",
          pinned && "xl:hidden",
        )}
        data-testid="player-sheet-close"
      >
        <ChevronLeftIcon className="size-5.5 lg:hidden" strokeWidth={2.5} />
        <XIcon className="max-lg:hidden" />
      </Button>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          className={cn(
            "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 bg-primary px-5 pb-5.5 text-primary-foreground @xs:grid-cols-[auto_minmax(0,1fr)_auto] @sm:gap-x-4",
            // A row of its own for the close button: on the left under lg, in the corner from there, over the rating otherwise.
            "pt-[calc(4.5rem+env(safe-area-inset-top))] max-xl:rounded-b-[1.75rem] lg:pt-12",
            pinned && "xl:pt-5",
          )}
        >
          <span
            aria-hidden
            className="grid size-18 place-items-center rounded-full border-3 border-(--club) bg-background font-heading text-[1.625rem] leading-none @sm:size-24 @sm:border-4 @sm:text-[2.125rem]"
          >
            {playerInitials(profile.firstName, profile.lastName)}
          </span>

          <div className="col-span-2 min-w-0 space-y-0.5 @xs:col-span-1">
            <p className="eyebrow wrap-break-word text-on-blue">{profile.clubName ?? t("noClub")}</p>
            <h2 className="text-xl leading-[1.1] font-bold wrap-break-word @sm:text-2xl" data-testid="player-sheet-name">
              {name}
            </h2>
            <p className="text-sm leading-snug text-on-blue">
              {tPositions(`label.${profile.position}`)} · {t("age", { age: profile.age })} ·{" "}
              {nationalityName(profile.nationality, tWorld)}
              {arrivalYear !== null && ` · ${t("arrivedIn", { year: arrivalYear })}`}
            </p>
          </div>

          {/* In a line beside the initials in a narrow column, in a column of its own otherwise. */}
          <div className="col-start-2 row-start-1 flex flex-wrap items-baseline justify-end gap-x-2 @xs:col-start-3 @xs:flex-col @xs:items-center @xs:gap-0">
            <p className="font-heading text-[3.5rem] leading-[0.9] tabular-nums" title={t("rating")}>
              {profile.overall}
            </p>
            <p className="font-heading text-[2rem] leading-none">{tPositions(`short.${profile.position}`)}</p>
            <p className="text-xs font-bold whitespace-nowrap text-on-blue tabular-nums @xs:mt-0.5" title={t("potential")}>
              {t("potentialShort", { potential: profile.potential })}
            </p>
          </div>

          <div className="col-span-full flex flex-wrap items-center gap-1 empty:hidden">
            <SecondaryPositionBadges playerKey={profile.playerKey} position={profile.position} className="rounded-sm bg-background p-0.5" />
            <PlayerBadges player={profile} onBlue />
          </div>
        </div>

        <div className="space-y-5 p-5 text-sm">
          <section aria-label={t("season", { season: seasonLabel(startYear) })} className="space-y-2" data-testid="player-sheet-season">
            <dl className="grid grid-cols-2 gap-2 @xs:grid-cols-4">
              <StatTile label={t("stats.appearances")} value={seasonStats.appearances} />
              <StatTile label={t("stats.goals")} value={seasonStats.goals} />
              <StatTile label={t("stats.assists")} value={seasonStats.assists} />
              <StatTile label={t("stats.minutes")} value={seasonStats.minutes} />
            </dl>
            <p className="text-xs text-muted-foreground tabular-nums">
              {t(profile.fitnessAtNextMatch ? "conditionNextMatch" : "condition", {
                form: profile.form,
                fitness: profile.fitness,
                yellow: seasonStats.yellowCards,
                red: seasonStats.redCards,
              })}
            </p>
          </section>

          <AttributeBars position={profile.position} attributes={profile.attributes} />

          <section aria-label={t("contract")} data-testid="player-sheet-contract" className="space-y-2 rounded-lg bg-background p-3.5">
            <dl className="space-y-1">
              {profile.contractUntil === null ? (
                <ContractLine label={t("contract")}>{t("noContract")}</ContractLine>
              ) : (
                <>
                  <ContractLine label={t("contractEnd")} warning={profile.contractExpiring}>
                    {formatDate(profile.contractUntil, locale)}
                  </ContractLine>
                  <ContractLine label={t("wage")}>{t("wagePerYear", { wage: formatMoney(profile.wage, locale) })}</ContractLine>
                </>
              )}
              <ContractLine label={t("marketValue")}>{formatMoney(profile.marketValue, locale)}</ContractLine>
            </dl>
            {profile.contractExpiring && <p className="text-xs text-warning">{t("leavingFree")}</p>}
          </section>

          {profile.transfers.length > 0 && (
            <section className="space-y-1.5" data-testid="player-sheet-transfers">
              <h3 className="eyebrow">{t("transfers")}</h3>
              <ol className="space-y-1.5 text-xs">
                {profile.transfers.map((transfer) => (
                  // The date on one line, above the move in a narrow column.
                  <li key={transfer.id} className="grid grid-cols-1 gap-x-2 @xs:grid-cols-[6.5rem_minmax(0,1fr)]">
                    <span className="text-muted-foreground tabular-nums">{formatDate(transfer.date, locale)}</span>
                    <span className="wrap-break-word">{transferLabel(transfer, t, locale)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t px-5 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{footer}</div>
    </aside>
  );
}
