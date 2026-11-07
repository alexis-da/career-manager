"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ClubInitials } from "@/src/components/club-initials";
import type { ClubSuggestion } from "@/src/engine/club-suggestions";
import { formatMillionsAmount } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

type SuggestionKind = ClubSuggestion["kind"];

/** The card's frame and its three columns: the club's initials, its level and name, its reputation and budget. */
function CardFrame({
  kind,
  checked,
  initials,
  name,
  figure,
  budget,
  children,
}: {
  kind: SuggestionKind;
  checked: boolean;
  initials: ReactNode;
  name: ReactNode;
  figure: ReactNode;
  budget: ReactNode;
  children?: ReactNode;
}) {
  const t = useTranslations("createSave.suggestions");
  return (
    <label
      data-testid={`club-suggestion-${kind}`}
      className={cn(
        "relative grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 rounded-[1.125rem] border-2 bg-card p-3.5 transition-colors hover:bg-secondary has-focus-visible:ring-3 has-focus-visible:ring-ring/50 lg:gap-4.5 lg:rounded-card lg:p-5",
        checked ? "border-(--club)" : "border-card hover:border-secondary",
      )}
    >
      {children}
      {initials}
      <span className="min-w-0 space-y-0.5 lg:space-y-1">
        <span className={cn("block text-xs font-bold tracking-wider uppercase lg:text-[0.8125rem]", checked ? "text-(--club)" : "text-highlight")}>
          {t(`${kind}.label`)}
        </span>
        <span className="block text-lg leading-tight font-bold wrap-break-word lg:text-[1.375rem]">{name}</span>
        <span className="block text-[0.8125rem] leading-snug text-muted-foreground lg:text-[0.9375rem]">{t(`${kind}.pitch`)}</span>
      </span>
      <span className="justify-self-end text-right">
        {figure}
        <span className="mt-1 ml-auto block w-min text-[0.6875rem] leading-tight text-muted-foreground tabular-nums sm:w-auto sm:whitespace-nowrap lg:text-xs">
          {budget}
        </span>
      </span>
    </label>
  );
}

const INITIALS = "size-13 rounded-[0.875rem] text-[1.375rem] lg:size-18 lg:rounded-[1.125rem] lg:text-3xl";

const FIGURE = "block font-heading text-[1.75rem] leading-none lg:text-[2.625rem]";

type SuggestionCardProps = {
  suggestion: ClubSuggestion;
  checked: boolean;
  onChoose: () => void;
};

/**
 * A club suggested to a new player, a radio button that picks the same club as the list under it: its level in figures, the
 * reputation, a club having no rating before a save draws its players. Its border keeps its width when chosen, so that nothing
 * moves.
 */
export function SuggestionCard({ suggestion, checked, onChoose }: SuggestionCardProps) {
  const t = useTranslations("createSave.suggestions");
  const locale = useLocale();
  // On a phone, under the figure and as narrow as it can be: « Budget », then the amount in one piece.
  const budget = t("budget", { amount: formatMillionsAmount(suggestion.budget, locale).replace(" ", " ") });
  return (
    <CardFrame
      kind={suggestion.kind}
      checked={checked}
      initials={
        <ClubInitials
          name={suggestion.name}
          managed={checked}
          className={cn(INITIALS, !checked && "bg-primary text-primary-foreground")}
        />
      }
      name={suggestion.name}
      figure={
        <>
          <span className="sr-only">{t("reputation", { reputation: suggestion.reputation })}</span>
          <span aria-hidden className={FIGURE}>
            {suggestion.reputation}
          </span>
        </>
      }
      budget={budget}
    >
      <input type="radio" name="clubSuggestion" className="sr-only" checked={checked} onChange={onChoose} />
    </CardFrame>
  );
}

/**
 * A suggestion's place while its club comes from the server (CreateSaveForm): its level and its goal already, the rest
 * kept by invisible lines of the same sizes, so that nothing moves when the club arrives. Chosen before, it is the one
 * chosen once its club has come.
 */
export function SuggestionCardPlaceholder({
  kind,
  checked,
  onChoose,
}: {
  kind: SuggestionKind;
  checked: boolean;
  onChoose: () => void;
}) {
  const t = useTranslations("createSave.suggestions");
  const locale = useLocale();
  // The budget's words and an amount of the usual width: it wraps as a club's does.
  const budget = t("budget", { amount: formatMillionsAmount(150_000_000, locale).replace(" ", " ") });
  return (
    <CardFrame
      kind={kind}
      checked={checked}
      initials={<span aria-hidden className={cn(INITIALS, "grid shrink-0 animate-pulse bg-secondary")} />}
      name={
        <span aria-hidden className="invisible">
          —
        </span>
      }
      figure={
        <span aria-hidden className={cn(FIGURE, "invisible")}>
          00
        </span>
      }
      budget={
        <span aria-hidden className="invisible">
          {budget}
        </span>
      }
    >
      <input type="radio" name="clubSuggestion" className="sr-only" checked={checked} onChange={onChoose} />
    </CardFrame>
  );
}
