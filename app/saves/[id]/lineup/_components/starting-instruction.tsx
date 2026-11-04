"use client";

import { useTranslations } from "next-intl";
import { INSTRUCTIONS, type Instruction } from "@/src/engine/instructions";
import { cn } from "@/src/lib/utils";

type StartingInstructionProps = {
  value: Instruction; // the editor's: the one saved with the lineup (Équilibré without one), or the manager's new pick
  onChange: (value: Instruction) => void;
  className?: string;
};

/**
 * The instruction the club kicks off with, saved with its lineup: in simulation as live, the match starts with it, then
 * the assistant's rule applies. A switch of three in the Coaching panel's words, the bright blue on the one chosen as on
 * the screens' other switches, 44 px high: room the pitch keeps on a phone. Under it, what the chosen one does to a match,
 * the principle in one sentence, and the assistant's rule.
 */
export function StartingInstruction({ value, onChange, className }: StartingInstructionProps) {
  const t = useTranslations("startingInstruction");
  const tInstruction = useTranslations("halfTime.instruction");
  return (
    <fieldset data-testid="starting-instruction" className={cn("min-w-0 space-y-2", className)}>
      <legend className="eyebrow">{t("title")}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-background p-1">
        {INSTRUCTIONS.map((instruction) => (
          <label
            key={instruction}
            className={cn(
              // Relative: the radio out of sight stays within its label, where a tap or a scroll to it lands.
              "relative flex min-h-11 cursor-pointer items-center justify-center rounded-md px-2 py-1 text-center text-[0.9375rem] leading-tight transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              value === instruction ? "bg-primary font-bold text-primary-foreground" : "font-semibold text-muted-foreground hover:text-foreground",
            )}
          >
            {/* Out of sight, still the radio a keyboard moves through with its arrows and a screen reader names. */}
            <input
              type="radio"
              name="starting-instruction"
              value={instruction}
              checked={value === instruction}
              onChange={() => onChange(instruction)}
              data-instruction={instruction}
              className="sr-only"
            />
            {tInstruction(instruction)}
          </label>
        ))}
      </div>
      <p data-testid="starting-instruction-about" className="text-[0.8125rem] leading-snug text-muted-foreground">
        {t(`about.${value}`)}
      </p>
      <p data-testid="starting-instruction-principle" className="text-sm">
        {t("principle")}
      </p>
      <p className="text-[0.8125rem] leading-snug text-muted-foreground">{t("assistant")}</p>
    </fieldset>
  );
}
