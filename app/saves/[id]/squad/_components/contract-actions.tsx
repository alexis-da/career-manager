"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Input } from "@/src/components/ui/input";
import type { SquadPlayerView } from "@/src/db/squad";
import { contractEndDate } from "@/src/engine/economy";
import { formatDate, formatMoney } from "@/src/lib/format";
import { refusalMessage } from "../_lib/refusal-message";
import {
  releasePlayerAction,
  renewContractAction,
  sellPlayerAction,
  type SquadActionResult,
} from "../actions";

const CONTRACT_LENGTHS = [1, 2, 3, 4, 5] as const;
const DEFAULT_CONTRACT_LENGTH = 3;

const fullName = (player: SquadPlayerView): string => `${player.firstName} ${player.lastName}`;

/** Runs a squad action and shows its message: the explanation of a refusal, never a generic failure. */
function useSquadAction() {
  const [pending, startTransition] = useTransition();
  const run = (label: string, action: () => Promise<SquadActionResult>, onSuccess: () => void) =>
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(`${label} : ${result.message}`);
          onSuccess();
        } else {
          toast.error(`${label} : ${result.message}`);
        }
      } catch {
        toast.error(`${label} : le serveur n'a pas pu traiter la demande. Réessayez.`);
      }
    });
  return { pending, run };
}

type ActionProps = {
  saveId: string;
  player: SquadPlayerView;
};

export function RenewContractDialog({ saveId, player, currentDate }: ActionProps & { currentDate: Date }) {
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState<number>(DEFAULT_CONTRACT_LENGTH);
  const [wage, setWage] = useState(String(player.terms.renewalMinimumWage));
  const { pending, run } = useSquadAction();
  const name = fullName(player);
  const offeredWage = Number(wage);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setYears(DEFAULT_CONTRACT_LENGTH);
      setWage(String(player.terms.renewalMinimumWage));
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="club" />}>Prolonger</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prolonger {name}</DialogTitle>
          <DialogDescription>
            Il accepte au moins {formatMoney(player.terms.renewalMinimumWage)} par saison. Contrat actuel :{" "}
            {player.contractUntil === null ? "aucun" : `jusqu'au ${formatDate(player.contractUntil)}`}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Durée</legend>
            <div className="flex flex-wrap gap-1">
              {CONTRACT_LENGTHS.map((length) => (
                <Button
                  key={length}
                  type="button"
                  size="sm"
                  variant={length === years ? "club" : "outline"}
                  aria-pressed={length === years}
                  onClick={() => setYears(length)}
                >
                  {length} saison{length > 1 ? "s" : ""}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Jusqu&apos;au {formatDate(contractEndDate(currentDate, years))}</p>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor={`renewal-wage-${player.id}`} className="text-sm font-medium">
              Salaire proposé, en euros par saison
            </label>
            <Input
              id={`renewal-wage-${player.id}`}
              type="number"
              inputMode="numeric"
              min={1}
              step={10_000}
              value={wage}
              onChange={(event) => setWage(event.target.value)}
              className="tabular-nums"
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              {Number.isFinite(offeredWage) && offeredWage > 0 ? formatMoney(offeredWage) : "Montant invalide"}
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
          <Button
            variant="club"
            disabled={pending}
            onClick={() =>
              run(
                name,
                () => renewContractAction({ saveId, playerSaveId: player.id, wage: offeredWage, years }),
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

export function ReleasePlayerDialog({ saveId, player }: ActionProps) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useSquadAction();
  const name = fullName(player);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Libérer</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Libérer {name}</DialogTitle>
          <DialogDescription>
            Il deviendra joueur libre. Coût : {formatMoney(player.terms.releaseCost)}, la moitié des salaires restant dus
            sur son contrat.
          </DialogDescription>
        </DialogHeader>
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

export function SellPlayerDialog({ saveId, player }: ActionProps) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useSquadAction();
  const name = fullName(player);
  const { sale } = player.terms;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Vendre</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vendre {name}</DialogTitle>
          <DialogDescription>
            {sale.ok
              ? `Meilleure offre : ${sale.buyerName} propose ${formatMoney(sale.fee)}. Le joueur y gagnera ${formatMoney(sale.wage)} par saison, pour ${sale.years} saison${sale.years > 1 ? "s" : ""}.`
              : refusalMessage(sale.reason)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{sale.ok ? "Refuser" : "Fermer"}</DialogClose>
          {sale.ok && (
            <Button
              variant="club"
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
