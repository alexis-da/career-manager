"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { CHOSEN_COEFFICIENT } from "@/src/engine/balance";
import type { OptionalObjective } from "@/src/engine/objectives";
import { formatHundredths } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { isNewVersionError } from "@/app/_lib/new-version";
import { chooseObjectiveAction } from "../../actions";

/** An objective the board proposes, as the server names it. */
export type ObjectiveProposal = { kind: OptionalObjective; name: string; goal: string };

type ObjectiveChoiceFormProps = {
  saveId: string;
  proposals: readonly ObjectiveProposal[];
  assistant: OptionalObjective; // the assistant's choice without the player's: checked to begin with
  labelledBy: string; // the id of the title the proposals stand under
};

/**
 * The choice of the season's optional objective: the three proposals as radio cards, the assistant's marked and checked
 * to begin with, what it is worth and that it is final, then « Valider mon objectif », the screen's main action. Once the
 * choice is made, the page is read again and shows it locked; a refusal (the choice made meanwhile, in another tab) is
 * told, and the page read again shows where it stands.
 */
export function ObjectiveChoiceForm({ saveId, proposals, assistant, labelledBy }: ObjectiveChoiceFormProps) {
  const t = useTranslations("seasonStart.objectives");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [chosen, setChosen] = useState<OptionalObjective>(assistant);
  const [pending, startTransition] = useTransition();
  const assistantName = proposals.find((proposal) => proposal.kind === assistant)?.name;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await chooseObjectiveAction(saveId, chosen);
        if (result.ok) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
          router.refresh();
        }
      } catch (error) {
        toast.error(isNewVersionError(error) ? common("newVersion") : t("failed"));
      }
    });
  };

  return (
    <form onSubmit={submit} data-testid="objective-form" className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("choose")}</p>
      <fieldset aria-labelledby={labelledBy} disabled={pending} className="space-y-2.5">
        {proposals.map((proposal) => {
          const checked = proposal.kind === chosen;
          const byAssistant = proposal.kind === assistant;
          return (
            // Its border keeps its width when chosen, so that nothing moves.
            <label
              key={proposal.kind}
              data-testid="objective-choice"
              data-objective={proposal.kind}
              data-assistant={byAssistant || undefined}
              className={cn(
                "block cursor-pointer space-y-1 rounded-[1.125rem] border-2 bg-background p-3.5 transition-colors hover:bg-secondary has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                checked ? "border-(--club)" : "border-background hover:border-secondary",
              )}
            >
              <input
                type="radio"
                name="objective"
                value={proposal.kind}
                checked={checked}
                onChange={() => setChosen(proposal.kind)}
                className="sr-only"
              />
              <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className={cn("text-xs font-bold tracking-wider uppercase", checked ? "text-(--club)" : "text-highlight")}>
                  {proposal.name}
                </span>
                {byAssistant && (
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">
                    {t("assistantTag")}
                  </span>
                )}
              </span>
              <span className="block text-[0.9375rem] leading-snug font-semibold">{proposal.goal}</span>
            </label>
          );
        })}
      </fieldset>
      {assistantName !== undefined && (
        <p data-testid="objective-assistant-default" className="text-[0.8125rem] text-muted-foreground">
          {t("assistantDefault", { objective: assistantName })}
        </p>
      )}
      <p className="text-[0.8125rem] text-muted-foreground">
        {t("stakes", { bonus: formatHundredths(CHOSEN_COEFFICIENT.ACHIEVED / 100, locale) })}
      </p>
      <Button
        type="submit"
        variant="club"
        disabled={pending}
        aria-busy={pending}
        data-testid="objective-validate"
        className="h-12 w-full font-heading text-lg font-semibold"
      >
        {pending && <LoaderCircleIcon data-icon="inline-start" aria-hidden className="animate-spin" />}
        {pending ? t("validating") : t("validate")}
      </Button>
    </form>
  );
}
