import { useLocale, useTranslations } from "next-intl";
import { PlusIcon, XIcon } from "lucide-react";
import type { CSSProperties, DOMAttributes, ReactNode, RefCallback } from "react";
import { PlayerFace } from "@/src/components/player-face";
import type { LineupPlayer } from "@/src/db/lineup";
import type { FormationSlot } from "@/src/engine/formations";
import { isAvailable } from "@/src/engine/lineup";
import { ratingAt } from "@/src/engine/positions";
import type { ClubColors } from "@/src/lib/color";
import { cn } from "@/src/lib/utils";
import { fitnessFigure, type FitnessMoment } from "../_lib/fitness";
import { isOffPosition, positionFit } from "../_lib/positions";
import { FitnessStrip } from "./fitness-gauge";
import { CardMark, disciplineBadges, nextMatchCard } from "./player-badges";
import { PositionBadge, SecondaryPositionBadges } from "./position-badge";

/** Pitch markings in metres, on a 68 × 105 pitch. */
const WIDTH = 68;
const LENGTH = 105;
const PENALTY_AREA = { width: 40.32, depth: 16.5 };
const GOAL_AREA = { width: 18.32, depth: 5.5 };
const CENTRE_CIRCLE_RADIUS = 9.15;
const PENALTY_SPOT = 11;

/**
 * Half of w-22, a slot's width. A name holds there on one line: the game's longest takes 74 px, 86 in its chip. A slot
 * stays that far from the touchlines: on a phone, the flanks of a 5-3-2, 39 px from them, would lose it to the pitch's edge.
 */
const SLOT_HALF_WIDTH = "2.75rem";

const slotPlacement = ({ x, y }: FormationSlot): CSSProperties => ({
  left: `clamp(${SLOT_HALF_WIDTH}, ${x}%, calc(100% - ${SLOT_HALF_WIDTH}))`,
  top: `${y}%`,
});

/** Where a slot's detail opens: towards the middle near the top and the sides of the pitch, whose edges would cut it. */
const detailPlacement = ({ x, y }: FormationSlot): string =>
  cn(y < 20 ? "top-full mt-1" : "bottom-full mb-1", x < 25 && "left-0", x > 75 && "right-0");

function Markings() {
  const line = "fill-none stroke-secondary";
  const spot = "fill-secondary";
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
    <svg aria-hidden viewBox={`0 0 ${WIDTH} ${LENGTH}`} preserveAspectRatio="none" className="absolute inset-0 size-full" strokeWidth={0.4}>
      <line className={line} x1={0} y1={LENGTH / 2} x2={WIDTH} y2={LENGTH / 2} />
      <circle className={line} cx={WIDTH / 2} cy={LENGTH / 2} r={CENTRE_CIRCLE_RADIUS} />
      <circle className={spot} cx={WIDTH / 2} cy={LENGTH / 2} r={0.6} />
      {box(PENALTY_AREA, true)}
      {box(PENALTY_AREA, false)}
      {box(GOAL_AREA, true)}
      {box(GOAL_AREA, false)}
      <circle className={spot} cx={WIDTH / 2} cy={PENALTY_SPOT} r={0.5} />
      <circle className={spot} cx={WIDTH / 2} cy={LENGTH - PENALTY_SPOT} r={0.5} />
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
  dragProps: (index: number, key: string) => DOMAttributes<HTMLElement> & { ref: RefCallback<HTMLElement> };
  dropTarget: (index: number) => string; // value of the slot's data-drop-target
};

type SlotElementProps = DOMAttributes<HTMLElement> & {
  ref?: RefCallback<HTMLElement>;
  editing: PitchEditing | undefined;
  className: string;
  children: ReactNode;
  "aria-label": string;
  "aria-pressed": boolean | undefined;
  "data-slot-index": number;
  "data-slot-player-key": string | undefined;
  "data-drop-target": string | undefined;
  "data-testid": string;
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
  fitnessAt?: FitnessMoment; // where the eleven is chosen: each player's fitness, along the foot of his name, and when it is
};

/**
 * The formation on a vertical pitch, attacking upwards: each slot shows the slot's position, its player's face, his
 * rating there (yellow out of position, red when injured or suspended), his own position and his name, with his fitness
 * along its foot where the eleven is chosen, and a card on his face before the next match: red suspended for it, yellow
 * one booking from a suspension in it. During a drag, every slot shows the rating the dragged player would have there
 * instead, and the slot under the pointer is highlighted. Shared by the lineup editor, the half-time screen and,
 * read-only and without the fitness, the opponent's preview.
 */
export function Pitch({ slots, starters, players, clubColors, label, editing, sentOff, fitnessAt }: PitchProps) {
  const t = useTranslations("pitch");
  const tPlayer = useTranslations("player");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  const selected = editing?.selected ?? null;
  const dragged = editing?.dragged ?? null;
  return (
    <div
      role="list"
      aria-label={label}
      data-pitch={editing === undefined ? "read-only" : "editable"}
      data-testid="pitch"
      className="relative aspect-[68/105] w-full overflow-hidden rounded-card border-2 border-secondary bg-pitch"
    >
      <Markings />
      {slots.map((slot, index) => {
        const sentOffPlayer = sentOff?.get(index);
        if (sentOffPlayer !== undefined) {
          return (
            <div key={index} role="listitem" style={slotPlacement(slot)} className="absolute -translate-x-1/2 -translate-y-1/2">
              <div
                data-slot-index={index}
                data-slot-sent-off={sentOffPlayer.id}
                data-testid="pitch-slot"
                aria-label={t("sentOffSlot", {
                  position: tPositions(`label.${slot.position}`),
                  name: `${sentOffPlayer.firstName} ${sentOffPlayer.lastName}`,
                })}
                className="flex w-22 flex-col items-center gap-0.5 select-none"
              >
                <span className="text-[0.625rem] leading-3 font-semibold tracking-wide text-muted-foreground uppercase">
                  {tPositions(`short.${slot.position}`)}
                </span>
                <span aria-hidden className="grid size-10 place-items-center rounded-full border-2 border-dashed border-loss bg-background/60 text-loss">
                  <XIcon className="size-5" />
                </span>
                {/* On two lines at worst: « exclu » comes on top of the longest name. */}
                <span className="mt-0.5 max-w-full rounded-sm bg-background/85 px-1.5 py-px text-center text-[0.6875rem] leading-4 font-semibold text-loss">
                  <span className="line-through">{sentOffPlayer.lastName}</span> · {t("sentOff")}
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
            : t("detail", {
                position: tPositions(`short.${player.position}`),
                overall: player.overall,
                slot: tPositions(`short.${slot.position}`),
                rating: Math.round(rating),
              });
        const fitness = fitnessAt === undefined || player === undefined ? null : fitnessFigure(player.fitness);
        // Injured or suspended: he will not play, whatever his slot.
        const unavailable = player !== undefined && !isAvailable(player);
        const card = nextMatchCard(player?.discipline);
        // After the player, whether he is injured or suspended, else how he fits the slot when it is not his own position;
        // then a later suspension or yellow cards at risk, his fitness, and when it is.
        const missing = [
          ...(player?.injured === true ? [t("injured")] : []),
          ...(player?.suspended === true ? [t("suspended")] : []),
        ];
        const note =
          player === undefined || fit === undefined
            ? null
            : missing.length > 0
              ? missing.join(", ")
              : fit === "exact"
                ? null
                : tPositions(`fit.${fit}`);
        const discipline = disciplineBadges(player?.discipline, tPlayer)
          .filter(({ id }) => id !== "suspended")
          .map(({ label: badge }) => `, ${badge.toLocaleLowerCase(locale)}`)
          .join("");
        const slotLabel =
          player === undefined
            ? t("emptySlot", { position: tPositions(`label.${slot.position}`) })
            : t("slot", {
                position: tPositions(`label.${slot.position}`),
                name: `${player.firstName} ${player.lastName}`,
                detail: detail ?? "",
              }) +
              (note === null ? "" : `, ${note}`) +
              discipline +
              (fitness === null || fitnessAt === undefined ? "" : `, ${tPlayer(`fitnessAt.${fitnessAt}`, { fitness })}`);
        return (
          // Above the slots next to it while its detail shows.
          <div
            key={index}
            role="listitem"
            style={slotPlacement(slot)}
            className={cn("absolute -translate-x-1/2 -translate-y-1/2 focus-within:z-10 hover:z-10", selected === index && "z-10")}
          >
          <SlotElement
            editing={editing}
            data-slot-index={index}
            data-slot-player-key={key ?? undefined}
            data-drop-target={editing?.dropTarget(index)}
            data-testid="pitch-slot"
            {...(editing === undefined || key === null ? {} : editing.dragProps(index, key))}
            aria-label={slotLabel}
            aria-pressed={editing === undefined ? undefined : selected === index}
            onClick={editing === undefined ? undefined : () => editing.onSelect(index)}
            className={cn(
              "group flex w-22 flex-col items-center gap-0.5 outline-none select-none",
              // A finger's long press lifts the player (usePointerDrag), never the browser's menu; a swipe scrolls.
              editing !== undefined && "[-webkit-touch-callout:none]",
              editing !== undefined && key !== null && "cursor-grab",
              editing?.draggedFrom === index && "opacity-50",
            )}
          >
            {/* The role to fill, in gray: the player's own position is the badge on his face. */}
            <span data-slot-position className="text-[0.625rem] leading-3 font-semibold tracking-wide text-muted-foreground uppercase">
              {tPositions(`short.${slot.position}`)}
            </span>
            <span
              className={cn(
                "relative grid size-10 place-items-center rounded-full border-2 font-heading text-lg font-bold tabular-nums transition-shadow",
                "group-focus-visible:ring-3 group-focus-visible:ring-ring/60",
                player === undefined
                  ? "border-dashed border-muted-foreground bg-background/85 text-muted-foreground"
                  : unavailable
                    ? "border-loss bg-background text-loss"
                    : outOfPosition
                      ? "border-warning bg-background text-warning"
                      : "border-foreground bg-primary text-foreground",
                selected === index && "ring-4 ring-(--club) ring-offset-2 ring-offset-pitch",
                editing?.over === index && "scale-110 ring-4 ring-foreground ring-offset-2 ring-offset-pitch",
              )}
            >
              {player === undefined ? (
                <PlusIcon aria-hidden className="size-5" />
              ) : (
                <PlayerFace
                  playerKey={player.id}
                  age={player.age}
                  clubColors={clubColors}
                  size={32}
                  background={unavailable || outOfPosition ? "var(--background)" : "var(--primary)"}
                />
              )}
              {/* Across from the rating, beside the position: the referee's card, which the label words. */}
              {card !== null && <CardMark tone={card} className="absolute -right-1 -bottom-1" />}
              {badge !== null && (
                <span
                  data-slot-rating
                  className={cn(
                    "absolute -top-1.5 -right-3 min-w-6 rounded-sm border bg-background px-0.5 text-center text-xs leading-4",
                    dragged === null ? "border-current" : badgeOutOfPosition ? "border-warning text-warning" : "border-foreground text-foreground",
                  )}
                >
                  {Math.round(badge)}
                </span>
              )}
              {/* On the face, across from the rating: the name keeps the whole width of the slot. */}
              {player !== undefined && <PositionBadge position={player.position} fit={fit} className="absolute -bottom-1 -left-3 bg-background" />}
            </span>
            <span
              data-slot-player
              className={cn(
                "mt-1 max-w-full rounded-sm px-1.5 py-px text-center text-[0.6875rem] leading-4 font-semibold wrap-break-word",
                selected === index ? "bg-(--club) text-(--club-fg)" : "bg-background/85",
                fitness !== null && "relative overflow-hidden pb-1",
              )}
            >
              {player === undefined ? t("empty") : player.lastName}
              {/* No text in it: the name is all the chip says, the label and the detail say the figure. */}
              {fitness !== null && <FitnessStrip fitness={fitness} />}
            </span>
            {/* Under the name, which keeps the width of the slot. */}
            {player !== undefined && <SecondaryPositionBadges playerKey={player.id} position={player.position} className="rounded-sm bg-background/85 p-px" />}
            {detail !== null && dragged === null && (
              <span
                aria-hidden
                data-slot-detail
                className={cn(
                  "pointer-events-none absolute rounded-md border bg-popover px-2 py-0.5 text-xs whitespace-nowrap text-popover-foreground shadow-md",
                  detailPlacement(slot),
                  selected === index ? "block" : "hidden group-hover:block group-focus-visible:block",
                )}
              >
                {detail}
                {fitness !== null && ` · ${t("fitness", { fitness })}`}
              </span>
            )}
          </SlotElement>
          </div>
        );
      })}
    </div>
  );
}
