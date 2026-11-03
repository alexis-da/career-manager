import { useTranslations } from "next-intl";
import { cn } from "@/src/lib/utils";
import { fitnessBarClass, fitnessFigure, fitnessTextClass, fitnessWidth, type FitnessMoment } from "../_lib/fitness";

type FitnessGaugeProps = {
  fitness: number;
  moment: FitnessMoment; // when the figure is: its label says it, « Condition au prochain match : 85 »
  figure?: boolean; // the figure beside the bar; without it, the screen readers alone read it
  onBlue?: boolean; // on the bright blue of an active line rather than on a card
  className?: string;
  barClassName?: string; // the bar's width, w-8 by default
};

/**
 * A player's fitness: a bar in the colour of how tired he is, and its figure, amber or red once he is tired. Named on
 * hover and for the screen readers with the moment it is at. No element of class block: a line of the lineup's list
 * finds its name by it.
 */
export function FitnessGauge({ fitness, moment, figure = true, onBlue = false, className, barClassName }: FitnessGaugeProps) {
  const t = useTranslations("player");
  const value = fitnessFigure(fitness);
  const label = t(`fitnessAt.${moment}`, { fitness: value });
  return (
    <span title={label} data-fitness={value} className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden className={cn("flex h-1 w-8 shrink-0 overflow-hidden rounded-full bg-border", barClassName)}>
        <span className={cn("h-full rounded-full", fitnessBarClass(value))} style={{ width: fitnessWidth(value) }} />
      </span>
      <span className="sr-only">{label}</span>
      {figure && (
        <span aria-hidden className={cn("text-xs leading-none font-semibold tabular-nums", fitnessTextClass(value, onBlue))}>
          {value}
        </span>
      )}
    </span>
  );
}

/**
 * The fitness along the foot of a player's chip or tile, as a game's health bar, without a figure or a word: its element
 * is `relative`, and names the figure in its own label. The track contrasts with a dark chip; on another, give it one.
 */
export function FitnessStrip({ fitness, className }: { fitness: number; className?: string }) {
  const value = fitnessFigure(fitness);
  return (
    <span aria-hidden data-fitness-strip={value} className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-border", className)}>
      <span className={cn("absolute inset-y-0 left-0", fitnessBarClass(value))} style={{ width: fitnessWidth(value) }} />
    </span>
  );
}
