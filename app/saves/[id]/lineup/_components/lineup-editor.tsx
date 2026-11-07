"use client";

import { useTranslations } from "next-intl";
import { SaveIcon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PlayerFace } from "@/src/components/player-face";
import { Button } from "@/src/components/ui/button";
import type { ClubLineupPlayer, LineupEditor as LineupEditorView } from "@/src/db/lineup";
import type { SquadView } from "@/src/db/squad";
import { FORMATIONS, isFormationName, type FormationName } from "@/src/engine/formations";
import type { Instruction } from "@/src/engine/instructions";
import { BENCH_SIZE, changeFormation, isAvailable, resolveLineup, type Lineup, type SavedLineup } from "@/src/engine/lineup";
import type { Position } from "@/src/engine/positions";
import { COMPUTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { cn } from "@/src/lib/utils";
import { SquadPlayerActions } from "../../_components/contract-actions";
import { FitnessStrip } from "../../_components/fitness-gauge";
import { Panel, PanelTitle } from "@/src/components/panel";
import { LineupSummary } from "../../_components/lineup-summary";
import { Pitch } from "../../_components/pitch";
import { CardMark, disciplineBadges, nextMatchCard } from "../../_components/player-badges";
import { PlayerSheet } from "../../_components/player-sheet";
import { PositionBadge, PositionBadges } from "../../_components/position-badge";
import { fitnessFigure } from "../../_lib/fitness";
import { saveLineupAction } from "../actions";
import { slotCandidates } from "../_lib/candidates";
import {
  automaticState,
  moveToBenchFront,
  pinnedSheetKey,
  placeInSlot,
  sendSlotToBench,
  swapSlots,
  type EditorState,
} from "../_lib/editor-moves";
import { FormationPanel, type PanelOpponent } from "./formation-panel";
import { FormationPicker } from "./formation-picker";
import { LineupSquad, SlotRating } from "./lineup-squad";
import { CandidateList, CandidatesSheet, PanelCandidates, SelectedSlot } from "./slot-candidates";
import { StartingInstruction } from "./starting-instruction";
import { BENCH_TARGET, slotTarget, usePointerDrag, type DragSource, type DropTarget } from "./use-pointer-drag";

const SLOT_COUNT = 11;

/** Gap between the pointer and the dragged player's tag. */
const GHOST_OFFSET_PX = 14;

/** From here, the screen's third column: the sheet stands beside the pitch instead of opening over the page. */
const SHEET_COLUMN_QUERY = "(min-width: 80rem)";

/** The starters of a resolved lineup, by slot index. */
function startersOf(lineup: Lineup<ClubLineupPlayer>): (string | null)[] {
  const starters: (string | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
  for (const starter of lineup.starters) {
    starters[starter.index] = starter.player.id;
  }
  return starters;
}

/** What the match will play, except that saved starters now injured or suspended stay in their slot, shown in red. */
function initialState(
  formation: FormationName,
  saved: SavedLineup | null,
  players: readonly ClubLineupPlayer[],
  instruction: Instruction,
): EditorState {
  const resolved = resolveLineup(formation, saved, players);
  const starters = startersOf(resolved);
  const unavailable = new Set(players.filter((player) => !isAvailable(player)).map((player) => player.id));
  for (const { slot, playerKey } of saved?.starters ?? []) {
    if (slot < starters.length && unavailable.has(playerKey) && !starters.includes(playerKey)) {
      starters[slot] = playerKey;
    }
  }
  return {
    formation,
    starters,
    bench: resolved.bench.map((player) => player.id).filter((key) => !starters.includes(key)),
    instruction,
  };
}

const sameState = (a: EditorState, b: EditorState): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The lineup being edited as it is saved: a player key per filled slot, the bench in order, the starting instruction. */
const savedOf = (state: EditorState): SavedLineup => ({
  starters: state.starters.flatMap((playerKey, slot) => (playerKey === null ? [] : [{ slot, playerKey }])),
  benchOrder: state.bench,
  instruction: state.instruction,
});

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
  opponent: PanelOpponent | null; // the next match's, his likely eleven's strength: the page's, the same object across renders
};

/** The screen around the editor: what it has to keep when the editor starts again, the player last chosen. */
export function LineupScreen({ saveId, editor, squad, opponent }: LineupScreenProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  // A new key after each save, and after a sale or a release: the editor starts again from what is now saved, with no
  // key left of a player gone.
  const key = `${editor.formation}:${JSON.stringify(editor.saved)}:${editor.players.map((player) => player.id).join()}`;
  return <LineupEditor key={key} saveId={saveId} editor={editor} squad={squad} opponent={opponent} chosen={chosen} onChoose={setChosen} />;
}

type LineupEditorProps = LineupScreenProps & {
  chosen: string | null; // the player last touched, on the pitch or in the squad
  onChoose: (key: string) => void;
};

/**
 * The lineup editor. Two ways to move players, which do the same: select a slot then pick a player or another slot (the
 * keyboard way), or drag a player onto a slot or onto the bench. A selected slot lists its candidates, best rated there
 * first, one touch away from it: over the page under lg, in place of the squad's lines from there. A line of the squad
 * clicked with no slot selected shows the player's sheet instead, with the actions of the squad screen: over the page
 * under xl, in the third column from there, which also follows the selected slot and is never empty.
 */
function LineupEditor({ saveId, editor, squad, opponent, chosen, onChoose }: LineupEditorProps) {
  const { formation, saved, clubColors, players } = editor;
  const t = useTranslations("lineup");
  const tPlayer = useTranslations("player");
  const [initial] = useState(() => initialState(formation, saved, players, editor.instruction));
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [candidatesSlot, setCandidatesSlot] = useState<number | null>(null); // the last selected: the sheet's, as it closes
  const [sheetOpen, setSheetOpen] = useState(false); // under xl: over the page, until it is closed
  const [pending, startTransition] = useTransition();
  const sheetInColumn = useMediaQuery(SHEET_COLUMN_QUERY);
  const computer = useMediaQuery(COMPUTER_QUERY);
  const { drag, sourceProps } = usePointerDrag((source, target) => {
    setState((current) => applyDrop(current, source, target));
    setSelected(null);
  });

  // From lg, Escape lets the selected slot go, as the cross of the candidates' sheet does under it; not while a player's
  // sheet is over the page, which it closes first, nor from a dialog opened from the sheet.
  const sheetOverPage = sheetOpen && !sheetInColumn;
  useEffect(() => {
    if (!computer || selected === null || sheetOverPage) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const inDialog = event.target instanceof Element && event.target.closest('[role="dialog"]') !== null;
      if (event.key === "Escape" && !inDialog) {
        setSelected(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [computer, selected, sheetOverPage]);

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
      setCandidatesSlot(index);
      // Under lg, its candidates come over the page in place of a player's sheet.
      if (!computer) {
        setSheetOpen(false);
      }
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

  /** A candidate takes the selected slot: from outside the eleven, he sends its player to the bench; a starter exchanges. */
  const pickCandidate = (key: string): void => {
    if (selected === null) {
      return; // the sheet closing, its slot already let go
    }
    onChoose(key);
    setState(placeInSlot(state, selected, key));
    setSelected(null);
  };

  /** The selected starter's sheet: over the page under xl, where it takes the place of the candidates' sheet. */
  const openSelectedSheet = (key: string): void => {
    onChoose(key);
    setSheetOpen(true);
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
    setState({ ...state, formation: value, starters, bench });
    setSelected(null);
  };

  /** A formation of the comparison, with the assistant's eleven in it: the one its row was worked out with. */
  const applyFormation = (value: FormationName): void => {
    setState(automaticState(state, value, players));
    setSelected(null);
  };

  /** The assistant's eleven in the formation: his rule rests the tired, and nobody plays injured or suspended. */
  const automatic = (): void => {
    setState(automaticState(state, state.formation, players));
    setSelected(null);
  };

  /** Fills only the empty slots, keeping every player already placed. */
  const completeEmptySlots = (): void => {
    const starters = startersOf(resolveLineup(state.formation, savedOf(state), players));
    // Injured or suspended starters left in place by the manager stay in their slot, as the editor shows them.
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
        const result = await saveLineupAction(saveId, { formation: state.formation, lineup: savedOf(state) });
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

  // Starters who will miss the match, each counted once: an injured player's suspension is served while he is out.
  const startersOut = state.starters.flatMap((key) => {
    const player = key === null ? undefined : byKey.get(key);
    return player === undefined || isAvailable(player) ? [] : [player];
  });
  const injuredStarters = startersOut.filter((player) => player.injured).length;
  const suspendedStarters = startersOut.length - injuredStarters;
  const selectedKey = selected === null ? null : state.starters[selected];
  const overBench = drag?.over?.kind === "bench";
  const sheetKey = sheetInColumn ? pinnedSheetKey(selectedKey, chosen, players) : sheetOpen ? chosen : null;
  const profile = squad.players.find((player) => player.playerKey === sheetKey);

  // The eleven the match would play now, whose strengths the formation panel shows: the editor's, as the matchday
  // resolves a saved lineup (an injured or suspended starter replaced, an empty slot filled).
  const eleven = useMemo(() => resolveLineup(state.formation, savedOf(state), players), [state, players]);

  // The slot whose candidates show: the selected one, or under lg the last one while its sheet closes.
  const listedSlot = selected ?? candidatesSlot;
  const listedPosition = listedSlot === null ? null : slots[listedSlot].position;
  const listedKey = listedSlot === null ? null : state.starters[listedSlot];
  const candidates = listedSlot === null || listedPosition === null ? [] : slotCandidates(players, state, listedSlot, listedPosition);
  const selection = (named: boolean) =>
    listedPosition !== null && (
      <SelectedSlot
        position={listedPosition}
        player={listedKey === null ? undefined : byKey.get(listedKey)}
        named={named}
        onOpenSheet={() => {
          if (listedKey !== null) {
            openSelectedSheet(listedKey);
          }
        }}
        onSendToBench={sendToBench}
      />
    );

  return (
    <div className="space-y-4">
      {/* Two rows on a phone, with the label left to the screen readers; the same two groups in one row when they fit. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 max-sm:w-full">
          <span aria-hidden className="eyebrow max-sm:hidden">
            {t("formation")}
          </span>
          <FormationPicker formation={state.formation} players={players} tier={editor.tier} onPick={switchFormation} />
          {/* Half the row on a phone, beside the formation: its label goes on two lines there rather than out of it. */}
          <Button
            variant="outline"
            onClick={automatic}
            className="max-sm:h-auto max-sm:flex-1 max-sm:text-center max-sm:leading-tight max-sm:text-balance max-sm:whitespace-normal"
            data-testid="lineup-automatic"
          >
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

      {(emptySlots > 0 || startersOut.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-card px-4 py-2.5 text-sm text-warning" data-testid="lineup-warning">
          <p className="flex-1">
            {[
              emptySlots > 0 && t("incomplete", { count: emptySlots }),
              injuredStarters > 0 && t("injuredStarter", { count: injuredStarters }),
              suspendedStarters > 0 && t("suspendedStarter", { count: suspendedStarters }),
            ]
              .filter((sentence) => sentence !== false)
              .join(" ")}
          </p>
          {emptySlots > 0 && (
            <Button size="sm" variant="outline" onClick={completeEmptySlots} data-testid="lineup-complete">
              {t("complete")}
            </Button>
          )}
        </div>
      )}

      {/* One DOM, the pitch first, its columns placed by CSS. Under lg, a flex column rather than a grid, the pitch's column
          dissolved in it: a grid item would be sticky within its own row only, and the bench stays in sight along the list.
          From lg, the formation's panel takes the first row, under its choice. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[17rem_minmax(0,1fr)_18.5rem] 2xl:grid-cols-[19rem_minmax(0,1fr)_22rem]">
        {/* Held in sight from lg: a player is carried to it from the foot of the list. */}
        <div className="max-lg:contents lg:sticky lg:top-8 lg:col-start-2 lg:row-start-2 lg:space-y-3 lg:self-start">
          <div className="mx-auto w-full max-w-lg space-y-2 lg:max-w-none">
            {/* From lg, no taller than leaves the screen room for the summary and the bench, sticky as they are. */}
            <div className="mx-auto lg:max-w-[max(20rem,calc((100dvh-13.5rem)*68/105))]">
              <Pitch
                slots={slots}
                starters={state.starters}
                players={byKey}
                clubColors={clubColors}
                label={t("myEleven")}
                fitnessAt="nextMatch"
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
                lines have their names. His fitness along the tile's foot, as under a name on the pitch; the rating in red
                when he cannot play, and the referee's card in the corner, as on his face on the pitch. */}
            <ol className="mt-2 grid grid-cols-7 gap-1">
              {state.bench.map((key, index) => {
                const player = byKey.get(key);
                if (player === undefined) {
                  return null;
                }
                const name = `${player.firstName} ${player.lastName}`;
                const states = [
                  tPlayer("fitnessAt.nextMatch", { fitness: fitnessFigure(player.fitness) }),
                  ...(player.injured ? [t("injured")] : []),
                  ...disciplineBadges(player.discipline, tPlayer).map(({ label }) => label),
                ];
                const card = nextMatchCard(player.discipline);
                return (
                  <li
                    key={key}
                    data-bench-player-key={key}
                    data-testid="lineup-bench-player"
                    title={[t("substituteTitle", { number: index + 1, name }), ...states].join(" · ")}
                    className="relative flex min-w-0 flex-col items-center gap-0.5 overflow-hidden rounded-lg bg-muted pt-1 pb-2"
                  >
                    <SlotRating
                      player={player}
                      position={selectedPosition}
                      className={cn("text-lg leading-none", !isAvailable(player) && "text-loss")}
                    />
                    <PositionBadge position={player.position} />
                    <span className="sr-only">{[name, ...states].join(", ")}</span>
                    {card !== null && <CardMark tone={card} className="absolute top-1 right-1" />}
                    <FitnessStrip fitness={player.fitness} className="bg-background/60" />
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        {/* The formation's profile, the strengths of the eleven beside the next opponent's, the seven formations compared;
            then the instruction the match starts with, saved with the lineup. From lg, the grid's first row, side by side;
            under lg, after the bench: the pitch first on a phone, and the list after them. */}
        <div className="grid grid-cols-1 gap-4 lg:col-span-full lg:row-start-1 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <FormationPanel formation={state.formation} eleven={eleven} players={players} opponent={opponent} onApply={applyFormation} />
          <Panel className="p-4 sm:p-5">
            <StartingInstruction value={state.instruction} onChange={(instruction) => setState({ ...state, instruction })} />
          </Panel>
        </div>

        <LineupSquad
          players={players}
          slots={slots}
          starters={state.starters}
          bench={state.bench}
          position={selectedPosition}
          activeKey={selectedKey ?? sheetKey}
          draggedKey={drag?.source.key ?? null}
          onLineClick={clickLine}
          sourceProps={sourceProps}
          selection={
            computer && selected !== null ? selection(true) : <p className="px-1 text-sm text-muted-foreground">{t("selectHint")}</p>
          }
          candidates={
            computer && selected !== null && listedPosition !== null ? (
              <PanelCandidates position={listedPosition} onBack={() => setSelected(null)}>
                <CandidateList
                  candidates={candidates}
                  slots={slots}
                  position={listedPosition}
                  draggedKey={drag?.source.key ?? null}
                  onPick={pickCandidate}
                  sourceProps={sourceProps}
                />
              </PanelCandidates>
            ) : null
          }
        />

        {/* Under lg, over the page, until a candidate is picked or the slot let go. Never with a player's sheet, which its
            player's button opens in its place, and which gives it back once closed. */}
        <CandidatesSheet
          open={!computer && selected !== null && !sheetOpen}
          position={listedPosition}
          onClose={() => setSelected(null)}
          selection={selection(false)}
        >
          {listedPosition !== null && (
            <CandidateList candidates={candidates} slots={slots} position={listedPosition} onPick={pickCandidate} />
          )}
        </CandidatesSheet>

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
