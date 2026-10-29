import { useTranslations } from "next-intl";
import { Fragment } from "react";
import type { LineupPlayer } from "@/src/db/lineup";
import type { FormationSlot } from "@/src/engine/formations";
import { cn } from "@/src/lib/utils";
import { isOffPosition, positionFit } from "../_lib/positions";

type LineupSummaryProps = {
  slots: readonly FormationSlot[];
  starters: readonly (string | null)[];
  players: ReadonlyMap<string, LineupPlayer>;
  closedSlots?: number; // slots meant to stay empty (a sent-off player's), not counted as empty
};

/**
 * Is the eleven clean? Starters at their own or a secondary position, and the others with the position they play,
 * each marked with its playerKey (data-off-position): two players of a squad may share a last name. Under the pitch of
 * the lineup page and of the half-time screen.
 */
export function LineupSummary({ slots, starters, players, closedSlots = 0 }: LineupSummaryProps) {
  const t = useTranslations("lineupSummary");
  const tPositions = useTranslations("positions");
  const placed = starters.flatMap((key, index) => {
    const player = key === null ? undefined : players.get(key);
    return player === undefined ? [] : [{ player, slot: slots[index].position }];
  });
  const offPosition = placed.filter(({ player, slot }) => isOffPosition(positionFit(player, slot)));
  const atPosition = placed.length - offPosition.length;
  const emptySlots = starters.filter((key) => key === null).length - closedSlots;

  return (
    <p data-lineup-summary className="text-sm text-muted-foreground">
      <span className="text-foreground">{t("atPosition", { count: atPosition })}</span>
      {" · "}
      <span className={cn(offPosition.length > 0 ? "text-warning" : "text-foreground")}>
        {t("offPosition", { count: offPosition.length })}
      </span>
      {offPosition.length > 0 && t("namesIntro")}
      {offPosition.map(({ player, slot }, index) => (
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
      {emptySlots > 0 && ` · ${t("emptySlots", { count: emptySlots })}`}
    </p>
  );
}
