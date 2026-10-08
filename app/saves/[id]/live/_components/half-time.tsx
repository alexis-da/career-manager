"use client";

import { PlayIcon, SkipForwardIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PlayerFace } from "@/src/components/player-face";
import { Button } from "@/src/components/ui/button";
import type { HalfTimeTeam } from "@/src/db/live-match";
import { MAX_SUBSTITUTIONS } from "@/src/engine/balance";
import { FORMATION_NAMES, FORMATIONS, isFormationName } from "@/src/engine/formations";
import { ratingAt, type Position } from "@/src/engine/positions";
import { cn } from "@/src/lib/utils";
import { LineupSummary } from "../../_components/lineup-summary";
import { Panel, PanelTitle } from "../../_components/panel";
import { Pitch } from "../../_components/pitch";
import { PositionBadges } from "../../_components/position-badge";
import { isOffPosition, POSITION_SHORT, positionFit } from "../../_lib/positions";
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
  onResumed: () => void; // the second half is played and saved: replay it
};

/**
 * The managed club at the break: its eleven on the pitch (players injured in the first half in red, a sent-off
 * player's slot crossed out), its bench and its formation. A substitute dropped on a slot comes on, the player in the
 * slot goes off for good; starters moved between slots or another formation cost no substitution. The keyboard way
 * is the lineup page's: a slot, then a substitute or another slot.
 */
export function HalfTime({ saveId, team, onResumed }: HalfTimeProps) {
  const [rules] = useState<HalfTimeRules>(() => ({
    injured: new Set(team.injured),
    sentOffSlots: new Set(team.sentOff.map((entry) => entry.slot)),
    substitutionsBefore: team.substitutions,
  }));
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
        ? swapSlots(state, rules, source.index, target.index)
        : substitute(state, rules, target.index, source.key),
    );
  });

  const clickSlot = (index: number): void => {
    if (selected === null) {
      setSelected(rules.sentOffSlots.has(index) ? null : index);
    } else if (selected === index) {
      setSelected(null);
    } else {
      apply(swapSlots(state, rules, selected, index));
    }
  };

  const clickSubstitute = (key: string): void => {
    if (selected === null) {
      toast.info("Sélectionnez d'abord sur le terrain le joueur qui sort.");
      return;
    }
    apply(substitute(state, rules, selected, key));
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
        toast.error("La reprise a échoué. Réessayez.");
      }
    });

  const made = substitutionsMade(state, rules);
  const selectedPosition: Position | null = selected === null ? null : slots[selected].position;
  const dragged = drag === null ? null : (byKey.get(drag.source.key) ?? null);
  const injuredOnPitch = state.starters.filter((key): key is string => key !== null && rules.injured.has(key));

  return (
    <Panel className="space-y-4" data-half-time>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-2xl font-bold">Mi-temps</h2>
        <p data-substitutions className={cn("text-sm", made >= MAX_SUBSTITUTIONS ? "text-warning" : "text-muted-foreground")}>
          Remplacements : {made}/{MAX_SUBSTITUTIONS}
        </p>
        <label htmlFor="half-time-formation" className="eyebrow ml-auto">
          Dispositif
        </label>
        <select
          id="half-time-formation"
          value={state.formation}
          onChange={(event) => changeFormation(event.target.value)}
          className="h-8 rounded-lg border border-input bg-input/30 px-2 font-heading text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {FORMATION_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {injuredOnPitch.length > 0 && (
        <p className="rounded-lg border border-loss/25 bg-loss/5 px-4 py-2 text-sm text-loss">
          {injuredOnPitch.map((key) => byKey.get(key)?.lastName).join(", ")}{" "}
          {injuredOnPitch.length === 1 ? "est sorti blessé" : "sont sortis blessés"} : sans changement de votre part, le
          meilleur remplaçant au poste entre.
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Pitch
            slots={slots}
            starters={state.starters}
            players={byKey}
            clubColors={team.clubColors}
            label="Mon onze à la mi-temps"
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
          <section aria-label="Banc">
            <div className="flex items-baseline justify-between gap-3">
              <PanelTitle>Banc</PanelTitle>
              <p className="text-xs text-muted-foreground">Glissez un remplaçant sur un joueur pour le faire entrer</p>
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
                      aria-disabled={selected === null}
                      onClick={() => clickSubstitute(key)}
                      {...sourceProps({ kind: "reserve", key })}
                      className={cn(
                        "grid w-full cursor-grab touch-none grid-cols-[5.5rem_2rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md px-2 py-1 text-left text-sm select-none",
                        selected !== null && "hover:bg-muted",
                        drag?.source.key === key && "opacity-50",
                      )}
                    >
                      <PositionBadges playerKey={key} position={player.position} className="justify-self-start" />
                      <PlayerFace playerKey={key} age={player.age} clubColors={team.clubColors} size={32} />
                      <span className="truncate font-medium">
                        {player.firstName} {player.lastName}
                      </span>
                      <span
                        title={selectedPosition === null ? "Note" : `Note au poste ${POSITION_SHORT[selectedPosition]}`}
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
            {state.bench.length === 0 && <p className="mt-1.5 text-sm text-muted-foreground">Plus aucun remplaçant.</p>}
          </section>

          {state.off.length > 0 && (
            <section aria-label="Sortis">
              <PanelTitle>Sortis</PanelTitle>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {state.off.map((key) => {
                  const player = byKey.get(key);
                  return (
                    <li
                      key={key}
                      data-off-player-key={key}
                      title="Ne peut plus revenir"
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

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button variant="outline" className="h-9 px-3" disabled={pending} onClick={() => resume(false)}>
          <SkipForwardIcon data-icon="inline-start" />
          Reprendre sans changement
        </Button>
        <Button variant="club" className="h-9 px-4 font-heading text-base font-semibold" disabled={pending} onClick={() => resume(true)}>
          <PlayIcon data-icon="inline-start" className="fill-current" />
          {pending ? "Seconde période…" : "Reprendre la seconde période"}
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
