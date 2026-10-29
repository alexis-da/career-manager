import { useTranslations } from "next-intl";
import { secondaryPositions, type Position } from "@/src/engine/positions";
import type { Translator } from "@/src/i18n/translator";
import { cn } from "@/src/lib/utils";
import { positionTextClass, type PositionFit } from "../_lib/positions";

const FIT_OUTLINE: Record<PositionFit, string> = {
  exact: "ring-white/15",
  secondary: "ring-white/15",
  line: "ring-warning",
  "other-line": "ring-loss",
};

/** A badge's title: the position's name, and how the player fits the slot he plays unless it is his own position. */
function badgeTitle(position: Position, fit: PositionFit | undefined, t: Translator<"positions">): string {
  const label = t(`label.${position}`);
  return fit === undefined || fit === "exact" ? label : t("withFit", { position: label, fit: t(`fit.${fit}`) });
}

/**
 * A player's real position, colored by line as in the squad. Given the slot he plays, its outline tells the fit:
 * yellow for another position of his line, red for another line; none at his own or a secondary position.
 */
export function PositionBadge({ position, fit, className }: { position: Position; fit?: PositionFit; className?: string }) {
  const tPositions = useTranslations("positions");
  return (
    <span
      data-position={position}
      data-fit={fit}
      title={badgeTitle(position, fit, tPositions)}
      className={cn(
        "inline-grid min-w-7 shrink-0 place-items-center rounded-sm bg-background/80 px-1 font-heading text-[0.6875rem] leading-4 font-bold",
        positionTextClass(position),
        fit !== undefined && "ring-[1.5px]",
        fit !== undefined && FIT_OUTLINE[fit],
        className,
      )}
    >
      {tPositions(`short.${position}`)}
    </span>
  );
}

/** A secondary position: smaller than the primary badge, outline only, in the color of its line. */
export function SecondaryPositionBadge({ position }: { position: Position }) {
  const tPositions = useTranslations("positions");
  return (
    <span
      data-secondary-position={position}
      title={badgeTitle(position, "secondary", tPositions)}
      className={cn(
        "inline-grid min-w-6 shrink-0 place-items-center rounded-sm border border-current px-1 font-heading text-[0.625rem] leading-3.5 font-bold",
        positionTextClass(position),
      )}
    >
      {tPositions(`short.${position}`)}
    </span>
  );
}

/** A player's secondary positions, drawn from his key: nothing when he has none. */
export function SecondaryPositionBadges({
  playerKey,
  position,
  className,
}: {
  playerKey: string;
  position: Position;
  className?: string;
}) {
  const tPositions = useTranslations("positions");
  const secondary = secondaryPositions(playerKey, position);
  if (secondary.length === 0) {
    return null;
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5", className)}>
      <span className="sr-only">{tPositions("secondaryList")}</span>
      {secondary.map((other) => (
        <SecondaryPositionBadge key={other} position={other} />
      ))}
    </span>
  );
}

/** The primary position's badge followed by the secondary ones. */
export function PositionBadges({
  playerKey,
  position,
  fit,
  className,
}: {
  playerKey: string;
  position: Position;
  fit?: PositionFit;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      <PositionBadge position={position} fit={fit} />
      <SecondaryPositionBadges playerKey={playerKey} position={position} />
    </span>
  );
}
