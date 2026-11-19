"use client";

import { useTranslations } from "next-intl";
import { ArmchairIcon, ChevronLeftIcon, IdCardIcon } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/src/components/ui/sheet";
import type { LineupPlayer } from "@/src/db/lineup";
import type { FormationSlot } from "@/src/engine/formations";
import type { Position } from "@/src/engine/positions";
import { cn } from "@/src/lib/utils";
import { FitnessGauge } from "../../_components/fitness-gauge";
import { FormArrow } from "../../_components/form-arrow";
import { disciplineBadges } from "../../_components/player-badges";
import { FitLabel, PositionBadge, RatingGap } from "../../_components/position-badge";
import { positionFit, positionTextClass, slotRating } from "../../_lib/positions";
import type { SlotCandidate } from "../_lib/candidates";
import { Mark } from "./lineup-squad";
import type { DragSource, DragSourceProps } from "./use-pointer-drag";

/** A slot as a header names it: « BU Buteur », its short name in the colour of its line. */
function SlotName({ position }: { position: Position }) {
  const tPositions = useTranslations("positions");
  return (
    <>
      <span className={cn("font-heading font-bold", positionTextClass(position))}>{tPositions(`short.${position}`)}</span>{" "}
      {tPositions(`label.${position}`)}
    </>
  );
}

type SelectedSlotProps = {
  position: Position;
  player: LineupPlayer | undefined; // the slot's, none when it is empty
  named: boolean; // whether it names the slot: the sheet's title does
  onOpenSheet?: () => void; // none in an editor without sheets: a nation's
  onSendToBench: () => void;
};

/**
 * The selected slot and its player: how he fits it (« 71 → 65 · Dépanne »), then his sheet, the only way to a starter's
 * on a phone, whose list leaves out the eleven (where the editor has sheets), and the bench.
 */
export function SelectedSlot({ position, player, named, onOpenSheet, onSendToBench }: SelectedSlotProps) {
  const t = useTranslations("lineup");
  const fit = player === undefined ? null : positionFit(player, position);
  return (
    <div className="space-y-2 rounded-lg bg-background/60 px-2.5 py-2" data-testid="lineup-selection">
      {named && (
        <p className="text-sm">
          {t("selectedSlot")} <SlotName position={position} />
        </p>
      )}
      {player === undefined || fit === null ? (
        <p className="text-sm text-muted-foreground">{t("emptySlot")}</p>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold wrap-break-word">
              {player.firstName} {player.lastName}
            </span>
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
              <PositionBadge position={player.position} fit={fit} />
              <RatingGap overall={player.overall} rating={slotRating(player, position)} />
              <FitLabel fit={fit} />
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {onOpenSheet !== undefined && (
              <Button size="sm" variant="outline" onClick={onOpenSheet} className="xl:hidden" data-testid="lineup-open-sheet">
                <IdCardIcon data-icon="inline-start" />
                {t("openSheet")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onSendToBench} data-testid="lineup-send-to-bench">
              <ArmchairIcon data-icon="inline-start" />
              {t("sendToBench")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

type CandidateRowProps = {
  candidate: SlotCandidate;
  slots: readonly FormationSlot[];
  position: Position; // the selected slot's
  lifted: boolean;
  onPick: (key: string) => void;
  sourceProps?: (source: DragSource) => DragSourceProps;
};

/**
 * A candidate, a button that puts him in the slot: his rating there, big, his name and where he is now, then how he fits
 * the slot, his fitness at the match's kick-off, his form and his state. Unlike the squad's lines, data-player-key is his
 * wherever he stands, a starter's too: data-candidate-place says where.
 */
function CandidateRow({ candidate, slots, position, lifted, onPick, sourceProps }: CandidateRowProps) {
  const t = useTranslations("lineup");
  const tPlayer = useTranslations("player");
  const tPositions = useTranslations("positions");
  const { player, fit, place } = candidate;
  const rating = Math.round(candidate.rating);
  const drag = sourceProps?.(
    place.kind === "starter" ? { kind: "slot", index: place.slot, key: player.id } : { kind: "reserve", key: player.id },
  );
  return (
    <li>
      <button
        type="button"
        {...drag}
        onClick={() => onPick(player.id)}
        data-player-key={player.id}
        data-candidate-fit={fit}
        data-candidate-rating={rating}
        data-candidate-place={place.kind}
        data-testid="lineup-candidate"
        className={cn(
          "grid min-h-11 w-full grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-2.5 rounded-lg px-2 py-1.5 text-left outline-none select-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
          // A drag source as the squad's lines: a finger's long press lifts the player, never the browser's menu.
          drag !== undefined && "cursor-grab [-webkit-touch-callout:none]",
          lifted && "opacity-50",
        )}
      >
        <span
          title={t("ratingAt", { position: tPositions(`short.${position}`) })}
          className="text-center font-heading text-2xl leading-none font-bold tabular-nums"
        >
          {rating}
        </span>
        <span className="min-w-0">
          <span className="flex items-start justify-between gap-x-2">
            {/* On two lines if need be, never cut. */}
            <span className="min-w-0 text-sm leading-tight font-semibold wrap-break-word">
              {player.firstName} {player.lastName}
            </span>
            {place.kind === "starter" && (
              <Mark className="shrink-0 text-xs leading-4 text-highlight">
                {t("starterAt", { position: tPositions(`short.${slots[place.slot].position}`) })}
              </Mark>
            )}
            {place.kind === "substitute" && (
              <Mark className="shrink-0 text-xs leading-4 text-muted-foreground">{t("substitute", { number: place.number })}</Mark>
            )}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <PositionBadge position={player.position} fit={fit} />
            <RatingGap overall={player.overall} rating={rating} className="text-foreground" />
            <FitLabel fit={fit} />
            {/* His fitness and his form together, on the next line when the slot's words take this one. */}
            <span className="inline-flex items-center gap-1.5">
              · <FitnessGauge fitness={player.fitness} moment="nextMatch" />
              <FormArrow form={player.form} />
            </span>
            {player.injured && <Mark className="text-loss">{t("injured")}</Mark>}
            {disciplineBadges(player.discipline, tPlayer).map(({ id, tone, label, title }) => (
              <Mark key={`${id}:${label}`} className={tone === "danger" ? "text-loss" : "text-warning"} title={title}>
                {label}
              </Mark>
            ))}
          </span>
        </span>
      </button>
    </li>
  );
}

type CandidateListProps = {
  candidates: readonly SlotCandidate[];
  slots: readonly FormationSlot[];
  position: Position; // the selected slot's
  draggedKey?: string | null;
  onPick: (key: string) => void;
  sourceProps?: (source: DragSource) => DragSourceProps; // from lg, where a line is carried onto the pitch as well
};

/** Who could take the selected slot, best rated there first, then, under a title of their own, the injured and the suspended. */
export function CandidateList({ candidates, slots, position, draggedKey = null, onPick, sourceProps }: CandidateListProps) {
  const t = useTranslations("lineup");
  const tPositions = useTranslations("positions");
  const row = (candidate: SlotCandidate) => (
    <CandidateRow
      key={candidate.player.id}
      candidate={candidate}
      slots={slots}
      position={position}
      lifted={candidate.player.id === draggedKey}
      onPick={onPick}
      sourceProps={sourceProps}
    />
  );
  const unavailable = candidates.filter((candidate) => !candidate.available);
  return (
    <section aria-label={t("candidates.label", { position: tPositions(`short.${position}`) })} data-testid="lineup-candidates">
      <ul className="space-y-0.5">{candidates.filter((candidate) => candidate.available).map(row)}</ul>
      {unavailable.length > 0 && (
        <>
          <h3 className="eyebrow mt-3 px-2">{t("candidates.unavailable")}</h3>
          <ul className="mt-1 space-y-0.5">{unavailable.map(row)}</ul>
        </>
      )}
    </section>
  );
}

/** From lg, in the squad's panel: the selected slot's candidates in place of the squad by line, and the way back to it. */
export function PanelCandidates({ position, onBack, children }: { position: Position; onBack: () => void; children: ReactNode }) {
  const t = useTranslations("lineup");
  const tPositions = useTranslations("positions");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1">
        <h3 className="eyebrow">{t("candidates.title", { position: tPositions(`short.${position}`) })}</h3>
        <Button size="sm" variant="ghost" onClick={onBack} data-testid="lineup-candidates-back">
          <ChevronLeftIcon data-icon="inline-start" />
          {t("candidates.back")}
        </Button>
      </div>
      <p className="px-1 text-xs text-muted-foreground">{t("candidates.clickHint")}</p>
      {children}
    </div>
  );
}

type CandidatesSheetProps = {
  open: boolean;
  position: Position | null; // the slot it shows, kept while it closes
  onClose: () => void; // Escape, its cross or a touch outside: the slot is let go
  selection: ReactNode;
  children: ReactNode;
};

/**
 * Under lg, the selected slot's candidates over the page, from the foot of the screen. Modal: a candidate's touch places
 * him and closes it, as the slot's own actions do. Its title stays while the slot's player and the list scroll under it.
 */
export function CandidatesSheet({ open, position, onClose, selection, children }: CandidatesSheetProps) {
  const t = useTranslations("lineup");
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="bottom"
        // The list rather than its first button: a stray Enter would open a sheet or empty the slot.
        initialFocus={scroller}
        data-testid="lineup-candidates-sheet"
        className="max-h-[calc(100dvh-2.5rem)] gap-0 overflow-hidden rounded-t-card border-secondary bg-card"
      >
        {/* The cross is in the corner of the sheet. */}
        <div className="mx-auto w-full max-w-lg px-4 pt-4 pr-14 pb-3">
          <SheetTitle className="text-2xl leading-none font-bold">{position !== null && <SlotName position={position} />}</SheetTitle>
          <SheetDescription className="mt-1.5 leading-snug">{t("candidates.touchHint")}</SheetDescription>
        </div>
        <div ref={scroller} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t outline-none">
          <div className="mx-auto w-full max-w-lg space-y-3 px-2 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {selection}
            {children}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
