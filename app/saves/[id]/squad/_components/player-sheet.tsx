"use client";

import { Badge } from "@/src/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/src/components/ui/sheet";
import type { SquadPlayerView, TransferHistoryItem } from "@/src/db/squad";
import type { AttributeName } from "@/src/engine/generation";
import { formatDate, formatMoney, formatShortDate } from "@/src/lib/format";
import { POSITION_LABEL } from "../_lib/positions";
import { ReleasePlayerDialog, RenewContractDialog, SellPlayerDialog } from "./contract-actions";

const ATTRIBUTES: { name: AttributeName; label: string }[] = [
  { name: "pace", label: "Vitesse" },
  { name: "shooting", label: "Tir" },
  { name: "passing", label: "Passe" },
  { name: "dribbling", label: "Dribble" },
  { name: "defending", label: "Défense" },
  { name: "physical", label: "Physique" },
  { name: "goalkeeping", label: "Gardien" },
];

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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function AttributeBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-2 rounded-full bg-muted" aria-hidden>
        <span className="block h-2 rounded-full bg-foreground/70" style={{ width: `${value}%` }} />
      </span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

type PlayerSheetProps = {
  saveId: string;
  player: SquadPlayerView | undefined;
  currentDate: Date;
  startYear: number;
  windowOpen: boolean;
  onClose: () => void;
};

export function PlayerSheet({ saveId, player, currentDate, startYear, windowOpen, onClose }: PlayerSheetProps) {
  return (
    <Sheet
      open={player !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-md">
        {player !== undefined && (
          <>
            <SheetHeader className="pr-12">
              <SheetTitle className="text-xl">
                {player.firstName} {player.lastName}
              </SheetTitle>
              <SheetDescription>
                {POSITION_LABEL[player.position]} · {player.age} ans · {player.nationality} · né le{" "}
                {formatDate(player.birthDate)}
              </SheetDescription>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {player.injuredUntil !== null && (
                  <Badge variant="destructive">Blessé jusqu&apos;au {formatShortDate(player.injuredUntil)}</Badge>
                )}
                {player.contractExpiring && <Badge variant="outline">Fin de contrat en fin de saison</Badge>}
                {player.arrivedThisSeason && <Badge variant="secondary">Jeune arrivé cette saison</Badge>}
              </div>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6 text-sm">
              <dl className="grid grid-cols-3 gap-2">
                <Stat label="Note" value={player.overall} />
                <Stat label="Potentiel" value={player.potential} />
                <Stat label="Forme" value={player.form} />
                <Stat label="Moral" value={player.morale} />
                <Stat label="Condition" value={player.fitness} />
                <Stat label="Valeur" value={formatMoney(player.marketValue)} />
              </dl>

              <section className="space-y-2">
                <h3 className="font-medium">Attributs</h3>
                {ATTRIBUTES.map((attribute) => (
                  <AttributeBar key={attribute.name} label={attribute.label} value={player.attributes[attribute.name]} />
                ))}
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">Contrat</h3>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
                  <dt className="text-muted-foreground">Salaire</dt>
                  <dd className="text-right">{formatMoney(player.wage)} par saison</dd>
                  <dt className="text-muted-foreground">Fin de contrat</dt>
                  <dd className="text-right">{player.contractUntil === null ? "—" : formatDate(player.contractUntil)}</dd>
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">
                  Saison {startYear}-{String(startYear + 1).slice(2)}
                </h3>
                <dl className="grid grid-cols-3 gap-2">
                  <Stat label="Matchs" value={player.seasonStats.appearances} />
                  <Stat label="Minutes" value={player.seasonStats.minutes} />
                  <Stat label="Buts" value={player.seasonStats.goals} />
                  <Stat label="Passes déc." value={player.seasonStats.assists} />
                  <Stat label="Cartons jaunes" value={player.seasonStats.yellowCards} />
                  <Stat label="Cartons rouges" value={player.seasonStats.redCards} />
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">Transferts</h3>
                {player.transfers.length === 0 ? (
                  <p className="text-muted-foreground">Aucun transfert.</p>
                ) : (
                  <ol className="space-y-1">
                    {player.transfers.map((transfer) => (
                      <li key={transfer.id} className="grid grid-cols-[6.5rem_1fr] gap-2">
                        <span className="tabular-nums text-muted-foreground">{formatDate(transfer.date)}</span>
                        <span>{transferLabel(transfer)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">Actions</h3>
                {!windowOpen && (
                  <p className="text-muted-foreground">
                    Le mercato est fermé : ces actions seront refusées jusqu&apos;à sa réouverture.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <RenewContractDialog saveId={saveId} player={player} currentDate={currentDate} />
                  <ReleasePlayerDialog saveId={saveId} player={player} />
                  <SellPlayerDialog saveId={saveId} player={player} />
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
