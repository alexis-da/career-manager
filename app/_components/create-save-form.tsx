"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
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
import { isNewVersionError } from "../_lib/new-version";

/** A competition of the form, its country named in the player's language (app/page.tsx). */
export type CreatableCompetition = CompetitionClubs & { countryName: string };

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

/**
 * The form's button: busy while the save is created (some seconds for a world of 198 clubs), disabled so that a second
 * click never sends a second creation.
 */
function CreateButton() {
  const t = useTranslations("createSave");
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
      data-creating={pending || undefined}
      data-testid="create-save"
    >
      {pending && <LoaderCircleIcon data-icon="inline-start" aria-hidden className="animate-spin" />}
      {pending ? t("pending") : t("submit")}
    </Button>
  );
}

export function CreateSaveForm({ competitions }: { competitions: CreatableCompetition[] }) {
  const t = useTranslations("createSave");
  const common = useTranslations("common");
  const world = useTranslations("world");
  const [state, formAction] = useActionState(async (previous: CreateSaveFormState, formData: FormData) => {
    try {
      return await createSaveAction(previous, formData);
    } catch (error) {
      // The page comes from an earlier deployment: its action is gone from the server, a reload fixes it.
      if (isNewVersionError(error)) {
        return { ...previous, message: common("newVersion") };
      }
      throw error;
    }
  }, INITIAL_STATE);
  const [clubId, setClubId] = useState(INITIAL_STATE.values.clubId);
  const items = competitions.flatMap((competition) =>
    competition.clubs.map((club) => ({ value: club.id, label: club.name })),
  );
  // By country, then by division: the competitions come sorted that way.
  const countries = [...Map.groupBy(competitions, (competition) => competition.countryName)];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field id="save-name" label={t("name")} errors={state.errors.name}>
        <Input
          id="save-name"
          name="name"
          maxLength={100}
          defaultValue={state.values.name}
          placeholder={t("namePlaceholder")}
          aria-invalid={state.errors.name !== undefined}
          data-testid="save-name"
        />
      </Field>

      <Field id="manager-name" label={t("manager")} errors={state.errors.managerName}>
        <Input
          id="manager-name"
          name="managerName"
          maxLength={100}
          defaultValue={state.values.managerName}
          placeholder={t("managerPlaceholder")}
          aria-invalid={state.errors.managerName !== undefined}
          data-testid="manager-name"
        />
      </Field>

      <Field id="club" label={t("club")} hint={t("clubHint")} errors={state.errors.clubId}>
        <Select
          items={items}
          value={clubId === "" ? null : clubId}
          onValueChange={(value) => setClubId(typeof value === "string" ? value : "")}
        >
          <SelectTrigger
            id="club"
            aria-labelledby="club-label"
            aria-invalid={state.errors.clubId !== undefined}
            className="w-full"
            data-testid="club"
          >
            <SelectValue placeholder={t("clubPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {countries.map(([country, divisions]) => (
              <SelectGroup key={country} aria-label={country}>
                <SelectLabel className="pt-3 text-sm font-semibold text-foreground">{country}</SelectLabel>
                {divisions.map((competition) => (
                  <SelectGroup
                    key={competition.code}
                    aria-label={world("league", { country, tier: competition.tier })}
                  >
                    <SelectLabel>{t("division", { tier: competition.tier })}</SelectLabel>
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

      <Field id="seed" label={t("seed")} hint={t("seedHint")} errors={state.errors.seed}>
        <Input
          id="seed"
          name="seed"
          maxLength={200}
          defaultValue={state.values.seed}
          placeholder={t("seedPlaceholder")}
          data-testid="seed"
        />
      </Field>

      {state.message !== null && (
        <p className="text-sm text-destructive" data-testid="create-save-message">
          {state.message}
        </p>
      )}

      <CreateButton />
    </form>
  );
}
