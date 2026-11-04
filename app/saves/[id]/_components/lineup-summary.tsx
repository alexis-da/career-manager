import { useTranslations } from "next-intl";
import { Fragment } from "react";
import type { LineupPlayer } from "@/src/db/lineup";
import type { FormationSlot } from "@/src/engine/formations";
import type { Position } from "@/src/engine/positions";
import { cn } from "@/src/lib/utils";
import { positionFit, type PositionFit } from "../_lib/positions";

type LineupSummaryProps = {
  slots: readonly FormationSlot[];
  starters: readonly (string | null)[];
  players: ReadonlyMap<string, LineupPlayer>;
  closedSlots?: number; // slots meant to stay empty (a sent-off player's), not counted as empty
};

type PlacedStarter = { player: LineupPlayer; slot: Position; fit: PositionFit };

/** The starters off position, each with the position he plays, marked with his playerKey: two may share a last name. */
function OffPosition({ starters }: { starters: readonly PlacedStarter[] }) {
  const t = useTranslations("lineupSummary");
  const tPositions = useTranslations("positions");
  if (starters.length === 0) {
    return null;
  }
  return (
    <>
      {t("namesIntro")}
      {starters.map(({ player, slot }, index) => (
        <Fragment key={player.id}>
          {index > 0 && ", "}
          <span data-off-position={player.id}>
            {t("player", {
              name: player.lastName,
              position: tPositions(`short.${player.position}`),
              slot: tPositions(`short.${slot}`),
            })}
          </span>
        </Fragment>
      ))}
    </>
  );
}

/**
 * Is the eleven clean? The starters by how they fit their slot, with the words of their labels: at their own position,
 * at a secondary position, filling in and out of position, the last two named. Under the pitch of the lineup page and
 * of the half-time screen.
 */
export function LineupSummary({ slots, starters, players, closedSlots = 0 }: LineupSummaryProps) {
  const t = useTranslations("lineupSummary");
  const tPositions = useTranslations("positions");
  const placed = starters.flatMap((key, index): PlacedStarter[] => {
    const player = key === null ? undefined : players.get(key);
    const slot = slots[index].position;
    return player === undefined ? [] : [{ player, slot, fit: positionFit(player, slot) }];
  });
  const withFit = (fit: PositionFit) => placed.filter((starter) => starter.fit === fit);
  const secondary = withFit("secondary").length;
  const fillingIn = withFit("line");
  const outOfPosition = withFit("other-line");
  const emptySlots = starters.filter((key) => key === null).length - closedSlots;

  return (
    <p data-lineup-summary className="text-sm text-muted-foreground">
      <span className="text-foreground">{t("atPosition", { count: withFit("exact").length })}</span>
      {secondary > 0 && (
        <>
          {" · "}
          <span className="text-foreground">{tPositions("count.secondary", { count: secondary })}</span>
        </>
      )}
      {fillingIn.length > 0 && (
        <>
          {" · "}
          <span className="text-warning">{tPositions("count.line", { count: fillingIn.length })}</span>
          <OffPosition starters={fillingIn} />
        </>
      )}
      {" · "}
      <span className={cn(outOfPosition.length > 0 ? "text-loss" : "text-foreground")}>
        {t("offPosition", { count: outOfPosition.length })}
      </span>
      <OffPosition starters={outOfPosition} />
      {emptySlots > 0 && ` · ${t("emptySlots", { count: emptySlots })}`}
    </p>
  );
}
