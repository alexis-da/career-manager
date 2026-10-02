import { cn } from "@/src/lib/utils";
import type { Position } from "@/src/engine/positions";
import { POSITION_LABEL, POSITION_SHORT, positionTextClass, type PositionFit } from "../_lib/positions";

const FIT_OUTLINE: Record<PositionFit, string> = {
  exact: "ring-white/15",
  line: "ring-warning",
  "other-line": "ring-loss",
};

const FIT_TITLE: Record<PositionFit, string> = {
  exact: "",
  line: " — hors poste",
  "other-line": " — hors de sa ligne",
};

/**
 * A player's real position, colored by line as in the squad. Given the slot he plays, its outline tells the fit:
 * yellow for another position of his line, red for another line.
 */
export function PositionBadge({ position, fit, className }: { position: Position; fit?: PositionFit; className?: string }) {
  return (
    <span
      data-position={position}
      data-fit={fit}
      title={POSITION_LABEL[position] + (fit === undefined ? "" : FIT_TITLE[fit])}
      className={cn(
        "inline-grid min-w-7 shrink-0 place-items-center rounded-sm bg-background/80 px-1 font-heading text-[0.6875rem] leading-4 font-bold",
        positionTextClass(position),
        fit !== undefined && "ring-[1.5px]",
        fit !== undefined && FIT_OUTLINE[fit],
        className,
      )}
    >
      {POSITION_SHORT[position]}
    </span>
  );
}
