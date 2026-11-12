"use client";

import { ChevronRightIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, type ReactNode } from "react";
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
import type { ClubSuggestion, SuggestionPreview } from "@/src/engine/club-suggestions";
import { cn } from "@/src/lib/utils";
import { createSaveAction, creationChoicesAction, type CreateSaveFormState } from "../actions";
import type { ClubChoice } from "../_lib/club-search";
import type { CreationChoices } from "../_lib/creation-choices";
import { HOME_COLUMNS } from "../_lib/home-columns";
import { isNewVersionError } from "../_lib/new-version";
import { ClubSearch } from "./club-search";
import { SuggestionCard, SuggestionCardPlaceholder } from "./suggestion-card";

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

/**
 * Whose form this is: a first visit's, whose title says what the game is (the page's h1), or the one under a player's
 * careers, titled by the choice it offers (h2).
 */
export type FormHeading = "landing" | "returning";

const TITLE_SIZE: Record<FormHeading, string> = {
  // Three lines at most on a phone: the button stays above the fold at 360 × 780.
  landing: "text-[1.75rem] leading-[0.95] sm:text-[2.5rem] lg:text-[3.25rem] lg:leading-[0.9] xl:text-[3.75rem]",
  returning: "text-[2.25rem] leading-[0.95] lg:text-[3.5rem]",
};

const OPTION_INPUT = "h-11 px-3.5 dark:bg-card";

/** A title's last word in orange. */
function Stressed({ text }: { text: string }) {
  const lastWord = text.lastIndexOf(" ") + 1;
  return (
    <>
      {text.slice(0, lastWord)}
      <span className="text-(--club)">{text.slice(lastWord)}</span>
    </>
  );
}

/**
 * The form's title and what the game holds. A first visit's says what the game is, its second part on a line of its own
 * from 1024 px; a returning player's, the choice of a club, on two lines.
 */
function FormHead({ heading, clubCount }: { heading: FormHeading; clubCount: number }) {
  const t = useTranslations("createSave");
  const landing = useTranslations("landing");
  return (
    <div className="space-y-2 lg:col-start-1 lg:row-start-1 lg:space-y-5">
      {heading === "landing" ? (
        <h1 className={cn("font-heading", TITLE_SIZE.landing)}>
          {landing("title.first")}{" "}
          <span className="lg:block">
            <Stressed text={landing("title.second")} />
          </span>
        </h1>
      ) : (
        <h2 className={cn("font-heading", TITLE_SIZE.returning)}>
          {t("title.first")} <br />
          <Stressed text={t("title.second")} />
        </h2>
      )}
      <p className="max-w-115 text-[0.9375rem] text-muted-foreground lg:text-[1.1875rem] lg:leading-[1.45]">
        {t("pitch", { count: clubCount })}
      </p>
    </div>
  );
}

/**
 * The form's button: busy while the save is created (some seconds for a world of 198 clubs), disabled so that a second
 * click never sends a second creation, and until the clubs have come, so that a career is never asked for without one.
 */
function CreateButton({ ready }: { ready: boolean }) {
  const t = useTranslations("createSave");
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="club"
      className="h-14.5 w-full rounded-[1rem] font-heading text-2xl lg:h-15.5 lg:w-auto lg:px-9 lg:text-[1.75rem]"
      disabled={pending || !ready}
      aria-busy={pending}
      data-creating={pending || undefined}
      data-testid="create-save"
    >
      {pending && <LoaderCircleIcon data-icon="inline-start" aria-hidden className="animate-spin" />}
      {pending ? t("pending") : t("submit")}
    </Button>
  );
}

/** Why the clubs did not come: a page of an earlier deployment, or anything else. */
type LoadError = "newVersion" | "failed";

type CreateSaveFormProps = {
  clubCount: number; // the clubs it offers, said before their names come
  // The suggestions in their order (suggestClubs), without their clubs: what their places show before the clubs come.
  previews: readonly SuggestionPreview[];
  heading?: FormHeading;
};

/**
 * The choice of a club. The clubs' names never are in a public page's HTML (CLAUDE.md, « Communication sortante »): the
 * browser asks for them once there (creationChoicesAction), their places kept until then by cards of the same size, the
 * button waiting for them.
 */
export function CreateSaveForm({ clubCount, previews, heading = "landing" }: CreateSaveFormProps) {
  const [choices, setChoices] = useState<CreationChoices | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  useEffect(() => {
    let current = true;
    creationChoicesAction().then(
      (loaded) => {
        if (current) {
          setChoices(loaded);
        }
      },
      (error: unknown) => {
        if (current) {
          setLoadError(isNewVersionError(error) ? "newVersion" : "failed");
        }
      },
    );
    return () => {
      current = false;
    };
  }, []);
  return <CreateSaveFormView clubCount={clubCount} previews={previews} heading={heading} choices={choices} loadError={loadError} />;
}

type CreateSaveFormViewProps = CreateSaveFormProps & {
  choices: CreationChoices | null; // null until they have come
  loadError?: LoadError | null;
};

/**
 * The form, with its clubs or waiting for them, in one screen: the title, the three suggestions, the manager's name and
 * the button, then the search and the whole list, then the options. On a phone in that order, the button above the fold;
 * from 1024 px on two columns, the title, the manager and the button on the left, the clubs on the right. The recommended
 * card is chosen from the start.
 */
export function CreateSaveFormView({ clubCount, previews, heading = "landing", choices, loadError = null }: CreateSaveFormViewProps) {
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
  const competitions = choices?.competitions ?? [];
  const suggestions = choices?.suggestions ?? [];
  const waiting = choices === null;
  // What the player chose: a club of the list or a card, else the recommended card. A card chosen before its club came
  // is the one chosen once it has.
  const [chosenClub, setChosenClub] = useState<string | null>(null);
  const [chosenKind, setChosenKind] = useState<ClubSuggestion["kind"]>("mid-table");
  const clubId = chosenClub ?? suggestions.find(({ kind }) => kind === chosenKind)?.clubId ?? "";
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
      className={cn(HOME_COLUMNS, "lg:items-start")}
      aria-busy={waiting && loadError === null}
      noValidate
    >
      <FormHead heading={heading} clubCount={clubCount} />

      <div className="min-w-0 space-y-3 lg:col-start-2 lg:row-start-1 lg:space-y-3.5">
        {/* A first visit's title is the game's: the choice it offers comes over the cards. */}
        {heading === "landing" && (
          <h2 className="font-heading text-xl leading-none lg:text-2xl" data-testid="create-save-choice">
            {t("title.first")} <Stressed text={t("title.second")} />
          </h2>
        )}
        <fieldset>
          <legend className="sr-only">{t("club")}</legend>
          <div className="space-y-3 lg:space-y-3.5">
            {waiting
              ? previews.map((preview) => (
                  <SuggestionCardPlaceholder
                    key={preview.kind}
                    preview={preview}
                    checked={chosenClub === null && preview.kind === chosenKind}
                    onChoose={() => setChosenKind(preview.kind)}
                  />
                ))
              : suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.kind}
                    suggestion={suggestion}
                    checked={clubId === suggestion.clubId}
                    onChoose={() => setChosenClub(suggestion.clubId)}
                  />
                ))}
          </div>
        </fieldset>
        {loadError !== null && (
          <p role="alert" className="text-sm text-destructive" data-testid="create-save-clubs-error">
            {loadError === "newVersion" ? common("newVersion") : t("loadFailed")}
          </p>
        )}
      </div>

      <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2 lg:max-w-105">
        {/* Filled in from the start, so that a career is one click away: the player types over it at will. Its default
            never changes once rendered, and a refused form keeps what was typed (onReset). */}
        <Field id="manager-name" label={t("manager")} errors={state.errors.managerName}>
          <Input
            id="manager-name"
            name="managerName"
            maxLength={100}
            defaultValue={t("managerDefault")}
            aria-invalid={state.errors.managerName !== undefined}
            className="h-12 px-4 md:text-base dark:bg-card"
            data-testid="manager-name"
          />
        </Field>

        {state.message !== null && (
          <p className="text-sm text-destructive" data-testid="create-save-message">
            {state.message}
          </p>
        )}

        <CreateButton ready={!waiting} />
      </div>

      {/* The search beside the whole list from 1024 px, its results under both. */}
      <div className="grid min-w-0 grid-cols-1 items-end gap-3 lg:col-start-2 lg:row-start-2 lg:grid-cols-2">
        <ClubSearch clubs={clubs} count={clubCount} disabled={waiting} onChoose={setChosenClub} />
        <Field id="club" label={t("browse", { count: clubCount })} errors={state.errors.clubId}>
          <Select
            items={clubs}
            value={clubId === "" ? null : clubId}
            onValueChange={(value) => setChosenClub(typeof value === "string" ? value : null)}
            disabled={waiting}
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
                    <SelectGroup key={competition.code} aria-label={world("league", { country, tier: competition.tier })}>
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

      <details className="group min-w-0 lg:col-start-1 lg:row-start-3 lg:max-w-105" open={optionsOpen}>
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
    </form>
  );
}
