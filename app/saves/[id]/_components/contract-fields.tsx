"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { contractEndDate } from "@/src/engine/economy";
import { formatDate, formatMoney } from "@/src/lib/format";
import type { ActionResult } from "../_lib/action-result";

export const CONTRACT_LENGTHS = [1, 2, 3, 4, 5] as const;
export const DEFAULT_CONTRACT_LENGTH = 3;

/**
 * Runs an action on a player. A success closes the dialog with a toast; a refusal stays in the dialog, next to
 * the figures to change: the explanation of the refusal, never a generic failure.
 */
export function usePlayerAction() {
  const [pending, startTransition] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);

  const run = (label: string, action: () => Promise<ActionResult>, onSuccess: () => void) => {
    setRefusal(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(`${label} : ${result.message}`);
          onSuccess();
        } else {
          setRefusal(result.message);
        }
      } catch {
        setRefusal("Le serveur n'a pas pu traiter la demande. Réessayez.");
      }
    });
  };

  return { pending, refusal, clearRefusal: () => setRefusal(null), run };
}

type DurationFieldProps = {
  years: number;
  onChange: (years: number) => void;
  currentDate: Date;
};

/** Contract length, from 1 to 5 seasons, with the end date it gives. */
export function DurationField({ years, onChange, currentDate }: DurationFieldProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Durée</legend>
      <div className="flex flex-wrap gap-1">
        {CONTRACT_LENGTHS.map((length) => (
          <Button
            key={length}
            type="button"
            size="sm"
            variant={length === years ? "default" : "outline"}
            aria-pressed={length === years}
            onClick={() => onChange(length)}
          >
            {length} saison{length > 1 ? "s" : ""}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Jusqu&apos;au {formatDate(contractEndDate(currentDate, years))}</p>
    </fieldset>
  );
}

type MoneyFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  min: number;
  hint?: string;
};

/** An amount in euros, typed in full and read back in M€ or k€. */
export function MoneyField({ id, label, value, onChange, step, min, hint }: MoneyFieldProps) {
  const amount = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(amount) && amount >= min;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!valid}
        className="tabular-nums"
      />
      <p className="text-xs text-muted-foreground tabular-nums">
        {valid ? formatMoney(amount) : "Montant invalide"}
        {hint !== undefined && ` · ${hint}`}
      </p>
    </div>
  );
}

/** Why the last attempt was refused, kept in the dialog. */
export function RefusalAlert({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }
  return (
    <p role="alert" className="rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
      {message}
    </p>
  );
}

/** Why the actions below are disabled: the transfer window is closed until a date. */
export function ClosedWindowNote({ actions, reopensOn }: { actions: string; reopensOn: Date }) {
  return (
    <p className="text-xs text-warning">
      Mercato fermé : {actions} reprendront le {formatDate(reopensOn)}.
    </p>
  );
}
