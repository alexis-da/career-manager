"use client";

import { ChevronRightIcon, LoaderCircleIcon } from "lucide-react";
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
import type { ClubSuggestion } from "@/src/engine/club-suggestions";
import { cn } from "@/src/lib/utils";
import { createSaveAction, type CreateSaveFormState } from "../actions";
import type { ClubChoice } from "../_lib/club-search";
import { HOME_COLUMNS } from "../_lib/home-columns";
import { isNewVersionError } from "../_lib/new-version";
import { ClubSearch } from "./club-search";
import { SuggestionCard } from "./suggestion-card";

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
    <div className="flex min-w-0 flex-col gap-1.5">
      <label id={`${id}-label`} htmlFor={id} className="text-[0.8125rem] text-muted-foreground lg:text-sm">
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

type TitleLevel = "h1" | "h2";

const TITLE_SIZE: Record<TitleLevel, string> = {
  h1: "text-[2.75rem] leading-[0.95] lg:text-[5rem] lg:leading-[0.88] xl:text-[5.75rem]",
  h2: "text-[2.25rem] leading-[0.95] lg:text-[3.5rem]",
};

const OPTION_INPUT = "h-11 px-3.5 dark:bg-card";

/** The form's title on two lines, its last word in orange, and what the game holds. */
function FormHead({ level: Heading, clubCount }: { level: TitleLevel; clubCount: number }) {
  const t = useTranslations("createSave");
  const second = t("title.second");
  const lastWord = second.lastIndexOf(" ") + 1;
  return (
    <div className="space-y-2 lg:col-start-1 lg:row-start-1 lg:space-y-5">
      <Heading className={cn("font-heading", TITLE_SIZE[Heading])}>
        {t("title.first")} <br />
        {second.slice(0, lastWord)}
        <span className="text-(--club)">{second.slice(lastWord)}</span>
      </Heading>
      <p className="max-w-115 text-[0.9375rem] text-muted-foreground lg:text-[1.1875rem] lg:leading-[1.45]">
        {t("pitch", { count: clubCount })}
      </p>
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
      variant="club"
      className="h-14.5 w-full rounded-[1rem] font-heading text-2xl lg:h-15.5 lg:w-auto lg:px-9 lg:text-[1.75rem]"
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

type CreateSaveFormProps = {
  competitions: CreatableCompetition[];
  suggestions: ClubSuggestion[];
  titleLevel?: TitleLevel; // h2 under the list of a player's careers
};

/**
 * The choice of a club: the title, then, in a second column from 1024 px, the three suggestions, the search and the whole
 * list, and the manager's name and the button. The recommended card is chosen from the start.
 */
export function CreateSaveForm({ competitions, suggestions, titleLevel = "h1" }: CreateSaveFormProps) {
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
  // What the player chose: until then the recommended card, which changes with the language.
  const [chosenClub, setChosenClub] = useState<string | null>(null);
  const clubId = chosenClub ?? suggestions.find(({ kind }) => kind === "mid-table")?.clubId ?? "";
  // What the player typed as the save's name: until then, the name comes from the club.
  const [typedName, setTypedName] = useState<string | null>(null);
  const clubs: ClubChoice[] = competitions.flatMap((competition) =>
    competition.clubs.map((club) => ({
      value: club.id,
      label: club.name,
      competition: world("league", { country: competition.countryName, tier: competition.tier }),
    })),
  );
  const clubName = clubs.find((club) => club.value === clubId)?.label;
  const name = typedName ?? (clubName === undefined ? "" : t("defaultName", { club: clubName }));
  // By country, then by division: the competitions come sorted that way.
  const countries = [...Map.groupBy(competitions, (competition) => competition.countryName)];
  const chosenOutsideCards = clubId !== "" && !suggestions.some((suggestion) => suggestion.clubId === clubId);
  // Folded: a new player has no use for them. Opened by a refused value, so that its error shows; without a club, a name is
  // refused because of it, and comes with it.
  const optionsOpen = state.errors.seed !== undefined || (state.errors.name !== undefined && clubId !== "");

  return (
    // React resets a form after its action: a refused one keeps what the player chose and typed, radio buttons included.
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className={cn(HOME_COLUMNS, "lg:grid-rows-[auto_1fr]")}
      noValidate
    >
      <FormHead level={titleLevel} clubCount={clubs.length} />

      <div className="min-w-0 space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:space-y-3.5">
        <fieldset>
          <legend className="sr-only">{t("club")}</legend>
          <div className="space-y-3 lg:space-y-3.5">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.kind}
                suggestion={suggestion}
                checked={clubId === suggestion.clubId}
                onChoose={() => setChosenClub(suggestion.clubId)}
              />
            ))}
          </div>
        </fieldset>

        {/* The search beside the whole list from 1024 px, its results under both. */}
        <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-2">
          <ClubSearch clubs={clubs} onChoose={setChosenClub} />
          <Field id="club" label={t("browse", { count: clubs.length })} errors={state.errors.clubId}>
            <Select
              items={clubs}
              value={clubId === "" ? null : clubId}
              onValueChange={(value) => setChosenClub(typeof value === "string" ? value : null)}
            >
              <SelectTrigger
                id="club"
                aria-labelledby="club-label"
                aria-invalid={state.errors.clubId !== undefined}
                className={cn(
                  "w-full px-3.5 data-[size=default]:h-12 dark:bg-transparent",
                  chosenOutsideCards && "border-(--club) ring-1 ring-(--club)",
                )}
                data-testid="club"
              >
                <SelectValue placeholder={t("clubPlaceholder")} />
              </SelectTrigger>
              <SelectContent className="min-w-72">
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
        </div>
      </div>

      <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2 lg:max-w-105">
        <Field id="manager-name" label={t("manager")} errors={state.errors.managerName}>
          <Input
            id="manager-name"
            name="managerName"
            maxLength={100}
            aria-invalid={state.errors.managerName !== undefined}
            className="h-12 px-4 md:text-base dark:bg-card"
            data-testid="manager-name"
          />
        </Field>

        <details className="group" open={optionsOpen}>
          <summary
            className="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground max-sm:min-h-11 [&::-webkit-details-marker]:hidden"
            data-testid="create-save-options"
          >
            <ChevronRightIcon aria-hidden className="size-4 transition-transform group-open:rotate-90" />
            {t("options")}
          </summary>
          <div className="space-y-4 pt-2">
            <Field id="save-name" label={t("name")} errors={state.errors.name}>
              <Input
                id="save-name"
                name="name"
                maxLength={100}
                value={name}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder={t("namePlaceholder")}
                aria-invalid={state.errors.name !== undefined}
                className={OPTION_INPUT}
                data-testid="save-name"
              />
            </Field>
            <Field id="seed" label={t("seed")} hint={t("seedHint")} errors={state.errors.seed}>
              <Input
                id="seed"
                name="seed"
                maxLength={200}
                placeholder={t("seedPlaceholder")}
                className={OPTION_INPUT}
                data-testid="seed"
              />
            </Field>
          </div>
        </details>

        {state.message !== null && (
          <p className="text-sm text-destructive" data-testid="create-save-message">
            {state.message}
          </p>
        )}

        <CreateButton />
      </div>
    </form>
  );
}
