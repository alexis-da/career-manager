"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import type { SquadPlayerView, TransferHistoryItem } from "@/src/db/squad";
import type { AttributeName } from "@/src/engine/generation";
import { formatDate, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { POSITION_LABEL } from "../_lib/positions";
import { ratingClasses } from "../_lib/ratings";
import { ReleasePlayerDialog, RenewContractDialog, SellPlayerDialog } from "./contract-actions";
import { PlayerBadges } from "./player-badges";

const OUTFIELD_ATTRIBUTES: { name: AttributeName; label: string }[] = [
  { name: "pace", label: "Vitesse" },
  { name: "shooting", label: "Tir" },
  { name: "passing", label: "Passe" },
  { name: "dribbling", label: "Dribble" },
  { name: "defending", label: "Défense" },
  { name: "physical", label: "Physique" },
];

const GOALKEEPING: { name: AttributeName; label: string } = { name: "goalkeeping", label: "Gardien" };

/** Below this value an attribute bar is greyed: it is not a strength of the player. */
const WEAK_ATTRIBUTE = 40;

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

function AttributeBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[5rem_1fr_2rem] items-center gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-1.5 rounded-full bg-border" aria-hidden>
        <span
          className={cn("block h-1.5 rounded-full", value >= WEAK_ATTRIBUTE ? "bg-(--club)" : "bg-muted-foreground/50")}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="text-right font-semibold tabular-nums">{value}</span>
    </div>
  );
}

type PlayerSheetProps = {
  saveId: string;
  clubName: string;
  player: SquadPlayerView;
  currentDate: Date;
  startYear: number;
  windowOpen: boolean;
  onClose: () => void;
};

/** The selected player's sheet, in a 400 px side panel next to the squad table. */
export function PlayerSheet({ saveId, clubName, player, currentDate, startYear, windowOpen, onClose }: PlayerSheetProps) {
  const name = `${player.firstName} ${player.lastName}`;
  const attributes = player.position === "GK" ? [GOALKEEPING, ...OUTFIELD_ATTRIBUTES] : OUTFIELD_ATTRIBUTES;
  const arrival = player.transfers.find((transfer) => transfer.toClubName === clubName);
  const arrivalYear = arrival !== undefined ? arrival.date.getUTCFullYear() : player.arrivedThisSeason ? startYear : null;
  const { seasonStats } = player;

  return (
    <aside
      aria-label={`Fiche de ${name}`}
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col border-l bg-card shadow-2xl",
        "lg:sticky lg:top-20 lg:z-auto lg:h-[calc(100dvh-6.5rem)] lg:rounded-lg lg:border lg:shadow-none",
      )}
    >
      <div className="flex items-start gap-3 p-5 pb-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-heading text-3xl leading-none font-bold">{name}</h2>
          <p className="text-sm text-muted-foreground">
            {POSITION_LABEL[player.position]} · {player.age} ans · {player.nationality}
            {arrivalYear !== null && ` · Arrivé en ${arrivalYear}`}
          </p>
          <p className="flex flex-wrap gap-1 pt-1">
            <PlayerBadges player={player} />
          </p>
        </div>
        <div className={cn("rounded-md px-3 py-1.5 text-center", ratingClasses(player.overall))}>
          <p className="font-heading text-4xl leading-none font-bold tabular-nums" title="Note">
            {player.overall}
          </p>
          <p className="mt-1 text-[0.625rem] font-semibold tracking-[0.12em] uppercase tabular-nums" title="Potentiel">
            Pot. {player.potential}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Fermer la fiche" onClick={onClose} className="-mt-1 -mr-2">
          <XIcon />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-5 text-sm">
        <section aria-label="Attributs" className="space-y-2.5">
          {attributes.map((attribute) => (
            <AttributeBar key={attribute.name} label={attribute.label} value={player.attributes[attribute.name]} />
          ))}
        </section>

        <section aria-label={`Saison ${startYear}-${String(startYear + 1).slice(2)}`} className="space-y-2">
          <dl className="grid grid-cols-4 gap-2">
            <StatTile label="Matchs" value={seasonStats.appearances} />
            <StatTile label="Buts" value={seasonStats.goals} />
            <StatTile label="Passes D." value={seasonStats.assists} />
            <StatTile label="Minutes" value={seasonStats.minutes} />
          </dl>
          <p className="text-xs text-muted-foreground tabular-nums">
            Forme {player.form} · Moral {player.morale} · Condition {player.fitness} · Cartons {seasonStats.yellowCards} J,{" "}
            {seasonStats.redCards} R
          </p>
        </section>

        <section
          aria-label="Contrat"
          className={cn("space-y-1.5 rounded-md border p-3.5", player.contractExpiring && "border-warning/30 bg-warning/5")}
        >
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 tabular-nums">
            <span className={cn("font-semibold", player.contractExpiring && "text-warning")}>
              {player.contractUntil === null ? "Sans contrat" : `Contrat jusqu'au ${formatDate(player.contractUntil)}`}
            </span>
            <span className="text-muted-foreground">{formatMoney(player.wage)} / an</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Valeur marchande {formatMoney(player.marketValue)}.
            {player.contractExpiring && " Sans prolongation, il partira libre en fin de saison."}
          </p>
        </section>

        {player.transfers.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="eyebrow">Transferts</h3>
            <ol className="space-y-1 text-xs">
              {player.transfers.map((transfer) => (
                <li key={transfer.id} className="grid grid-cols-[5.5rem_1fr] gap-2">
                  <span className="text-muted-foreground tabular-nums">{formatDate(transfer.date)}</span>
                  <span>{transferLabel(transfer)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <div className="space-y-2 border-t p-5">
        {!windowOpen && (
          <p className="text-xs text-muted-foreground">Mercato fermé : ces actions seront refusées jusqu&apos;à sa réouverture.</p>
        )}
        <RenewContractDialog
          saveId={saveId}
          player={player}
          currentDate={currentDate}
          triggerClassName="h-10 w-full font-heading text-base font-semibold"
        />
        <div className="grid grid-cols-2 gap-2">
          <SellPlayerDialog saveId={saveId} player={player} triggerClassName="h-10 w-full" />
          <ReleasePlayerDialog saveId={saveId} player={player} triggerClassName="h-10 w-full text-loss hover:text-loss" />
        </div>
      </div>
    </aside>
  );
}
