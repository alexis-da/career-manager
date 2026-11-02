"use client";

import { useTranslations } from "next-intl";
import { ArmchairIcon, IdCardIcon, SaveIcon, SparklesIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PlayerFace } from "@/src/components/player-face";
import { Button } from "@/src/components/ui/button";
import type { LineupEditor as LineupEditorView, LineupPlayer } from "@/src/db/lineup";
import type { SquadView } from "@/src/db/squad";
import { FORMATION_NAMES, FORMATIONS, isFormationName, type FormationName } from "@/src/engine/formations";
import { BENCH_SIZE, changeFormation, resolveLineup, type Lineup, type SavedLineup } from "@/src/engine/lineup";
import type { Position } from "@/src/engine/positions";
import { useMediaQuery } from "@/src/hooks/use-media-query";
import { cn } from "@/src/lib/utils";
import { SquadPlayerActions } from "../../_components/contract-actions";
import { PanelTitle } from "../../_components/panel";
import { LineupSummary } from "../../_components/lineup-summary";
import { Pitch } from "../../_components/pitch";
import { PlayerSheet } from "../../_components/player-sheet";
import { PositionBadge, PositionBadges } from "../../_components/position-badge";
import { positionTextClass } from "../../_lib/positions";
import { saveLineupAction } from "../actions";
import {
  moveToBenchFront,
  pinnedSheetKey,
  placeInSlot,
  sendSlotToBench,
  swapSlots,
  type EditorState,
} from "../_lib/editor-moves";
import { LineupSquad, SlotRating } from "./lineup-squad";
import { BENCH_TARGET, slotTarget, usePointerDrag, type DragSource, type DropTarget } from "./use-pointer-drag";

const SLOT_COUNT = 11;

/** Gap between the pointer and the dragged player's tag. */
const GHOST_OFFSET_PX = 14;

/** From here, the screen's third column: the sheet stands beside the pitch instead of opening over the page. */
const SHEET_COLUMN_QUERY = "(min-width: 80rem)";

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

type LineupScreenProps = {
  saveId: string;
  editor: LineupEditorView;
  squad: SquadView;
};

/** The screen around the editor: what it has to keep when the editor starts again, the player last chosen. */
export function LineupScreen({ saveId, editor, squad }: LineupScreenProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  // A new key after each save, and after a sale or a release: the editor starts again from what is now saved, with no
  // key left of a player gone.
  const key = `${editor.formation}:${JSON.stringify(editor.saved)}:${editor.players.map((player) => player.id).join()}`;
  return <LineupEditor key={key} saveId={saveId} editor={editor} squad={squad} chosen={chosen} onChoose={setChosen} />;
}

type LineupEditorProps = LineupScreenProps & {
  chosen: string | null; // the player last touched, on the pitch or in the squad
  onChoose: (key: string) => void;
};

/**
 * The lineup editor. Two ways to move players, which do the same: click a slot then a player or another slot (the
 * keyboard way), or drag a player onto a slot or onto the bench. A line of the squad clicked with no slot selected shows
 * the player's sheet instead, with the actions of the squad screen: over the page under xl, in the third column from
 * there, which also follows the selected slot and is never empty.
 */
function LineupEditor({ saveId, editor, squad, chosen, onChoose }: LineupEditorProps) {
  const { formation, saved, clubColors, players } = editor;
  const t = useTranslations("lineup");
  const tPositions = useTranslations("positions");
  const [initial] = useState(() => initialState(formation, saved, players));
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false); // under xl: over the page, until it is closed
  const [pending, startTransition] = useTransition();
  const sheetInColumn = useMediaQuery(SHEET_COLUMN_QUERY);
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
    const key = state.starters[index];
    if (key !== null) {
      onChoose(key);
    }
    if (selected === null) {
      setSelected(index);
      return;
    }
    setState(swapSlots(state, selected, index));
    setSelected(null);
  };

  /** With a slot selected, the player of the line goes there, a starter by exchanging their slots; else, his sheet. */
  const clickLine = (key: string): void => {
    onChoose(key);
    if (selected === null) {
      setSheetOpen(true);
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
      toast.error(t("incompleteRefused", { count: emptySlots, complete: t("complete") }));
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
        toast.error(t("saveFailed"));
      }
    });
  };

  const injuredStarters = state.starters.filter((key) => key !== null && byKey.get(key)?.injured === true).length;
  const selectedKey = selected === null ? null : state.starters[selected];
  const selectedPlayer = selectedKey === null ? undefined : byKey.get(selectedKey);
  const overBench = drag?.over?.kind === "bench";
  const sheetKey = sheetInColumn ? pinnedSheetKey(selectedKey, chosen, players) : sheetOpen ? chosen : null;
  const profile = squad.players.find((player) => player.playerKey === sheetKey);

  return (
    <div className="space-y-4">
      {/* Two rows on a phone, with the label left to the screen readers; the same two groups in one row when they fit. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 max-sm:w-full">
          <label htmlFor="lineup-formation" className="eyebrow max-sm:sr-only">
            {t("formation")}
          </label>
          <select
            id="lineup-formation"
            value={state.formation}
            onChange={(event) => switchFormation(event.target.value)}
            className="h-8 rounded-lg border border-input bg-card px-2 font-heading text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:h-11 max-sm:w-24"
            data-testid="lineup-formation"
          >
            {FORMATION_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={automatic} className="max-sm:flex-1" data-testid="lineup-automatic">
            <SparklesIcon data-icon="inline-start" />
            {t("automatic")}
          </Button>
        </div>
        <div className="flex items-center gap-3 max-sm:w-full max-sm:justify-between">
          <p role="status" className="text-sm" data-testid="lineup-status">
            {dirty ? (
              <span className="text-warning">{t("unsaved")}</span>
            ) : (
              <span className="text-muted-foreground">{t("saved")}</span>
            )}
          </p>
          {/* The screen's only orange: filled when there is something to save. */}
          <Button
            variant={dirty ? "club" : "outline"}
            className="h-9 px-4 font-heading text-base font-semibold"
            disabled={pending || !dirty}
            onClick={save}
            data-testid="lineup-save"
          >
            <SaveIcon data-icon="inline-start" />
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      </div>

      {(emptySlots > 0 || injuredStarters > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-card px-4 py-2.5 text-sm text-warning" data-testid="lineup-warning">
          <p className="flex-1">
            {emptySlots > 0 && `${t("incomplete", { count: emptySlots })} `}
            {injuredStarters > 0 && t("injuredStarter")}
          </p>
          {emptySlots > 0 && (
            <Button size="sm" variant="outline" onClick={completeEmptySlots} data-testid="lineup-complete">
              {t("complete")}
            </Button>
          )}
        </div>
      )}

      {/* One DOM, the pitch first, its columns placed by CSS. Under lg, a flex column rather than a grid, the pitch's column
          dissolved in it: a grid item would be sticky within its own row only, and the bench stays in sight along the list. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[17rem_minmax(0,1fr)_18.5rem] 2xl:grid-cols-[19rem_minmax(0,1fr)_22rem]">
        {/* Held in sight from lg: a player is carried to it from the foot of the list. */}
        <div className="max-lg:contents lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1 lg:space-y-3 lg:self-start">
          <div className="mx-auto w-full max-w-lg space-y-2 lg:max-w-none">
            {/* From lg, no taller than leaves the screen room for the summary and the bench, sticky as they are. */}
            <div className="mx-auto lg:max-w-[max(20rem,calc((100dvh-13.5rem)*68/105))]">
              <Pitch
                slots={slots}
                starters={state.starters}
                players={byKey}
                clubColors={clubColors}
                label={t("myEleven")}
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
            </div>
            <LineupSummary slots={slots} starters={state.starters} players={byKey} />
          </div>

          <section
            aria-label={t("bench")}
            data-drop-target={BENCH_TARGET}
            data-testid="lineup-bench"
            className={cn(
              // The header no longer holds at the top of the screen: 8 px under its top, along the list. From lg, it stays
              // with the pitch's column.
              "sticky top-2 z-10 rounded-card border-2 border-dashed bg-card p-3 transition-colors lg:static",
              drag === null ? "border-border" : overBench ? "border-solid border-(--club) bg-(--club)/25" : "border-(--club)/70",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <PanelTitle>{t("bench")}</PanelTitle>
              <p className={cn("text-right text-xs", overBench ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {overBench ? t("dropOnBench") : t("dragToBench")}
              </p>
            </div>
            {/* A column per substitute, BENCH_SIZE at most, wide enough for a rating and a position at 360 px: the squad's
                lines have their names. */}
            <ol className="mt-2 grid grid-cols-7 gap-1">
              {state.bench.map((key, index) => {
                const player = byKey.get(key);
                if (player === undefined) {
                  return null;
                }
                const name = `${player.firstName} ${player.lastName}`;
                return (
                  <li
                    key={key}
                    data-bench-player-key={key}
                    data-testid="lineup-bench-player"
                    title={t("substituteTitle", { number: index + 1, name })}
                    className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg bg-muted py-1"
                  >
                    <SlotRating player={player} position={selectedPosition} className="text-lg leading-none" />
                    <PositionBadge position={player.position} />
                    <span className="sr-only">{name}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <LineupSquad
          players={players}
          starters={state.starters}
          bench={state.bench}
          position={selectedPosition}
          activeKey={selectedKey ?? sheetKey}
          draggedKey={drag?.source.key ?? null}
          onLineClick={clickLine}
          sourceProps={sourceProps}
          selection={
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 px-1" data-testid="lineup-selection">
              {selectedPosition === null ? (
                <p className="text-sm text-muted-foreground">{t("selectHint")}</p>
              ) : (
                <>
                  <p className="text-sm">
                    {t("selectedSlot")}{" "}
                    <span className={cn("font-heading font-bold", positionTextClass(selectedPosition))}>
                      {tPositions(`short.${selectedPosition}`)}
                    </span>{" "}
                    {tPositions(`label.${selectedPosition}`)}
                    {selectedPlayer !== undefined && ` · ${selectedPlayer.firstName} ${selectedPlayer.lastName}`}
                  </p>
                  {selectedPlayer !== undefined && (
                    <div className="flex flex-wrap gap-2">
                      {/* The only way to a starter's sheet on a phone, whose lines leave out the eleven. */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onChoose(selectedPlayer.id);
                          setSheetOpen(true);
                        }}
                        className="xl:hidden"
                        data-testid="lineup-open-sheet"
                      >
                        <IdCardIcon data-icon="inline-start" />
                        {t("openSheet")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={sendToBench} data-testid="lineup-send-to-bench">
                        <ArmchairIcon data-icon="inline-start" />
                        {t("sendToBench")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          }
        />

        {/* The grid's next free cell from xl, the third column; out of the flow under it, over the page. */}
        {profile !== undefined && (
          <PlayerSheet
            key={profile.id}
            profile={profile}
            startYear={squad.startYear}
            pinned
            onClose={() => setSheetOpen(false)}
            footer={
              <SquadPlayerActions
                saveId={saveId}
                player={profile}
                terms={profile.terms}
                currentDate={squad.currentDate}
                windowOpen={squad.windowOpen}
                nextWindowOpensOn={squad.nextWindowOpensOn}
                primary={false}
              />
            }
          />
        )}
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
