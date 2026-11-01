"use client";

import { nationalityName } from "../_lib/nationalities";
import { useLocale, useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { PlayerFace } from "@/src/components/player-face";
import { Button } from "@/src/components/ui/button";
import type { PlayerProfile, TransferHistoryItem } from "@/src/db/players";
import { seasonLabel } from "@/src/engine/world";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatDate, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

import { PositionBadges } from "./position-badge";
import { ratingClasses } from "../_lib/ratings";
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
    <div className="rounded-md border px-2.5 py-2">
      <dt className="text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
      <dd className="font-heading text-2xl leading-tight font-bold tabular-nums">{value}</dd>
    </div>
  );
}

type PlayerSheetProps = {
  profile: PlayerProfile;
  startYear: number;
  footer: ReactNode; // the actions, which depend on where the player plays
  onClose: () => void;
};

/** A player's sheet, in a 400 px side panel next to the list it was opened from. */
export function PlayerSheet({ profile, startYear, footer, onClose }: PlayerSheetProps) {
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
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col border-l bg-card shadow-2xl",
        // The main column's margins, 32 px, under the top of the window and above its bottom.
        "lg:sticky lg:top-8 lg:z-auto lg:h-[calc(100dvh-4rem)] lg:rounded-card lg:border lg:shadow-none",
      )}
    >
      <div className="space-y-3 p-5 pb-4">
        <div className="flex items-start gap-3">
          <PlayerFace
            playerKey={profile.playerKey}
            age={profile.age}
            clubColors={profile.clubColors}
            size={96}
            className="shrink-0"
          />
          <div className="flex-1" />
          <div className={cn("rounded-md px-3 py-1.5 text-center", ratingClasses(profile.overall))}>
            <p className="font-heading text-4xl leading-none font-bold tabular-nums" title={t("rating")}>
              {profile.overall}
            </p>
            <p className="mt-1 text-[0.625rem] font-semibold tracking-[0.12em] uppercase tabular-nums" title={t("potential")}>
              {t("potentialShort", { potential: profile.potential })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("close")}
            onClick={onClose}
            className="-mt-1 -mr-2"
            data-testid="player-sheet-close"
          >
            <XIcon />
          </Button>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="eyebrow truncate">{profile.clubName ?? t("noClub")}</p>
          <h2 className="font-heading text-3xl leading-none font-bold" data-testid="player-sheet-name">
            {name}
          </h2>
          <p className="text-sm text-muted-foreground">
            <PositionBadges playerKey={profile.playerKey} position={profile.position} className="mr-1.5 align-[1px]" />
            {tPositions(`label.${profile.position}`)} · {t("age", { age: profile.age })} ·{" "}
            {nationalityName(profile.nationality, tWorld)}
            {arrivalYear !== null && ` · ${t("arrivedIn", { year: arrivalYear })}`}
          </p>
          <p className="flex flex-wrap gap-1 pt-1">
            <PlayerBadges player={profile} />
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-5 text-sm">
        <AttributeBars position={profile.position} attributes={profile.attributes} />

        <section aria-label={t("season", { season: seasonLabel(startYear) })} className="space-y-2" data-testid="player-sheet-season">
          <dl className="grid grid-cols-4 gap-2">
            <StatTile label={t("stats.appearances")} value={seasonStats.appearances} />
            <StatTile label={t("stats.goals")} value={seasonStats.goals} />
            <StatTile label={t("stats.assists")} value={seasonStats.assists} />
            <StatTile label={t("stats.minutes")} value={seasonStats.minutes} />
          </dl>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("condition", {
              form: profile.form,
              morale: profile.morale,
              fitness: profile.fitness,
              yellow: seasonStats.yellowCards,
              red: seasonStats.redCards,
            })}
          </p>
        </section>

        <section
          aria-label={t("contract")}
          data-testid="player-sheet-contract"
          className={cn("space-y-1.5 rounded-md border p-3.5", profile.contractExpiring && "border-warning/30 bg-warning/5")}
        >
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 tabular-nums">
            <span className={cn("font-semibold", profile.contractExpiring && "text-warning")}>
              {profile.contractUntil === null
                ? t("noContract")
                : t("contractUntil", { date: formatDate(profile.contractUntil, locale) })}
            </span>
            {profile.contractUntil !== null && (
              <span className="text-muted-foreground">{t("wagePerYear", { wage: formatMoney(profile.wage, locale) })}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("marketValue", { value: formatMoney(profile.marketValue, locale) })}
            {profile.contractExpiring && ` ${t("leavingFree")}`}
          </p>
        </section>

        {profile.transfers.length > 0 && (
          <section className="space-y-1.5" data-testid="player-sheet-transfers">
            <h3 className="eyebrow">{t("transfers")}</h3>
            <ol className="space-y-1 text-xs">
              {profile.transfers.map((transfer) => (
                <li key={transfer.id} className="grid grid-cols-[5.5rem_1fr] gap-2">
                  <span className="text-muted-foreground tabular-nums">{formatDate(transfer.date, locale)}</span>
                  <span>{transferLabel(transfer, t, locale)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <div className="space-y-2 border-t p-5">{footer}</div>
    </aside>
  );
}
