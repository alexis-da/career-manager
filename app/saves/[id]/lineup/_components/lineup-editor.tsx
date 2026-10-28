"use client";

import { ArmchairIcon, SaveIcon, SparklesIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PlayerFace } from "@/src/components/player-face";
import { Button } from "@/src/components/ui/button";
import type { LineupPlayer } from "@/src/db/lineup";
import { FORMATION_NAMES, FORMATIONS, isFormationName, type FormationName } from "@/src/engine/formations";
import { BENCH_SIZE, changeFormation, resolveLineup, type Lineup, type SavedLineup } from "@/src/engine/lineup";
import { POSITION_GROUPS, positionGroup, ratingAt, type Position, type PositionGroup } from "@/src/engine/positions";
import type { ClubColors } from "@/src/lib/color";
import { cn } from "@/src/lib/utils";
import { Panel, PanelTitle } from "../../_components/panel";
import { LineupSummary } from "../../_components/lineup-summary";
import { Pitch } from "../../_components/pitch";
import { PositionBadges } from "../../_components/position-badge";
import { isOffPosition, POSITION_LABEL, POSITION_SHORT, positionFit, positionTextClass } from "../../_lib/positions";
import { saveLineupAction } from "../actions";
import {
  moveToBenchFront,
  placeInSlot,
  sendSlotToBench,
  swapSlots,
  type EditorState,
} from "../_lib/editor-moves";
import { BENCH_TARGET, slotTarget, usePointerDrag, type DragSource, type DropTarget } from "./use-pointer-drag";

const GROUP_LABEL: Record<PositionGroup, string> = {
  GK: "Gardiens",
  DF: "Défenseurs",
  MF: "Milieux",
  FW: "Attaquants",
};

const SLOT_COUNT = 11;

/** Gap between the pointer and the dragged player's tag. */
const GHOST_OFFSET_PX = 14;

/** The starters of a resolved lineup, by slot index. */
function startersOf(lineup: Lineup<LineupPlayer>): (string | null)[] {
  const starters: (string | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
  for (const starter of lineup.starters) {
    starters[starter.index] = starter.player.id;
  }
  return starters;
}

/** What the match will play, except that saved starters now injured stay in their slot, shown in red. */
function initialState(formation: FormationName, saved: SavedLineup | null, players: readonly LineupPlayer[]): EditorState {
  const resolved = resolveLineup(formation, saved, players);
  const starters = startersOf(resolved);
  const injured = new Set(players.filter((player) => player.injured).map((player) => player.id));
  for (const { slot, playerKey } of saved?.starters ?? []) {
    if (slot < starters.length && injured.has(playerKey) && !starters.includes(playerKey)) {
      starters[slot] = playerKey;
    }
  }
  return {
    formation,
    starters,
    bench: resolved.bench.map((player) => player.id).filter((key) => !starters.includes(key)),
  };
}

const sameState = (a: EditorState, b: EditorState): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The change a drop makes, or the state unchanged. */
function applyDrop(state: EditorState, source: DragSource, target: DropTarget): EditorState {
  if (target.kind === "bench") {
    return source.kind === "slot" ? sendSlotToBench(state, source.index) : moveToBenchFront(state, source.key);
  }
  return source.kind === "slot" ? swapSlots(state, source.index, target.index) : placeInSlot(state, target.index, source.key);
}

type LineupEditorProps = {
  saveId: string;
  formation: FormationName;
  saved: SavedLineup | null;
  clubColors: ClubColors;
  players: LineupPlayer[];
};

/**
 * The lineup editor. Two ways to move players, which do the same: click a slot then a player or another slot (the
 * keyboard way), or drag a player onto a slot or onto the bench.
 */
export function LineupEditor({ saveId, formation, saved, clubColors, players }: LineupEditorProps) {
  const [initial] = useState(() => initialState(formation, saved, players));
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const { drag, sourceProps } = usePointerDrag((source, target) => {
    setState((current) => applyDrop(current, source, target));
    setSelected(null);
  });

  const byKey = new Map(players.map((player) => [player.id, player]));
  const slots = FORMATIONS[state.formation];
  const selectedPosition: Position | null = selected === null ? null : slots[selected].position;
  const dirty = !sameState(state, initial);
  const dragged = drag === null ? null : (byKey.get(drag.source.key) ?? null);

  const clickSlot = (index: number): void => {
    if (selected === null) {
      setSelected(index);
      return;
    }
    setState(swapSlots(state, selected, index));
    setSelected(null);
  };

  const placePlayer = (key: string): void => {
    if (selected === null) {
      return;
    }
    setState(placeInSlot(state, selected, key));
    setSelected(null);
  };

  const sendToBench = (): void => {
    if (selected !== null) {
      setState(sendSlotToBench(state, selected));
    }
    setSelected(null);
  };

  const switchFormation = (value: string): void => {
    if (!isFormationName(value) || value === state.formation) {
      return;
    }
    const starters = changeFormation(state.formation, value, state.starters, players);
    const leaving = state.starters.filter((key): key is string => key !== null && !starters.includes(key));
    const bench = [...leaving, ...state.bench]
      .filter((key, index, keys) => !starters.includes(key) && keys.indexOf(key) === index)
      .slice(0, BENCH_SIZE);
    setState({ formation: value, starters, bench });
    setSelected(null);
  };

  const automatic = (): void => {
    const resolved = resolveLineup(state.formation, null, players);
    setState({ ...state, starters: startersOf(resolved), bench: resolved.bench.map((player) => player.id) });
    setSelected(null);
  };

  /** Fills only the empty slots, keeping every player already placed. */
  const completeEmptySlots = (): void => {
    const current: SavedLineup = {
      starters: state.starters.flatMap((playerKey, slot) => (playerKey === null ? [] : [{ slot, playerKey }])),
      benchOrder: state.bench,
    };
    const starters = startersOf(resolveLineup(state.formation, current, players));
    // Injured starters left in place by the manager stay in their slot, as the editor shows them.
    state.starters.forEach((key, slot) => {
      if (key !== null) {
        starters[slot] = key;
      }
    });
    setState({ ...state, starters, bench: state.bench.filter((key) => !starters.includes(key)) });
  };

  const emptySlots = state.starters.filter((key) => key === null).length;

  const save = (): void => {
    if (emptySlots > 0) {
      toast.error(
        `Onze incomplet : ${emptySlots === 1 ? "1 poste est vide" : `${emptySlots} postes sont vides`}. Placez un joueur sur chaque poste ou cliquez sur « Compléter automatiquement ».`,
      );
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveLineupAction(saveId, {
          formation: state.formation,
          lineup: {
            starters: state.starters.flatMap((playerKey, slot) => (playerKey === null ? [] : [{ slot, playerKey }])),
            benchOrder: state.bench,
          },
        });
        if (result.ok) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("L'enregistrement a échoué. Réessayez.");
      }
    });
  };

  const reserves = players.filter((player) => !state.starters.includes(player.id));
  const ratingFor = (player: LineupPlayer): number =>
    selectedPosition === null ? player.overall : ratingAt(player, selectedPosition);
  // Warned only off position: at a secondary position (0.97) a player is not.
  const offAtSelected = (player: LineupPlayer): boolean =>
    selectedPosition !== null && isOffPosition(positionFit(player, selectedPosition));
  const injuredStarters = state.starters.filter((key) => key !== null && byKey.get(key)?.injured === true).length;
  const selectedPlayer = selected === null ? undefined : byKey.get(state.starters[selected] ?? "");
  const overBench = drag?.over?.kind === "bench";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <label htmlFor="lineup-formation" className="eyebrow">
          Dispositif
        </label>
        <select
          id="lineup-formation"
          value={state.formation}
          onChange={(event) => switchFormation(event.target.value)}
          className="h-8 rounded-lg border border-input bg-input/30 px-2 font-heading text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {FORMATION_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={automatic}>
          <SparklesIcon data-icon="inline-start" />
          Composition automatique
        </Button>
        <p role="status" className="ml-auto text-sm">
          {dirty ? (
            <span className="text-warning">Modifications non enregistrées</span>
          ) : (
            <span className="text-muted-foreground">Composition enregistrée</span>
          )}
        </p>
        <Button variant="club" className="h-9 px-4 font-heading text-base font-semibold" disabled={pending || !dirty} onClick={save}>
          <SaveIcon data-icon="inline-start" />
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      {(emptySlots > 0 || injuredStarters > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/25 bg-warning/5 px-4 py-2 text-sm text-warning">
          <p className="flex-1">
            {emptySlots > 0 &&
              `Onze incomplet : ${emptySlots === 1 ? "1 poste vide" : `${emptySlots} postes vides`}, à remplir avant d'enregistrer. `}
            {injuredStarters > 0 && "Un titulaire blessé sera remplacé automatiquement au coup d'envoi."}
          </p>
          {emptySlots > 0 && (
            <Button size="sm" variant="outline" onClick={completeEmptySlots}>
              Compléter automatiquement
            </Button>
          )}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,460px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Pitch
            slots={slots}
            starters={state.starters}
            players={byKey}
            clubColors={clubColors}
            label="Mon onze"
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
          <LineupSummary slots={slots} starters={state.starters} players={byKey} />
        </div>

        <div className="space-y-4">
          <section
            aria-label="Banc"
            data-drop-target={BENCH_TARGET}
            className={cn(
              // 16 px under the save's header, 96 px high with its tabs.
              "sticky top-28 z-10 rounded-lg border-2 border-dashed bg-card p-3 transition-colors",
              drag === null ? "border-border" : overBench ? "border-solid border-(--club) bg-(--club)/25" : "border-(--club)/70",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <PanelTitle>Banc</PanelTitle>
              <p className={cn("text-xs", overBench ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {overBench ? "Relâcher ici pour mettre sur le banc" : "Glissez un titulaire ici pour le sortir du onze"}
              </p>
            </div>
            <ol className="mt-2 flex flex-wrap gap-1.5">
              {state.bench.map((key, index) => {
                const player = byKey.get(key);
                if (player === undefined) {
                  return null;
                }
                const rating = ratingFor(player);
                return (
                  <li
                    key={key}
                    data-bench-player-key={key}
                    title={`Remplaçant ${index + 1} : ${player.firstName} ${player.lastName}`}
                    className="flex items-center gap-1.5 rounded-md bg-muted py-0.5 pr-2 pl-0.5 text-xs"
                  >
                    <PlayerFace playerKey={key} age={player.age} clubColors={clubColors} size={20} />
                    <PositionBadges playerKey={key} position={player.position} />
                    {player.lastName}
                    <span
                      title={selectedPosition === null ? "Note" : `Note au poste ${POSITION_SHORT[selectedPosition]}`}
                      className={cn(
                        "font-heading font-bold tabular-nums",
                        selectedPosition === null ? "text-muted-foreground" : offAtSelected(player) && "text-warning",
                      )}
                    >
                      {Math.round(rating)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <Panel className="space-y-4">
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
              {selectedPosition === null || selected === null ? (
                <p className="text-sm text-muted-foreground">
                  Sélectionnez un poste sur le terrain, ou glissez un joueur sur un poste : sa note au poste s&apos;affiche.
                </p>
              ) : (
                <>
                  <p className="text-sm">
                    Poste sélectionné :{" "}
                    <span className={cn("font-heading font-bold", positionTextClass(selectedPosition))}>
                      {POSITION_SHORT[selectedPosition]}
                    </span>{" "}
                    {POSITION_LABEL[selectedPosition]}
                    {selectedPlayer !== undefined && ` · ${selectedPlayer.firstName} ${selectedPlayer.lastName}`}
                  </p>
                  {selectedPlayer !== undefined && (
                    <Button size="sm" variant="outline" onClick={sendToBench}>
                      <ArmchairIcon data-icon="inline-start" />
                      Mettre sur le banc
                    </Button>
                  )}
                </>
              )}
            </div>

            {POSITION_GROUPS.map((group) => {
              const members = reserves
                .filter((player) => positionGroup(player.position) === group)
                .sort((a, b) => ratingFor(b) - ratingFor(a) || a.lastName.localeCompare(b.lastName, "fr"));
              if (members.length === 0) {
                return null;
              }
              return (
                <section key={group} aria-label={GROUP_LABEL[group]}>
                  <PanelTitle>{GROUP_LABEL[group]}</PanelTitle>
                  <ul className="mt-1.5 divide-y">
                    {members.map((player) => {
                      const benchIndex = state.bench.indexOf(player.id);
                      const rating = ratingFor(player);
                      return (
                        <li key={player.id}>
                          <button
                            type="button"
                            data-player-key={player.id}
                            data-bench={benchIndex !== -1}
                            aria-disabled={selected === null}
                            onClick={() => placePlayer(player.id)}
                            {...sourceProps({ kind: "reserve", key: player.id })}
                            className={cn(
                              "grid w-full cursor-grab touch-none grid-cols-[5.5rem_2rem_minmax(0,1fr)_auto_3rem_3rem] items-center gap-3 rounded-md px-2 py-1 text-left text-sm select-none",
                              selected !== null && "hover:bg-muted",
                              drag?.source.key === player.id && "opacity-50",
                            )}
                          >
                            <PositionBadges playerKey={player.id} position={player.position} className="justify-self-start" />
                            <PlayerFace playerKey={player.id} age={player.age} clubColors={clubColors} size={32} />
                            <span data-reserve-name className="truncate font-medium">
                              {player.firstName} {player.lastName}
                            </span>
                            <span className="flex gap-1">
                              {player.injured && (
                                <span className="rounded-sm bg-loss/15 px-1.5 text-xs font-semibold text-loss">Blessé</span>
                              )}
                              {benchIndex !== -1 && (
                                <span className="rounded-sm bg-muted px-1.5 text-xs text-muted-foreground">
                                  Remplaçant {benchIndex + 1}
                                </span>
                              )}
                            </span>
                            <span className="text-right text-muted-foreground tabular-nums" title="Note">
                              {player.overall}
                            </span>
                            <span
                              title={selectedPosition === null ? "Note" : `Note au poste ${POSITION_SHORT[selectedPosition]}`}
                              className={cn(
                                "text-right font-heading font-bold tabular-nums",
                                offAtSelected(player) && "text-warning",
                              )}
                            >
                              {selectedPosition === null ? "—" : Math.round(rating)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </Panel>
        </div>
      </div>

      {drag !== null && dragged !== null && (
        // Follows the pointer, below and to the right of it so the slot under the pointer stays visible; never a
        // drop target itself.
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-full border bg-card py-0.5 pr-3 pl-0.5 text-sm font-semibold shadow-lg"
          style={{ left: drag.x + GHOST_OFFSET_PX, top: drag.y + GHOST_OFFSET_PX }}
        >
          <PlayerFace playerKey={dragged.id} age={dragged.age} clubColors={clubColors} size={28} />
          <PositionBadges playerKey={dragged.id} position={dragged.position} />
          {dragged.lastName}
        </div>
      )}
    </div>
  );
}
