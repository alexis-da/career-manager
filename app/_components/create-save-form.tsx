"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import type { CompetitionClubs } from "@/src/db/clubs";
import { createSaveAction, type CreateSaveFormState } from "../actions";

const INITIAL_STATE: CreateSaveFormState = {
  values: { name: "", managerName: "", clubId: "", seed: "" },
  errors: {},
  message: null,
};

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  children: ReactNode;
};

function Field({ id, label, hint, errors, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
      {errors?.map((error) => (
        <p key={error} id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ))}
    </div>
  );
}

export function CreateSaveForm({ competitions }: { competitions: CompetitionClubs[] }) {
  const [state, formAction, pending] = useActionState(createSaveAction, INITIAL_STATE);
  const [clubId, setClubId] = useState(INITIAL_STATE.values.clubId);
  const items = competitions.flatMap((competition) =>
    competition.clubs.map((club) => ({ value: club.id, label: club.name })),
  );
  // By country, then by division: the competitions come sorted that way.
  const countries = [...Map.groupBy(competitions, (competition) => competition.country)];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field id="save-name" label="Nom de la partie" errors={state.errors.name}>
        <Input
          id="save-name"
          name="name"
          maxLength={100}
          defaultValue={state.values.name}
          placeholder="Ma carrière"
          aria-invalid={state.errors.name !== undefined}
        />
      </Field>

      <Field id="manager-name" label="Manager" errors={state.errors.managerName}>
        <Input
          id="manager-name"
          name="managerName"
          maxLength={100}
          defaultValue={state.values.managerName}
          placeholder="Votre nom"
          aria-invalid={state.errors.managerName !== undefined}
        />
      </Field>

      <Field
        id="club"
        label="Club"
        hint="Prends un club de Division 2 et amène-le au sommet."
        errors={state.errors.clubId}
      >
        <Select
          items={items}
          value={clubId === "" ? null : clubId}
          onValueChange={(value) => setClubId(typeof value === "string" ? value : "")}
        >
          <SelectTrigger id="club" aria-labelledby="club-label" aria-invalid={state.errors.clubId !== undefined} className="w-full">
            <SelectValue placeholder="Choisir un club" />
          </SelectTrigger>
          <SelectContent>
            {countries.map(([country, divisions]) => (
              <SelectGroup key={country} aria-label={country}>
                <SelectLabel className="pt-3 text-sm font-semibold text-foreground">{country}</SelectLabel>
                {divisions.map((competition) => (
                  <SelectGroup key={competition.code} aria-label={competition.name}>
                    <SelectLabel>Division {competition.tier}</SelectLabel>
                    {competition.clubs.map((club) => (
                      <SelectItem key={club.id} value={club.id}>
                        {club.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="clubId" value={clubId} />
      </Field>

      <Field
        id="seed"
        label="Graine (facultative)"
        hint="Deux parties de même graine et même club se jouent à l'identique."
        errors={state.errors.seed}
      >
        <Input id="seed" name="seed" maxLength={200} defaultValue={state.values.seed} placeholder="Tirée au hasard si vide" />
      </Field>

      {state.message !== null && <p className="text-sm text-destructive">{state.message}</p>}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Création de la partie…" : "Créer la partie"}
      </Button>
    </form>
  );
}
