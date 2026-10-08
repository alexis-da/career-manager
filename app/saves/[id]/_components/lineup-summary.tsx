import type { LineupPlayer } from "@/src/db/lineup";
import type { FormationSlot } from "@/src/engine/formations";
import { cn } from "@/src/lib/utils";
import { isOffPosition, POSITION_SHORT, positionFit } from "../_lib/positions";

type LineupSummaryProps = {
  slots: readonly FormationSlot[];
  starters: readonly (string | null)[];
  players: ReadonlyMap<string, LineupPlayer>;
  closedSlots?: number; // slots meant to stay empty (a sent-off player's), not counted as empty
};

/**
 * Is the eleven clean? Starters at their own or a secondary position, and the others with the position they play.
 * Under the pitch of the lineup page and of the half-time screen.
 */
export function LineupSummary({ slots, starters, players, closedSlots = 0 }: LineupSummaryProps) {
  const placed = starters.flatMap((key, index) => {
    const player = key === null ? undefined : players.get(key);
    return player === undefined ? [] : [{ player, slot: slots[index].position }];
  });
  const offPosition = placed.filter(({ player, slot }) => isOffPosition(positionFit(player, slot)));
  const atPosition = placed.length - offPosition.length;
  const emptySlots = starters.filter((key) => key === null).length - closedSlots;

  return (
    <p data-lineup-summary className="text-sm text-muted-foreground">
      <span className="text-foreground">
        {atPosition === 1 ? "1 titulaire à son poste" : `${atPosition} titulaires à leur poste`}
      </span>
      {" · "}
      <span className={cn(offPosition.length > 0 ? "text-warning" : "text-foreground")}>{offPosition.length} hors poste</span>
      {offPosition.length > 0 &&
        ` : ${offPosition
          .map(({ player, slot }) => `${player.lastName} (${POSITION_SHORT[player.position]} en ${POSITION_SHORT[slot]})`)
          .join(", ")}`}
      {emptySlots > 0 && ` · ${emptySlots === 1 ? "1 poste vide" : `${emptySlots} postes vides`}`}
    </p>
  );
}
