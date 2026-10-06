import type { AttributeName } from "@/src/engine/generation";
import type { Position } from "@/src/engine/positions";
import { cn } from "@/src/lib/utils";

const OUTFIELD_ATTRIBUTES: { name: AttributeName; label: string }[] = [
  { name: "pace", label: "Vitesse" },
  { name: "shooting", label: "Tir" },
  { name: "passing", label: "Passe" },
  { name: "dribbling", label: "Dribble" },
  { name: "defending", label: "Défense" },
  { name: "physical", label: "Physique" },
];

const GOALKEEPING: { name: AttributeName; label: string } = { name: "goalkeeping", label: "Gardien" };

/** Below this value an attribute bar is greyed: it is not a strength of the player. */
const WEAK_ATTRIBUTE = 40;

/** The six outfield attributes, the goalkeeping one first for a goalkeeper. */
export function attributesShown(position: Position): { name: AttributeName; label: string }[] {
  return position === "GK" ? [GOALKEEPING, ...OUTFIELD_ATTRIBUTES] : OUTFIELD_ATTRIBUTES;
}

export function AttributeBar({ label, value, compact = false }: { label: string; value: number; compact?: boolean }) {
  return (
    <div
      data-attribute={label}
      className={cn("grid items-center text-xs", compact ? "grid-cols-[4rem_1fr_1.5rem] gap-2" : "grid-cols-[5rem_1fr_2rem] gap-3")}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("rounded-full bg-border", compact ? "h-1" : "h-1.5")} aria-hidden>
        <span
          className={cn(
            "block rounded-full",
            compact ? "h-1" : "h-1.5",
            value >= WEAK_ATTRIBUTE ? "bg-(--club)" : "bg-muted-foreground/50",
          )}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="text-right font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** A player's attributes as bars: six, seven for a goalkeeper. */
export function AttributeBars({
  position,
  attributes,
  compact = false,
}: {
  position: Position;
  attributes: Record<AttributeName, number>;
  compact?: boolean;
}) {
  return (
    <section aria-label="Attributs" className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {attributesShown(position).map((attribute) => (
        <AttributeBar key={attribute.name} label={attribute.label} value={attributes[attribute.name]} compact={compact} />
      ))}
    </section>
  );
}
