"use client";

import { useTranslations } from "next-intl";
import { PlayIcon, SkipForwardIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PlayerFace } from "@/src/components/player-face";
import { Button } from "@/src/components/ui/button";
import type { HalfTimeTeam } from "@/src/db/live-match";
import { FORMATION_NAMES, FORMATIONS, isFormationName } from "@/src/engine/formations";
import { ratingAt, type Position } from "@/src/engine/positions";
import { cn } from "@/src/lib/utils";
import { LineupSummary } from "../../_components/lineup-summary";
import { Panel, PanelTitle } from "../../_components/panel";
import { Pitch } from "../../_components/pitch";
import { PositionBadges } from "../../_components/position-badge";
import { isOffPosition, positionFit } from "../../_lib/positions";
import { resumeMatch } from "../../actions";
import { slotTarget, usePointerDrag, type DragSource, type DropTarget } from "../../lineup/_components/use-pointer-drag";
import {
  halfTimeChoice,
  substitute,
  substitutionsMade,
  swapSlots,
  switchFormation,
  type HalfTimeRules,
  type HalfTimeState,
  type Move,
} from "../_lib/half-time-moves";

/** Gap between the pointer and the dragged player's tag. */
const GHOST_OFFSET_PX = 14;

type HalfTimeProps = {
  saveId: string;
  team: HalfTimeTeam;
  onResumed: () => void; // what follows the break is played and saved: replay it
};

/**
 * The managed club at a break, half-time or the end of regulation time of a level cup tie (one more substitution
 * then, before extra time): its eleven on the pitch (players injured in the first half in red, a sent-off
 * player's slot crossed out), its bench and its formation. A substitute dropped on a slot comes on, the player in the
 * slot goes off for good; starters moved between slots or another formation cost no substitution. The keyboard way
 * is the lineup page's: a slot, then a substitute or another slot.
 */
export function HalfTime({ saveId, team, onResumed }: HalfTimeProps) {
  const t = useTranslations("halfTime");
  const tPositions = useTranslations("positions");
  const [rules] = useState<HalfTimeRules>(() => ({
    injured: new Set(team.injured),
    sentOffSlots: new Set(team.sentOff.map((entry) => entry.slot)),
    substitutionsBefore: team.substitutions,
    maxSubstitutions: team.maxSubstitutions,
  }));
  const regulationEnd = team.phase === "REGULATION_END";
  const [state, setState] = useState<HalfTimeState>(() => ({
    formation: team.formation,
    starters: team.starters,
    bench: team.bench,
    off: [],
    substitutions: [],
  }));
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const byKey = new Map(team.players.map((player) => [player.id, player]));
  const slots = FORMATIONS[state.formation];
  const sentOff = new Map(team.sentOff.flatMap(({ slot, playerKey }) => {
    const player = byKey.get(playerKey);
    return player === undefined ? [] : [[slot, player] as const];
  }));

  const apply = (move: Move): void => {
    if (move.ok) {
      setState(move.state);
    } else {
      toast.error(move.message);
    }
    setSelected(null);
  };

  const { drag, sourceProps } = usePointerDrag((source: DragSource, target: DropTarget) => {
    if (target.kind !== "slot") {
      return;
    }
    apply(
      source.kind === "slot"
        ? swapSlots(state, rules, source.index, target.index, t)
        : substitute(state, rules, target.index, source.key, t),
    );
  });

  const clickSlot = (index: number): void => {
    if (selected === null) {
      setSelected(rules.sentOffSlots.has(index) ? null : index);
    } else if (selected === index) {
      setSelected(null);
    } else {
      apply(swapSlots(state, rules, selected, index, t));
    }
  };

  const clickSubstitute = (key: string): void => {
    if (selected === null) {
      toast.info(t("selectFirst"));
      return;
    }
    apply(substitute(state, rules, selected, key, t));
  };

  const changeFormation = (value: string): void => {
    if (isFormationName(value)) {
      setState(switchFormation(state, rules, value, team.players));
      setSelected(null);
    }
  };

  const resume = (withChanges: boolean): void =>
    startTransition(async () => {
      try {
        const result = await resumeMatch(saveId, withChanges ? halfTimeChoice(state, rules, team.players) : null);
        if (result.ok) {
          onResumed();
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error(t("resumeFailed"));
      }
    });

  const made = substitutionsMade(state, rules);
  const selectedPosition: Position | null = selected === null ? null : slots[selected].position;
  const dragged = drag === null ? null : (byKey.get(drag.source.key) ?? null);
  const injuredOnPitch = state.starters.filter((key): key is string => key !== null && rules.injured.has(key));

  return (
    <Panel className="space-y-4" data-half-time={team.phase} data-testid="half-time">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-2xl font-bold" data-testid="half-time-title">
          {regulationEnd ? t("title.regulationEnd") : t("title.halfTime")}
        </h2>
        <p
          data-substitutions
          data-testid="half-time-substitutions"
          className={cn("text-sm", made >= team.maxSubstitutions ? "text-warning" : "text-muted-foreground")}
        >
          {t("substitutions", { made, max: team.maxSubstitutions })}
          {regulationEnd && ` · ${t("oneMore")}`}
        </p>
        <label htmlFor="half-time-formation" className="eyebrow ml-auto">
          {t("formation")}
        </label>
        <select
          id="half-time-formation"
          data-testid="half-time-formation"
          value={state.formation}
          onChange={(event) => changeFormation(event.target.value)}
          className="h-8 rounded-lg border border-input bg-input/30 px-2 font-heading text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:h-11"
        >
          {FORMATION_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {injuredOnPitch.length > 0 && (
        <p data-testid="half-time-injured" className="rounded-lg border border-loss/25 bg-loss/5 px-4 py-2 text-sm text-loss">
          {t("injured", {
            count: injuredOnPitch.length,
            names: injuredOnPitch.map((key) => byKey.get(key)?.lastName).join(", "),
          })}
        </p>
      )}

      {/* One column the content's width under xl (minmax(0, 1fr)), where the sidebar leaves no room for two: the pitch
          scales to it, up to a height that still fits a screen. */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-lg space-y-2 xl:max-w-none">
          <Pitch
            slots={slots}
            starters={state.starters}
            players={byKey}
            clubColors={team.clubColors}
            label={t("pitch")}
            sentOff={sentOff}
            editing={{
              selected,
              onSelect: clickSlot,
              dragged,
              draggedFrom: drag?.source.kind === "slot" ? drag.source.index : null,
              over: drag?.over?.kind === "slot" ? drag.over.index : null,
              dragProps: (index, key) => sourceProps({ kind: "slot", index, key }),
              dropTarget: slotTarget,
            }}
          />
          <LineupSummary slots={slots} starters={state.starters} players={byKey} closedSlots={rules.sentOffSlots.size} />
        </div>

        <div className="space-y-4">
          <section aria-label={t("bench")} data-testid="half-time-bench">
            <div className="flex items-baseline justify-between gap-3">
              <PanelTitle>{t("bench")}</PanelTitle>
              <p className="text-xs text-muted-foreground">{t("benchHint")}</p>
            </div>
            <ul className="mt-1.5 divide-y">
              {state.bench.map((key) => {
                const player = byKey.get(key);
                if (player === undefined) {
                  return null;
                }
                const rating = selectedPosition === null ? player.overall : ratingAt(player, selectedPosition);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      data-bench-player-key={key}
                      data-testid="half-time-bench-player"
                      aria-disabled={selected === null}
                      onClick={() => clickSubstitute(key)}
                      {...sourceProps({ kind: "reserve", key })}
                      className={cn(
                        // A finger's long press lifts the player (usePointerDrag), never the browser's menu; a swipe
                        // scrolls the page. On a phone, no face, and the name whole.
                        "grid w-full cursor-grab grid-cols-[5.5rem_2rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md px-2 py-1 text-left text-sm select-none [-webkit-touch-callout:none]",
                        "max-sm:min-h-11 max-sm:grid-cols-[3.75rem_minmax(0,1fr)_2rem] max-sm:gap-2",
                        selected !== null && "hover:bg-muted",
                        drag?.source.key === key && "opacity-50",
                      )}
                    >
                      <PositionBadges playerKey={key} position={player.position} className="justify-self-start max-sm:flex-wrap" />
                      <PlayerFace playerKey={key} age={player.age} clubColors={team.clubColors} size={32} className="max-sm:hidden" />
                      <span className="truncate font-medium max-sm:whitespace-normal">
                        {player.firstName} {player.lastName}
                      </span>
                      <span
                        title={
                          selectedPosition === null
                            ? t("rating")
                            : t("ratingAt", { position: tPositions(`short.${selectedPosition}`) })
                        }
                        className={cn(
                          "text-right font-heading font-bold tabular-nums",
                          selectedPosition !== null && isOffPosition(positionFit(player, selectedPosition)) && "text-warning",
                        )}
                      >
                        {Math.round(rating)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {state.bench.length === 0 && <p className="mt-1.5 text-sm text-muted-foreground">{t("noSubstitutes")}</p>}
          </section>

          {state.off.length > 0 && (
            <section aria-label={t("off")} data-testid="half-time-off">
              <PanelTitle>{t("off")}</PanelTitle>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {state.off.map((key) => {
                  const player = byKey.get(key);
                  return (
                    <li
                      key={key}
                      data-off-player-key={key}
                      title={t("cannotReturn")}
                      className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground line-through"
                    >
                      {player?.lastName}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* Stuck to the foot of the screen, above the navigation under lg: the panel is taller than a screen, and these are
          the only way on. */}
      <div className="sticky bottom-0 z-20 max-lg:bottom-(--save-nav-height) -mx-5 -mb-5 flex flex-wrap justify-end gap-2 rounded-b-card border-t bg-card px-5 py-4 max-sm:py-2">
        <Button
          variant="outline"
          className="h-9 px-3"
          disabled={pending}
          onClick={() => resume(false)}
          data-testid="half-time-resume-unchanged"
        >
          <SkipForwardIcon data-icon="inline-start" />
          {t("resumeUnchanged")}
        </Button>
        <Button
          variant="club"
          className="h-9 px-4 font-heading text-base font-semibold"
          disabled={pending}
          onClick={() => resume(true)}
          data-testid="half-time-resume"
        >
          <PlayIcon data-icon="inline-start" className="fill-current" />
          {pending
            ? regulationEnd
              ? t("resuming.regulationEnd")
              : t("resuming.halfTime")
            : regulationEnd
              ? t("resume.regulationEnd")
              : t("resume.halfTime")}
        </Button>
      </div>

      {drag !== null && dragged !== null && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-full border bg-card py-0.5 pr-3 pl-0.5 text-sm font-semibold shadow-lg"
          style={{ left: drag.x + GHOST_OFFSET_PX, top: drag.y + GHOST_OFFSET_PX }}
        >
          <PlayerFace playerKey={dragged.id} age={dragged.age} clubColors={team.clubColors} size={28} />
          <PositionBadges playerKey={dragged.id} position={dragged.position} />
          {dragged.lastName}
        </div>
      )}
    </Panel>
  );
}
