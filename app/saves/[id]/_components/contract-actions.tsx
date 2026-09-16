"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import type { PlayerProfile } from "@/src/db/players";
import type { ContractTerms } from "@/src/db/transfers";
import { formatDate, formatMoney } from "@/src/lib/format";
import { refusalMessage } from "../_lib/refusal-message";
import { releasePlayerAction, renewContractAction, sellPlayerAction } from "../squad/actions";
import {
  ClosedWindowNote,
  DEFAULT_CONTRACT_LENGTH,
  DurationField,
  MoneyField,
  RefusalAlert,
  usePlayerAction,
} from "./contract-fields";

const fullName = (player: PlayerProfile): string => `${player.firstName} ${player.lastName}`;

type ActionProps = {
  saveId: string;
  player: PlayerProfile;
  terms: ContractTerms;
  disabled?: boolean;
  triggerClassName?: string;
};

export function RenewContractDialog({
  saveId,
  player,
  terms,
  currentDate,
  disabled = false,
  triggerClassName,
}: ActionProps & { currentDate: Date }) {
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState<number>(DEFAULT_CONTRACT_LENGTH);
  const [wage, setWage] = useState(String(terms.renewalMinimumWage));
  const { pending, refusal, clearRefusal, run } = usePlayerAction();
  const name = fullName(player);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setYears(DEFAULT_CONTRACT_LENGTH);
      setWage(String(terms.renewalMinimumWage));
      clearRefusal();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The main action on a player of the managed club: in the club accent. */}
      <DialogTrigger disabled={disabled} render={<Button variant="club" className={triggerClassName} />}>
        Prolonger
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prolonger {name}</DialogTitle>
          <DialogDescription>
            Il accepte au moins {formatMoney(terms.renewalMinimumWage)} par saison. Contrat actuel :{" "}
            {player.contractUntil === null ? "aucun" : `jusqu'au ${formatDate(player.contractUntil)}`}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <DurationField years={years} onChange={setYears} currentDate={currentDate} />
          <MoneyField
            id={`renewal-wage-${player.id}`}
            label="Salaire proposé, en euros par saison"
            value={wage}
            onChange={setWage}
            step={10_000}
            min={1}
          />
          <RefusalAlert message={refusal} />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                name,
                () => renewContractAction({ saveId, playerSaveId: player.id, wage: Number(wage), years }),
                () => setOpen(false),
              )
            }
          >
            {pending ? "Négociation…" : "Confirmer la prolongation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReleasePlayerDialog({ saveId, player, terms, disabled = false, triggerClassName }: ActionProps) {
  const [open, setOpen] = useState(false);
  const { pending, refusal, clearRefusal, run } = usePlayerAction();
  const name = fullName(player);

  const onOpenChange = (next: boolean) => {
    if (next) {
      clearRefusal();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger disabled={disabled} render={<Button variant="outline" className={triggerClassName} />}>
        Libérer
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Libérer {name}</DialogTitle>
          <DialogDescription>
            Il deviendra joueur libre. Coût : {formatMoney(terms.releaseCost)}, la moitié des salaires restant dus sur
            son contrat.
          </DialogDescription>
        </DialogHeader>
        <RefusalAlert message={refusal} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => run(name, () => releasePlayerAction({ saveId, playerSaveId: player.id }), () => setOpen(false))}
          >
            {pending ? "Libération…" : "Libérer le joueur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SellPlayerDialog({ saveId, player, terms, disabled = false, triggerClassName }: ActionProps) {
  const [open, setOpen] = useState(false);
  const { pending, refusal, clearRefusal, run } = usePlayerAction();
  const name = fullName(player);
  const { sale } = terms;

  const onOpenChange = (next: boolean) => {
    if (next) {
      clearRefusal();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger disabled={disabled} render={<Button variant="outline" className={triggerClassName} />}>
        Vendre
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vendre {name}</DialogTitle>
          <DialogDescription>
            {sale.ok
              ? `Meilleure offre : ${sale.buyerName} propose ${formatMoney(sale.fee)}. Le joueur y gagnera ${formatMoney(sale.wage)} par saison, pour ${sale.years} saison${sale.years > 1 ? "s" : ""}.`
              : refusalMessage(sale.reason)}
          </DialogDescription>
        </DialogHeader>
        <RefusalAlert message={refusal} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{sale.ok ? "Refuser" : "Fermer"}</DialogClose>
          {sale.ok && (
            <Button
              disabled={pending}
              onClick={() => run(name, () => sellPlayerAction({ saveId, playerSaveId: player.id }), () => setOpen(false))}
            >
              {pending ? "Transfert…" : "Accepter l'offre"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SquadPlayerActionsProps = {
  saveId: string;
  player: PlayerProfile;
  terms: ContractTerms;
  currentDate: Date;
  windowOpen: boolean;
  nextWindowOpensOn: Date;
};

/** Actions of the player sheet for a player of the managed club; disabled, with the reason, while the window is closed. */
export function SquadPlayerActions({ saveId, player, terms, currentDate, windowOpen, nextWindowOpensOn }: SquadPlayerActionsProps) {
  const disabled = !windowOpen;
  return (
    <>
      {disabled && <ClosedWindowNote actions="prolongations, ventes et libérations" reopensOn={nextWindowOpensOn} />}
      <RenewContractDialog
        saveId={saveId}
        player={player}
        terms={terms}
        currentDate={currentDate}
        disabled={disabled}
        triggerClassName="h-10 w-full font-heading text-base font-semibold"
      />
      <div className="grid grid-cols-2 gap-2">
        <SellPlayerDialog saveId={saveId} player={player} terms={terms} disabled={disabled} triggerClassName="h-10 w-full" />
        <ReleasePlayerDialog
          saveId={saveId}
          player={player}
          terms={terms}
          disabled={disabled}
          triggerClassName="h-10 w-full text-loss hover:text-loss"
        />
      </div>
    </>
  );
}
