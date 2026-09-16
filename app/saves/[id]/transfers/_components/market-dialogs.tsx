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
import { formatMoney } from "@/src/lib/format";
import {
  DEFAULT_CONTRACT_LENGTH,
  DurationField,
  MoneyField,
  RefusalAlert,
  usePlayerAction,
} from "../../_components/contract-fields";
import { makeTransferOfferAction, signFreeAgentAction } from "../actions";

type TriggerProps = {
  disabled?: boolean; // while the transfer window is closed
  primary?: boolean; // the main action of the player sheet, in the club accent; neutral in a table row
  triggerClassName?: string;
};

type SignFreeAgentDialogProps = TriggerProps & {
  saveId: string;
  player: { id: string; name: string };
  askedWage: number;
  wageRoom: number;
  currentDate: Date;
};

export function SignFreeAgentDialog({
  saveId,
  player,
  askedWage,
  wageRoom,
  currentDate,
  disabled = false,
  primary = false,
  triggerClassName,
}: SignFreeAgentDialogProps) {
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState<number>(DEFAULT_CONTRACT_LENGTH);
  const [wage, setWage] = useState(String(askedWage));
  const { pending, refusal, clearRefusal, run } = usePlayerAction();

  const onOpenChange = (next: boolean) => {
    if (next) {
      setYears(DEFAULT_CONTRACT_LENGTH);
      setWage(String(askedWage));
      clearRefusal();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        disabled={disabled}
        render={<Button variant={primary ? "club" : "outline"} size={primary ? "default" : "sm"} className={triggerClassName} />}
      >
        Signer
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signer {player.name}</DialogTitle>
          <DialogDescription>
            Joueur libre : aucune indemnité à verser. Il accepte au moins {formatMoney(askedWage)} par saison.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <DurationField years={years} onChange={setYears} currentDate={currentDate} />
          <MoneyField
            id={`signing-wage-${player.id}`}
            label="Salaire proposé, en euros par saison"
            value={wage}
            onChange={setWage}
            step={10_000}
            min={1}
            hint={`marge salariale ${formatMoney(Math.max(0, wageRoom))}`}
          />
          <RefusalAlert message={refusal} />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                player.name,
                () => signFreeAgentAction({ saveId, playerSaveId: player.id, wage: Number(wage), years }),
                () => setOpen(false),
              )
            }
          >
            {pending ? "Signature…" : "Confirmer la signature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MakeOfferDialogProps = TriggerProps & {
  saveId: string;
  player: { id: string; name: string };
  clubName: string;
  askingPrice: number;
  askedWage: number;
  budget: number;
  wageRoom: number;
  currentDate: Date;
};

export function MakeOfferDialog({
  saveId,
  player,
  clubName,
  askingPrice,
  askedWage,
  budget,
  wageRoom,
  currentDate,
  disabled = false,
  primary = false,
  triggerClassName,
}: MakeOfferDialogProps) {
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState<number>(DEFAULT_CONTRACT_LENGTH);
  const [fee, setFee] = useState(String(askingPrice));
  const [wage, setWage] = useState(String(askedWage));
  const { pending, refusal, clearRefusal, run } = usePlayerAction();

  const onOpenChange = (next: boolean) => {
    if (next) {
      setYears(DEFAULT_CONTRACT_LENGTH);
      setFee(String(askingPrice));
      setWage(String(askedWage));
      clearRefusal();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        disabled={disabled}
        render={<Button variant={primary ? "club" : "outline"} size={primary ? "default" : "sm"} className={triggerClassName} />}
      >
        Faire une offre
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Offre pour {player.name}</DialogTitle>
          <DialogDescription>
            {clubName} demande {formatMoney(askingPrice)} ; le joueur veut au moins {formatMoney(askedWage)} par saison.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <MoneyField
            id={`offer-fee-${player.id}`}
            label="Indemnité proposée, en euros"
            value={fee}
            onChange={setFee}
            step={100_000}
            min={0}
            hint={`budget ${formatMoney(budget)}`}
          />
          <MoneyField
            id={`offer-wage-${player.id}`}
            label="Salaire proposé, en euros par saison"
            value={wage}
            onChange={setWage}
            step={10_000}
            min={1}
            hint={`marge salariale ${formatMoney(Math.max(0, wageRoom))}`}
          />
          <DurationField years={years} onChange={setYears} currentDate={currentDate} />
          <RefusalAlert message={refusal} />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                player.name,
                () =>
                  makeTransferOfferAction({ saveId, playerSaveId: player.id, fee: Number(fee), wage: Number(wage), years }),
                () => setOpen(false),
              )
            }
          >
            {pending ? "Négociation…" : "Envoyer l'offre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
