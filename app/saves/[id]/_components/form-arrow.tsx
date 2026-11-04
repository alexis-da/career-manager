import { useTranslations } from "next-intl";
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/src/lib/utils";

/** Where a player's form stands (1–99, 50 neutral): the squad's form gauge's lines, green from 65, red to 35. */
export type FormTrend = "up" | "flat" | "down";

const HIGH_FORM = 65;
const LOW_FORM = 35;

export function formTrend(form: number): FormTrend {
  if (form >= HIGH_FORM) {
    return "up";
  }
  return form <= LOW_FORM ? "down" : "flat";
}

const TREND_ICONS: Record<FormTrend, LucideIcon> = { up: ArrowUpRightIcon, flat: ArrowRightIcon, down: ArrowDownRightIcon };

const TREND_CLASSES: Record<FormTrend, string> = {
  up: "bg-win/15 text-win",
  flat: "bg-foreground/10 text-muted-foreground",
  down: "bg-loss/15 text-loss",
};

/**
 * A player's form as an arrow in a disc, up clearly above neutral, down clearly below, flat between, in the colours of
 * the squad's form gauge: never read as the arrow of a rating's gap beside it. Its figure on hover and for the screen
 * readers. No element of class block: a line of the lineup's list finds its name by it.
 */
export function FormArrow({ form, className }: { form: number; className?: string }) {
  const t = useTranslations("form");
  const trend = formTrend(form);
  const Icon = TREND_ICONS[trend];
  const label = t(trend, { form });
  return (
    <span
      title={label}
      data-form={form}
      data-form-trend={trend}
      className={cn("inline-grid size-4.5 shrink-0 place-items-center rounded-full", TREND_CLASSES[trend], className)}
    >
      <Icon aria-hidden className="size-3" strokeWidth={3} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
