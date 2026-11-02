import { useTranslations } from "next-intl";
import type { AttributeName } from "@/src/engine/generation";
import type { Position } from "@/src/engine/positions";
import { cn } from "@/src/lib/utils";

// An attribute's name is a message: player.attributes.<name>.
const OUTFIELD_ATTRIBUTES: readonly AttributeName[] = ["pace", "shooting", "passing", "dribbling", "defending", "physical"];

const GOALKEEPING: AttributeName = "goalkeeping";

/** Below this value a compact attribute bar is greyed: it is not a strength of the player. */
const WEAK_ATTRIBUTE = 40;

/** The six outfield attributes, the goalkeeping one first for a goalkeeper. */
export function attributesShown(position: Position): readonly AttributeName[] {
  return position === "GK" ? [GOALKEEPING, ...OUTFIELD_ATTRIBUTES] : OUTFIELD_ATTRIBUTES;
}

export function AttributeBar({ name, value, compact = false }: { name: AttributeName; value: number; compact?: boolean }) {
  const t = useTranslations("player");
  return (
    <div
      data-attribute={name}
      className={cn("grid items-center", compact ? "grid-cols-[4rem_1fr_1.5rem] gap-2 text-xs" : "grid-cols-[5.5rem_1fr_1.75rem] gap-2.5 text-sm")}
    >
      <span className={compact ? "text-muted-foreground" : "text-on-blue"}>{t(`attributes.${name}`)}</span>
      <span className={cn("rounded-full", compact ? "h-1 bg-border" : "h-2 bg-background")} aria-hidden>
        <span
          className={cn(
            "block rounded-full",
            compact ? "h-1" : "h-2",
            compact && value < WEAK_ATTRIBUTE ? "bg-muted-foreground/50" : "bg-(--club)",
          )}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className={cn("text-right tabular-nums", compact ? "font-semibold" : "font-bold")}>{value}</span>
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
  const t = useTranslations("player");
  return (
    <section aria-label={t("attributesLabel")} className={compact ? "space-y-1.5" : "space-y-2.5"} data-testid="player-attributes">
      {attributesShown(position).map((name) => (
        <AttributeBar key={name} name={name} value={attributes[name]} compact={compact} />
      ))}
    </section>
  );
}
