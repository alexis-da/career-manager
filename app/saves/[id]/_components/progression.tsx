import { ArrowDownIcon, ArrowUpIcon, TrendingUpIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/src/lib/utils";
import { FULL_GROWTH_MINUTES, minutesShare, signedChange } from "../_lib/progression";

// A player's progression in the squad and on his sheet (docs/design/effectif-adjoint.md § 3.2): drawn arrows, never a
// glyph, and words for the screen readers and on hover.

/**
 * The summer passed beside a rating: « ↑+4 » in green, « ↓−1 » in red; nothing at 0, nor when it is unknown (a young
 * player come since, a career that has not turned a season).
 */
export function LastProgression({ change, onBlue = false, className }: { change: number | null; onBlue?: boolean; className?: string }) {
  const t = useTranslations("progression");
  if (change === null || change === 0) {
    return null;
  }
  const up = change > 0;
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;
  const label = t("last", { change: signedChange(change) });
  return (
    <span
      title={label}
      data-testid="player-last-progression"
      data-change={change}
      className={cn(
        "inline-flex items-center font-bold whitespace-nowrap tabular-nums",
        up ? "text-win" : onBlue ? "text-loss-on-blue" : "text-loss",
        className,
      )}
    >
      <Icon aria-hidden className="size-[1.05em] shrink-0" strokeWidth={3} />
      <span aria-hidden>{signedChange(change)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The summer to come on a squad's row, « ↗ +3 prévu », in the accent of what is not yet so: his league minutes kept at
 * their rhythm. `short`: « ≈ +3 », after his gauge in the « Jeunes » view.
 */
export function ExpectedProgression({ change, short = false, className }: { change: number; short?: boolean; className?: string }) {
  const t = useTranslations("progression");
  const label = t("expectedTitle", { change: signedChange(change) });
  return (
    <span
      title={label}
      data-testid="player-expected-progression"
      data-change={change}
      className={cn("inline-flex items-center gap-1 font-semibold whitespace-nowrap text-highlight tabular-nums", className)}
    >
      {!short && <TrendingUpIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />}
      <span aria-hidden>{t(short ? "about" : "expected", { change: signedChange(change) })}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A player's league minutes of the season against the full mark of a summer's growth: a bar, then the figure. */
export function LeagueMinutesGauge({ minutes, className, barClassName }: { minutes: number; className?: string; barClassName?: string }) {
  const t = useTranslations("progression");
  return (
    <span
      title={t("gaugeLabel", { minutes, full: FULL_GROWTH_MINUTES })}
      data-testid="player-league-minutes"
      data-minutes={minutes}
      className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}
    >
      <span aria-hidden className={cn("flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-border", barClassName)}>
        <span className="h-full rounded-full bg-highlight" style={{ width: `${minutesShare(minutes) * 100}%` }} />
      </span>
      <span aria-hidden>{t("minutes", { minutes })}</span>
      <span className="sr-only">{t("gaugeLabel", { minutes, full: FULL_GROWTH_MINUTES })}</span>
    </span>
  );
}
