import type { LineupPlayer } from "@/src/db/lineup";
import type { FormationSlot } from "@/src/engine/formations";
import { ratingAt } from "@/src/engine/positions";
import { cn } from "@/src/lib/utils";
import { POSITION_LABEL, POSITION_SHORT, positionTextClass } from "../../_lib/positions";

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

type PitchProps = {
  slots: readonly FormationSlot[];
  starters: readonly (string | null)[];
  players: ReadonlyMap<string, LineupPlayer>;
  selected: number | null;
  onSelect: (index: number) => void;
};

/** The formation on a vertical pitch, attacking upwards: each slot shows its position, its player and his rating there. */
export function Pitch({ slots, starters, players, selected, onSelect }: PitchProps) {
  return (
    <div
      className="relative aspect-[68/105] w-full overflow-hidden rounded-lg border bg-pitch"
      style={{
        backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 10%, rgb(255 255 255 / 0.025) 10% 20%)",
      }}
    >
      <Markings />
      {slots.map((slot, index) => {
        const key = starters[index] ?? null;
        const player = key === null ? undefined : players.get(key);
        const rating = player === undefined ? null : ratingAt(player, slot.position);
        const outOfPosition = player !== undefined && rating !== null && rating < player.overall;
        const label =
          player === undefined
            ? `${POSITION_LABEL[slot.position]} : poste vide`
            : `${POSITION_LABEL[slot.position]} : ${player.firstName} ${player.lastName}, note ${Math.round(rating ?? 0)} au poste` +
              (player.injured ? ", blessé" : outOfPosition ? ", hors poste" : "");
        return (
          <button
            key={index}
            type="button"
            data-slot-index={index}
            aria-label={label}
            aria-pressed={selected === index}
            onClick={() => onSelect(index)}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            className="group absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 outline-none"
          >
            <span
              className={cn(
                "grid size-11 place-items-center rounded-full border-2 bg-background/85 font-heading text-lg font-bold tabular-nums transition-shadow",
                "group-focus-visible:ring-3 group-focus-visible:ring-ring/60",
                player === undefined
                  ? "border-dashed border-white/40 text-white/60"
                  : player.injured
                    ? "border-loss text-loss"
                    : outOfPosition
                      ? "border-warning text-warning"
                      : "border-white/70 text-foreground",
                selected === index && "ring-4 ring-(--club) ring-offset-2 ring-offset-pitch",
              )}
            >
              {rating === null ? "+" : Math.round(rating)}
            </span>
            <span
              className={cn(
                "max-w-full truncate rounded-sm px-1.5 text-[0.6875rem] leading-4 font-semibold",
                selected === index ? "bg-(--club) text-(--club-fg)" : "bg-background/85",
              )}
            >
              <span className={cn("font-heading font-bold", selected !== index && positionTextClass(slot.position))}>
                {POSITION_SHORT[slot.position]}
              </span>{" "}
              <span data-slot-player>{player === undefined ? "Vide" : player.lastName}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
