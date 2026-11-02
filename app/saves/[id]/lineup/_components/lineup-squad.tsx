import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import type { LineupPlayer } from "@/src/db/lineup";
import { POSITION_GROUPS, positionGroup, ratingAt, type Position } from "@/src/engine/positions";
import { cn } from "@/src/lib/utils";
import { Panel, PanelTitle } from "../../_components/panel";
import { PositionBadges } from "../../_components/position-badge";
import { isOffPosition, positionFit } from "../../_lib/positions";
import type { DragSource, DragSourceProps } from "./use-pointer-drag";

/** A player's rating at a position, his own without one. */
const ratingFor = (player: LineupPlayer, position: Position | null): number =>
  position === null ? player.overall : ratingAt(player, position);

type SlotRatingProps = {
  player: LineupPlayer;
  position: Position | null; // the selected slot's
  className?: string;
};

/** A player's rating at the selected slot: warned only off position, as a secondary position (0.97) is not. */
export function SlotRating({ player, position, className }: SlotRatingProps) {
  const t = useTranslations("lineup");
  const tPositions = useTranslations("positions");
  return (
    <span
      title={position === null ? t("rating") : t("ratingAt", { position: tPositions(`short.${position}`) })}
      className={cn(
        "font-heading font-bold tabular-nums",
        position !== null && isOffPosition(positionFit(player, position)) && "text-warning",
        className,
      )}
    >
      {Math.round(ratingFor(player, position))}
    </span>
  );
}

/** What a line says of a player after his position and his age. */
function Mark({ className, children }: { className: string; children: string }) {
  return <span className={cn("rounded-sm bg-background/80 px-1.5 font-semibold", className)}>{children}</span>;
}

type PlayerLineProps = ComponentProps<"button"> & {
  player: LineupPlayer;
  position: Position | null; // the selected slot's
  active: boolean; // on the bright blue: the selected slot's player, or the one whose sheet shows
  lifted: boolean; // being dragged
  starter: boolean;
  mark: ReactNode;
};

/** A dense line of the squad, a button and a drag source: the rating, the name, then his position, his age and his state. */
function PlayerLine({ player, position, active, lifted, starter, mark, ...button }: PlayerLineProps) {
  const t = useTranslations("lineup");
  return (
    <button
      type="button"
      aria-current={active || undefined}
      {...button}
      className={cn(
        // A finger's long press lifts the player (usePointerDrag), never the browser's menu; a swipe scrolls the list.
        "grid min-h-11 w-full cursor-grab items-center gap-x-2 rounded-lg px-2 py-1 text-left outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/50",
        position === null ? "grid-cols-[2.25rem_minmax(0,1fr)]" : "grid-cols-[2.25rem_minmax(0,1fr)_2rem]",
        active ? "bg-primary" : "hover:bg-muted",
        lifted && "opacity-50",
      )}
    >
      <span title={t("rating")} className="text-center font-heading text-[1.375rem] leading-none font-bold tabular-nums">
        {player.overall}
      </span>
      <span className="min-w-0">
        {/* On two lines if need be, never cut. */}
        <span data-reserve-name={starter ? undefined : true} className="block text-sm leading-tight font-semibold wrap-break-word">
          {player.firstName} {player.lastName}
        </span>
        <span className={cn("mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs", active ? "text-on-blue" : "text-muted-foreground")}>
          {/* A secondary position has no background of its own, and its line's colour fades on the bright blue. Its padding
              stays when the line is not active: the list does not move under the pointer. */}
          <PositionBadges playerKey={player.id} position={player.position} className={cn("rounded-sm p-px", active && "bg-background/85")} />
          <span>· {t("age", { age: player.age })}</span>
          {player.injured && <Mark className="text-loss">{t("injured")}</Mark>}
          {mark}
        </span>
      </span>
      {position !== null && <SlotRating player={player} position={position} className="text-right text-lg" />}
    </button>
  );
}

type LineupSquadProps = {
  players: readonly LineupPlayer[];
  starters: readonly (string | null)[];
  bench: readonly string[];
  position: Position | null; // the selected slot's
  activeKey: string | null;
  draggedKey: string | null;
  selection: ReactNode; // what is selected, and what can be done of it
  onLineClick: (key: string) => void;
  sourceProps: (source: DragSource) => DragSourceProps;
};

/**
 * The squad line by line, best rated first, at the selected slot once there is one. Under lg, the players outside the
 * eleven, the pitch being right above; from lg, the starters too, marked, each of them a drag source of his slot. Their
 * lines have their own test id and attribute: data-player-key is a player outside the eleven's.
 */
export function LineupSquad({
  players,
  starters,
  bench,
  position,
  activeKey,
  draggedKey,
  selection,
  onLineClick,
  sourceProps,
}: LineupSquadProps) {
  const t = useTranslations("lineup");
  const average = Math.round(players.reduce((total, player) => total + player.overall, 0) / Math.max(players.length, 1));

  return (
    <Panel className="space-y-3 p-3.5 lg:col-start-1 lg:row-start-1" data-testid="lineup-reserves">
      <PanelTitle className="px-1 text-[0.8125rem] tracking-normal">{t("squadTitle", { count: players.length, average })}</PanelTitle>
      {selection}

      {POSITION_GROUPS.map((group) => {
        const members = players
          .filter((player) => positionGroup(player.position) === group)
          .sort((a, b) => ratingFor(b, position) - ratingFor(a, position) || a.lastName.localeCompare(b.lastName, "fr"));
        if (members.length === 0) {
          return null;
        }
        const allStarters = members.every((player) => starters.includes(player.id));
        return (
          <section
            key={group}
            aria-label={t(`groups.${group}`)}
            data-testid={`lineup-group-${group.toLowerCase()}`}
            className={cn(allStarters && "max-lg:hidden")}
          >
            <PanelTitle className="px-1">{t(`groups.${group}`)}</PanelTitle>
            <ul className="mt-1 space-y-0.5">
              {members.map((player) => {
                const line = {
                  player,
                  position,
                  active: player.id === activeKey,
                  lifted: player.id === draggedKey,
                  onClick: () => onLineClick(player.id),
                };
                const slot = starters.indexOf(player.id);
                if (slot !== -1) {
                  return (
                    <li key={player.id} className="max-lg:hidden">
                      <PlayerLine
                        {...line}
                        {...sourceProps({ kind: "slot", index: slot, key: player.id })}
                        starter
                        mark={<Mark className="text-highlight">{t("starter")}</Mark>}
                        data-starter-key={player.id}
                        data-testid="lineup-starter"
                      />
                    </li>
                  );
                }
                const benchIndex = bench.indexOf(player.id);
                return (
                  <li key={player.id}>
                    <PlayerLine
                      {...line}
                      {...sourceProps({ kind: "reserve", key: player.id })}
                      starter={false}
                      mark={
                        benchIndex !== -1 && <Mark className="text-muted-foreground">{t("substitute", { number: benchIndex + 1 })}</Mark>
                      }
                      data-player-key={player.id}
                      data-bench={benchIndex !== -1}
                      data-testid="lineup-reserve"
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Panel>
  );
}
