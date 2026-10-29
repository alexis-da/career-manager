import { useTranslations } from "next-intl";
import type { DOMAttributes, ReactNode } from "react";
import { PlayerFace } from "@/src/components/player-face";
import type { LineupPlayer } from "@/src/db/lineup";
import type { FormationSlot } from "@/src/engine/formations";
import { ratingAt } from "@/src/engine/positions";
import type { ClubColors } from "@/src/lib/color";
import { cn } from "@/src/lib/utils";
import { isOffPosition, positionFit } from "../_lib/positions";
import { PositionBadge, SecondaryPositionBadges } from "./position-badge";

/** Pitch markings in metres, on a 68 × 105 pitch. */
const WIDTH = 68;
const LENGTH = 105;
const PENALTY_AREA = { width: 40.32, depth: 16.5 };
const GOAL_AREA = { width: 18.32, depth: 5.5 };
const CENTRE_CIRCLE_RADIUS = 9.15;
const PENALTY_SPOT = 11;

function Markings() {
  const line = "fill-none stroke-white/30";
  const box = (area: { width: number; depth: number }, top: boolean) => (
    <rect
      className={line}
      x={(WIDTH - area.width) / 2}
      y={top ? 0 : LENGTH - area.depth}
      width={area.width}
      height={area.depth}
    />
  );
  return (
    <svg aria-hidden viewBox={`0 0 ${WIDTH} ${LENGTH}`} preserveAspectRatio="none" className="absolute inset-0 size-full" strokeWidth={0.3}>
      <rect className={line} x={0} y={0} width={WIDTH} height={LENGTH} />
      <line className={line} x1={0} y1={LENGTH / 2} x2={WIDTH} y2={LENGTH / 2} />
      <circle className={line} cx={WIDTH / 2} cy={LENGTH / 2} r={CENTRE_CIRCLE_RADIUS} />
      <circle className="fill-white/40" cx={WIDTH / 2} cy={LENGTH / 2} r={0.5} />
      {box(PENALTY_AREA, true)}
      {box(PENALTY_AREA, false)}
      {box(GOAL_AREA, true)}
      {box(GOAL_AREA, false)}
      <circle className="fill-white/40" cx={WIDTH / 2} cy={PENALTY_SPOT} r={0.4} />
      <circle className="fill-white/40" cx={WIDTH / 2} cy={LENGTH - PENALTY_SPOT} r={0.4} />
    </svg>
  );
}

/** What the lineup editor adds to the pitch: selecting a slot, and dragging players between slots. */
export type PitchEditing = {
  selected: number | null;
  onSelect: (index: number) => void;
  dragged: LineupPlayer | null; // the player being dragged, whose rating every slot then shows
  draggedFrom: number | null; // his slot, when he is a starter
  over: number | null; // the slot under the pointer during a drag
  dragProps: (index: number, key: string) => DOMAttributes<HTMLElement>;
  dropTarget: (index: number) => string; // value of the slot's data-drop-target
};

type SlotElementProps = DOMAttributes<HTMLElement> & {
  editing: PitchEditing | undefined;
  className: string;
  children: ReactNode;
  "aria-label": string;
  "aria-pressed": boolean | undefined;
  "data-slot-index": number;
  "data-slot-player-key": string | undefined;
  "data-drop-target": string | undefined;
};

/** A button in the editor; a plain element on a read-only pitch, which nothing can select or drag. */
function SlotElement({ editing, ...props }: SlotElementProps) {
  return editing === undefined ? <div {...props} /> : <button type="button" {...props} />;
}

type PitchProps = {
  slots: readonly FormationSlot[];
  starters: readonly (string | null)[];
  players: ReadonlyMap<string, LineupPlayer>;
  clubColors: ClubColors;
  label: string; // names the eleven for assistive technologies: « Onze de Lyon »
  editing?: PitchEditing; // without it, the pitch is read-only: an opponent's probable eleven
  sentOff?: ReadonlyMap<number, LineupPlayer>; // at half-time, the slots of sent-off players: crossed out, never filled
};

/**
 * The formation on a vertical pitch, attacking upwards: each slot shows its player's face, his rating there (yellow
 * out of position, red when injured), the slot's position and his name. During a drag, every slot shows the rating
 * the dragged player would have there instead, and the slot under the pointer is highlighted. Shared by the lineup
 * editor, the half-time screen and, read-only, the opponent's preview.
 */
export function Pitch({ slots, starters, players, clubColors, label, editing, sentOff }: PitchProps) {
  const tPositions = useTranslations("positions");
  const selected = editing?.selected ?? null;
  const dragged = editing?.dragged ?? null;
  return (
    <div
      role="list"
      aria-label={label}
      data-pitch={editing === undefined ? "read-only" : "editable"}
      className="relative aspect-[68/105] w-full overflow-hidden rounded-lg border bg-pitch"
      style={{
        backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 10%, rgb(255 255 255 / 0.025) 10% 20%)",
      }}
    >
      <Markings />
      {slots.map((slot, index) => {
        const sentOffPlayer = sentOff?.get(index);
        if (sentOffPlayer !== undefined) {
          return (
            <div key={index} role="listitem" style={{ left: `${slot.x}%`, top: `${slot.y}%` }} className="absolute -translate-x-1/2 -translate-y-1/2">
              <div
                data-slot-index={index}
                data-slot-sent-off={sentOffPlayer.id}
                aria-label={`${tPositions(`label.${slot.position}`)} : poste vide, ${sentOffPlayer.firstName} ${sentOffPlayer.lastName} exclu`}
                className="flex w-28 flex-col items-center gap-0.5 select-none"
              >
                <span className="text-[0.625rem] leading-3 font-semibold tracking-wide text-white/55 uppercase">
                  {tPositions(`short.${slot.position}`)}
                </span>
                <span aria-hidden className="grid size-10 place-items-center rounded-full border-2 border-dashed border-loss bg-background/60 text-lg font-bold text-loss">
                  ✕
                </span>
                <span className="mt-0.5 rounded-sm bg-background/85 px-1.5 py-px text-[0.6875rem] leading-4 font-semibold text-loss">
                  <span className="line-through">{sentOffPlayer.lastName}</span> · exclu
                </span>
              </div>
            </div>
          );
        }
        const key = starters[index] ?? null;
        const player = key === null ? undefined : players.get(key);
        const rating = player === undefined ? null : ratingAt(player, slot.position);
        const fit = player === undefined ? undefined : positionFit(player, slot.position);
        // Off position is a matter of fit, not of rating: a secondary position rates 0.97 and is not off position.
        const outOfPosition = fit !== undefined && isOffPosition(fit);
        const draggedRating = dragged === null ? null : ratingAt(dragged, slot.position);
        const badge = draggedRating ?? rating;
        const badgeOutOfPosition = dragged === null ? outOfPosition : isOffPosition(positionFit(dragged, slot.position));
        // « DC 74 · joue AD : 59 »: the player's own position and rating, then his rating in this slot.
        const detail =
          player === undefined || rating === null
            ? null
            : `${tPositions(`short.${player.position}`)} ${player.overall} · joue ${tPositions(`short.${slot.position}`)} : ${Math.round(rating)}`;
        const slotLabel =
          player === undefined
            ? `${tPositions(`label.${slot.position}`)} : poste vide`
            : `${tPositions(`label.${slot.position}`)} : ${player.firstName} ${player.lastName}, ${detail ?? ""}` +
              (player.injured
                ? ", blessé"
                : fit === "other-line"
                  ? ", hors de sa ligne"
                  : fit === "line"
                    ? ", hors poste"
                    : fit === "secondary"
                      ? ", poste secondaire"
                      : "");
        return (
          <div key={index} role="listitem" style={{ left: `${slot.x}%`, top: `${slot.y}%` }} className="absolute -translate-x-1/2 -translate-y-1/2">
          <SlotElement
            editing={editing}
            data-slot-index={index}
            data-slot-player-key={key ?? undefined}
            data-drop-target={editing?.dropTarget(index)}
            {...(editing === undefined || key === null ? {} : editing.dragProps(index, key))}
            aria-label={slotLabel}
            aria-pressed={editing === undefined ? undefined : selected === index}
            onClick={editing === undefined ? undefined : () => editing.onSelect(index)}
            className={cn(
              "group flex w-28 flex-col items-center gap-0.5 outline-none select-none",
              editing !== undefined && "touch-none",
              editing !== undefined && key !== null && "cursor-grab",
              editing?.draggedFrom === index && "opacity-50",
            )}
          >
            {/* The role to fill, in gray: the player's own position is the badge next to his name. */}
            <span data-slot-position className="text-[0.625rem] leading-3 font-semibold tracking-wide text-white/55 uppercase">
              {tPositions(`short.${slot.position}`)}
            </span>
            <span
              className={cn(
                "relative grid size-10 place-items-center rounded-full border-2 bg-background/85 font-heading text-lg font-bold tabular-nums transition-shadow",
                "group-focus-visible:ring-3 group-focus-visible:ring-ring/60",
                player === undefined
                  ? "border-dashed border-white/40 text-white/60"
                  : player.injured
                    ? "border-loss text-loss"
                    : outOfPosition
                      ? "border-warning text-warning"
                      : "border-white/70 text-foreground",
                selected === index && "ring-4 ring-(--club) ring-offset-2 ring-offset-pitch",
                editing?.over === index && "scale-110 ring-4 ring-white/80 ring-offset-2 ring-offset-pitch",
              )}
            >
              {player === undefined ? "+" : <PlayerFace playerKey={player.id} age={player.age} clubColors={clubColors} size={32} />}
              {badge !== null && (
                <span
                  data-slot-rating
                  className={cn(
                    "absolute -top-1.5 -right-3 min-w-6 rounded-sm border bg-background px-0.5 text-center text-xs leading-4",
                    dragged === null ? "border-current" : badgeOutOfPosition ? "border-warning text-warning" : "border-white/70 text-foreground",
                  )}
                >
                  {Math.round(badge)}
                </span>
              )}
            </span>
            <span
              className={cn(
                "mt-0.5 flex max-w-full items-center gap-1 rounded-sm py-px pr-1.5 pl-px text-[0.6875rem] leading-4 font-semibold",
                player === undefined && "pl-1.5",
                selected === index ? "bg-(--club) text-(--club-fg)" : "bg-background/85",
              )}
            >
              {player !== undefined && <PositionBadge position={player.position} fit={fit} />}
              <span data-slot-player className="truncate">
                {player === undefined ? "Vide" : player.lastName}
              </span>
            </span>
            {/* Under the name, which keeps the width of the slot. */}
            {player !== undefined && <SecondaryPositionBadges playerKey={player.id} position={player.position} className="rounded-sm bg-background/85 p-px" />}
            {detail !== null && dragged === null && (
              <span
                aria-hidden
                data-slot-detail
                className={cn(
                  "pointer-events-none absolute bottom-full mb-1 rounded-md border bg-popover px-2 py-0.5 text-xs whitespace-nowrap text-popover-foreground shadow-md",
                  selected === index ? "block" : "hidden group-hover:block group-focus-visible:block",
                )}
              >
                {detail}
              </span>
            )}
          </SlotElement>
          </div>
        );
      })}
    </div>
  );
}
