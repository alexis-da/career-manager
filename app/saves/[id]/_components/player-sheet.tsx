"use client";

import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { PlayerFace } from "@/src/components/player-face";
import { Button } from "@/src/components/ui/button";
import type { PlayerProfile, TransferHistoryItem } from "@/src/db/players";
import { seasonLabel } from "@/src/engine/world";
import { formatDate, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

import { PositionBadges } from "./position-badge";
import { ratingClasses } from "../_lib/ratings";
import { AttributeBars } from "./attribute-bars";
import { PlayerBadges } from "./player-badges";

function transferLabel(transfer: TransferHistoryItem): string {
  switch (transfer.type) {
    case "TRANSFER":
      return `Transfert : ${transfer.fromClubName ?? "?"} → ${transfer.toClubName ?? "?"}, ${formatMoney(transfer.fee)}`;
    case "LOAN":
      return `Prêt : ${transfer.fromClubName ?? "?"} → ${transfer.toClubName ?? "?"}`;
    case "FREE":
      return transfer.toClubName === null
        ? `Libéré par ${transfer.fromClubName ?? "son club"}`
        : `Signe libre à ${transfer.toClubName}`;
    case "RETIREMENT":
      return "Fin de carrière";
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
  const tPositions = useTranslations("positions");
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
      aria-label={`Fiche de ${name}`}
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col border-l bg-card shadow-2xl",
        // Under the save's header (96 px: its row and its tabs), 24 px below it and above the window's bottom.
        "lg:sticky lg:top-30 lg:z-auto lg:h-[calc(100dvh-9rem)] lg:rounded-lg lg:border lg:shadow-none",
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
            <p className="font-heading text-4xl leading-none font-bold tabular-nums" title="Note">
              {profile.overall}
            </p>
            <p className="mt-1 text-[0.625rem] font-semibold tracking-[0.12em] uppercase tabular-nums" title="Potentiel">
              Pot. {profile.potential}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Fermer la fiche" onClick={onClose} className="-mt-1 -mr-2">
            <XIcon />
          </Button>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="eyebrow truncate">{profile.clubName ?? "Sans club"}</p>
          <h2 className="font-heading text-3xl leading-none font-bold">{name}</h2>
          <p className="text-sm text-muted-foreground">
            <PositionBadges playerKey={profile.playerKey} position={profile.position} className="mr-1.5 align-[1px]" />
            {tPositions(`label.${profile.position}`)} · {profile.age} ans · {profile.nationality}
            {arrivalYear !== null && ` · Arrivé en ${arrivalYear}`}
          </p>
          <p className="flex flex-wrap gap-1 pt-1">
            <PlayerBadges player={profile} />
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-5 text-sm">
        <AttributeBars position={profile.position} attributes={profile.attributes} />

        <section aria-label={`Saison ${seasonLabel(startYear)}`} className="space-y-2">
          <dl className="grid grid-cols-4 gap-2">
            <StatTile label="Matchs" value={seasonStats.appearances} />
            <StatTile label="Buts" value={seasonStats.goals} />
            <StatTile label="Passes D." value={seasonStats.assists} />
            <StatTile label="Minutes" value={seasonStats.minutes} />
          </dl>
          <p className="text-xs text-muted-foreground tabular-nums">
            Forme {profile.form} · Moral {profile.morale} · Condition {profile.fitness} · Cartons {seasonStats.yellowCards} J,{" "}
            {seasonStats.redCards} R
          </p>
        </section>

        <section
          aria-label="Contrat"
          className={cn("space-y-1.5 rounded-md border p-3.5", profile.contractExpiring && "border-warning/30 bg-warning/5")}
        >
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 tabular-nums">
            <span className={cn("font-semibold", profile.contractExpiring && "text-warning")}>
              {profile.contractUntil === null ? "Sans contrat" : `Contrat jusqu'au ${formatDate(profile.contractUntil)}`}
            </span>
            {profile.contractUntil !== null && <span className="text-muted-foreground">{formatMoney(profile.wage)} / an</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            Valeur marchande {formatMoney(profile.marketValue)}.
            {profile.contractExpiring && " Sans prolongation, il partira libre en fin de saison."}
          </p>
        </section>

        {profile.transfers.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="eyebrow">Transferts</h3>
            <ol className="space-y-1 text-xs">
              {profile.transfers.map((transfer) => (
                <li key={transfer.id} className="grid grid-cols-[5.5rem_1fr] gap-2">
                  <span className="text-muted-foreground tabular-nums">{formatDate(transfer.date)}</span>
                  <span>{transferLabel(transfer)}</span>
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
