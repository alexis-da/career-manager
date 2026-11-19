"use client";

import { MessageCircleMoreIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { TutorialStepKey } from "@/src/lib/tutorial";
import { cn } from "@/src/lib/utils";
import { skipTutorialAction } from "../../tutorial/actions";
import { TUTORIAL_LINK, type DayOnePlace } from "./tutorial-bubble";

type TutorialLineProps = {
  text: string;
  place?: DayOnePlace | null;
  // « Passer le tutoriel » from the line: the save and the step it was shown at; the card's own once skipped.
  skip?: { saveId: string; step: TutorialStepKey; onSkipped: () => void };
  className?: string;
};

/**
 * The assistant's line inside a card (docs/design/tutoriel.md § 0.2): in a modal sheet (a choice event's card, a break's,
 * the Coaching panel) and in the « À demain » card, never a bubble over them. Within the sheet's focus trap, with the
 * card's own ways on; « Passer le tutoriel » quiet, never orange.
 */
export function TutorialLine({ text, place = null, skip, className }: TutorialLineProps) {
  const t = useTranslations("tutorial");
  const onSkip =
    skip === undefined
      ? undefined
      : () => {
          skip.onSkipped();
          void skipTutorialAction(skip.saveId, skip.step).then(
            () => toast(t("skipped")),
            (error: unknown) => console.warn("[tutorial] not skipped", error),
          );
        };
  return (
    <div data-testid="tutorial-line" className={cn("rounded-lg border border-highlight/50 bg-highlight/10 p-3", className)}>
      <p className="flex flex-wrap items-center gap-x-2 text-xs font-bold tracking-wider text-highlight uppercase">
        <MessageCircleMoreIcon aria-hidden className="size-4 shrink-0" />
        <span>{t("assistant")}</span>
        {place !== null && <span className="font-semibold text-muted-foreground normal-case">· {t("dayOne", place)}</span>}
      </p>
      <p data-testid="tutorial-text" className="mt-1 text-sm leading-snug">
        {text}
      </p>
      {onSkip !== undefined && (
        <button type="button" onClick={onSkip} data-testid="tutorial-skip" className={cn(TUTORIAL_LINK, "mt-1")}>
          {t("skip")}
        </button>
      )}
    </div>
  );
}
