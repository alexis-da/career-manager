"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CheckIcon, LoaderCircleIcon, RefreshCwIcon, RotateCwIcon, SparklesIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { isNewVersionError } from "@/app/_lib/new-version";
import Link from "@/src/components/link";
import { PlayerFace } from "@/src/components/player-face";
import { Button, buttonVariants } from "@/src/components/ui/button";
import type {
  ClubLineupPlayer,
  ExpectedLineup,
  LineupEditor as LineupEditorView,
  LineupPlanResult,
  LineupSaveResult,
} from "@/src/db/lineup";
import type { SquadView } from "@/src/db/squad";
import { FORMATIONS, isFormationName, type FormationName } from "@/src/engine/formations";
import type { Instruction } from "@/src/engine/instructions";
import { BENCH_SIZE, changeFormation, isAvailable, resolveLineup, type Lineup, type SavedLineup } from "@/src/engine/lineup";
import type { Position } from "@/src/engine/positions";
import { COMPUTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { cn } from "@/src/lib/utils";
import type { ShopShortcuts } from "@/src/db/shop";
import { SquadPlayerActions } from "../../_components/contract-actions";
import { FitnessStrip } from "../../_components/fitness-gauge";
import { Panel, PanelTitle } from "@/src/components/panel";
import { LineupSummary } from "../../_components/lineup-summary";
import { Pitch } from "../../_components/pitch";
import { CardMark, disciplineBadges, nextMatchCard } from "../../_components/player-badges";
import { PlayerSheet } from "../../_components/player-sheet";
import { PointerText } from "../../_components/pointer-text";
import { PositionBadge, PositionBadges } from "../../_components/position-badge";
import { fitnessFigure } from "../../_lib/fitness";
import { setAssistantSettingAction } from "../../club/actions";
import { saveLineupAction, saveLineupPlanAction } from "../actions";
import { slotCandidates } from "../_lib/candidates";
import * as saves from "../_lib/save-queue";
import {
  automaticState,
  moveToBenchFront,
  pinnedSheetKey,
  placeInSlot,
  restedOf,
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

/**
 * The eleven shown while no lineup is saved, the one the match then plays: the best available at each slot (a club's
 * player's: resolveLineup without a saved lineup, selectLineup), or the assistant's, his tired players rested where a
 * rested one is hardly worse (a nation's: its coach's match plays chooseFormation's eleven, in the formation the editor
 * opens on).
 */
export type UnsavedEleven = "best" | "assistant";

/**
 * Who makes a club's line-up (docs/design/simplification.md § 3): its assistant, whose eleven the editor opens on and the
 * formation and the instruction only shape until a gesture on a player, or its player, whose saved line-up it opens on.
 * A nation's editor has neither (LineupEditor.byAssistant absent): its coach's own line-up, saved or his assistant's.
 */
type LineupMode = "assistant" | "player" | null;

const modeOf = (editor: LineupEditorView): LineupMode =>
  editor.byAssistant === undefined ? null : editor.byAssistant ? "assistant" : "player";

/**
 * What the match will play: the assistant's eleven of the next match when he makes the line-up (automaticState, the
 * Jeunesse objective's young player with it); otherwise the saved line-up, except that saved starters now injured or
 * suspended stay in their slot, shown in red.
 */
function initialState(editor: LineupEditorView, unsaved: UnsavedEleven): EditorState {
  const { formation, saved, players, instruction } = editor;
  if (modeOf(editor) === "assistant" || (saved === null && unsaved === "assistant")) {
    return automaticState({ formation, starters: [], bench: [], instruction }, formation, players, editor.youth ?? null);
  }
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

/**
 * The Server Action each gesture sends (docs/design/effectif-adjoint.md § 1): the club's lineup (saveLineupAction), or his
 * nation's for a national coach, with what the editor believes saved.
 */
export type SaveLineupAction = (
  saveId: string,
  input: { formation: FormationName; lineup: SavedLineup; expected: ExpectedLineup },
) => Promise<LineupSaveResult>;

/** The Server Action a club's formation or starting instruction calls while its assistant makes the line-up. */
export type SaveLineupPlanAction = (saveId: string, input: { formation: FormationName; instruction: Instruction }) => Promise<LineupPlanResult>;

/** The words of the editor a nation's coach reads in place of the club's, the page's in its language. */
export type LineupScreenTexts = {
  selectHint: { touch: string; click: string }; // under the squad's title, no slot selected: what a line does
  pickerAbout: string; // how the formation picker ranks the formations, against which average opponent
};

type LineupScreenProps = {
  saveId: string;
  editor: LineupEditorView;
  // The squad screen's players: a player's sheet, with the club's actions on him (contract, sale, express care). A
  // nation's editor has none: no sheet, a line of the list is only a player to place.
  squad?: SquadView;
  opponent: PanelOpponent | null; // the next match's, his likely eleven's strength: the page's, the same object across renders
  care?: ShopShortcuts["care"]; // express care in the shop, for the sheet of an injured player
  saveAction?: SaveLineupAction; // the club's by default
  planAction?: SaveLineupPlanAction; // the club's by default, while its assistant makes the line-up
  unsaved?: UnsavedEleven; // the club's by default: the best available at each slot
  texts?: LineupScreenTexts; // the club's by default, the lineup messages'
  // Where the match waiting live goes on, while one does: the screen is read only until its final whistle (§ 1.7).
  liveHref?: string | null;
};

/**
 * The screen around the editor: what it has to keep when the editor starts again (the player last chosen), when the
 * editor starts again, and the save's other screens read again as it goes.
 */
export function LineupScreen(props: LineupScreenProps) {
  const { editor } = props;
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);
  // « Voir la dernière », after a conflict with another tab: the editor starts again once the page has read the line-up
  // anew, from the editor the refresh brings (a new object, whatever it holds), never from the one it had.
  const [reload, setReload] = useState<{ from: LineupEditorView | null; count: number }>({ from: null, count: 0 });
  if (reload.from !== null && reload.from !== editor) {
    setReload({ from: null, count: reload.count + 1 });
  }
  // Saved during the visit: the save's other screens, which the browser's back may show from the router's cache, are
  // read again as the screen goes; the editor's own saves read nothing again (docs/design/effectif-adjoint.md § 1.3).
  const savedThisVisit = useRef(false);
  useEffect(() => {
    const visit = savedThisVisit;
    return () => {
      if (visit.current) {
        router.refresh();
      }
    };
  }, [router]);
  // A new key whenever what is saved comes back different (another tab, a sale or a release: a new list of 23 for a
  // nation), and whenever the eleven the assistant would field may change: who makes the line-up, the next match, a
  // player's fitness, injury or suspension, the Jeunesse objective's young player. The editor starts again from what now
  // holds, with no key left of a player gone.
  const squadKey = editor.players.map((player) => `${player.id}/${player.fitness}/${Number(player.injured)}/${Number(player.suspended)}`).join();
  const key = [
    editor.byAssistant,
    editor.formation,
    JSON.stringify(editor.saved),
    JSON.stringify(editor.youth ?? null),
    editor.matchDate.getTime(),
    squadKey,
    reload.count,
  ].join(":");
  return (
    <LineupEditor
      key={key}
      {...props}
      chosen={chosen}
      onChoose={setChosen}
      onSaved={() => {
        savedThisVisit.current = true;
      }}
      onReload={() => {
        setReload({ from: editor, count: reload.count });
        router.refresh();
      }}
    />
  );
}

type LineupEditorProps = LineupScreenProps & {
  chosen: string | null; // the player last touched, on the pitch or in the squad
  onChoose: (key: string) => void;
  onSaved: () => void; // a save of the visit went through
  onReload: () => void; // reads the line-up anew, then starts the editor again from it
};

/** How long a save may run before the status line says so: nothing blinks on a good connection (§ 1.4). */
const SAVING_SHOWN_AFTER_MS = 400;

/** A save without an answer this long is shown as not saved, « Réessayer » offered; its answer may still come (§ 1.4). */
const SAVE_STALLED_AFTER_MS = 20_000;

/** Where the editor's saving stands, which its status line says (docs/design/effectif-adjoint.md § 1.2, 1.6). */
type SaveState = "saved" | "saving" | "failed" | "conflict";

/** A gesture of the visit, for « Annuler »: the state before it, and who made the line-up then. */
type Step = { state: EditorState; mode: LineupMode };

/** Whether every slot of the eleven has its player: only then is a line-up sent (§ 1.2). */
const completeEleven = (state: EditorState): boolean => state.starters.every((key) => key !== null);

/** Why a save of the editor was refused. */
type SaveRefusal = Extract<LineupSaveResult, { ok: false }>["reason"] | Extract<LineupPlanResult, { ok: false }>["reason"];

/**
 * The lineup editor. Two ways to move players, which do the same: select a slot then pick a player or another slot (the
 * keyboard way), or drag a player onto a slot or onto the bench. A selected slot lists its candidates, best rated there
 * first, one touch away from it: over the page under lg, in place of the squad's lines from there. With the squad
 * screen's players (a club's), a line of the squad clicked with no slot selected shows the player's sheet instead, with
 * the actions of the squad screen: over the page under xl, in the third column from there, which also follows the
 * selected slot and is never empty. A nation's editor has no sheet, nor that third column.
 *
 * A club's line-up (docs/design/simplification.md § 3.2, 3.3; docs/design/effectif-adjoint.md § 1): while its assistant
 * makes it, the editor shows his eleven of the next match, and a formation or a starting instruction picked is saved at
 * once, his still. Every gesture on a player is saved at once too, the first taking the line-up from him, which a discreet
 * card says once, with « Rendre la main à l'adjoint »; « Annuler » goes back one gesture of the visit, the one that took
 * the line-up giving it back. An eleven with an empty slot is never sent. One save at a time, the latest state sent once
 * the one on its way answers; each says what it believes saved, so that a line-up changed in another tab is never
 * overwritten unseen. A nation's editor saves the same way, without an assistant to take the line-up from. While a match
 * waits live (`liveHref`), the screen is read only.
 */
function LineupEditor({
  saveId,
  editor,
  squad,
  opponent,
  care = null,
  saveAction = saveLineupAction,
  planAction = saveLineupPlanAction,
  unsaved = "best",
  texts,
  liveHref = null,
  chosen,
  onChoose,
  onSaved,
  onReload,
}: LineupEditorProps) {
  const { clubColors, players } = editor;
  const t = useTranslations("lineup");
  const tPlayer = useTranslations("player");
  const common = useTranslations("common");
  const router = useRouter();
  const youth = editor.youth ?? null;
  // Who makes the line-up as the editor knows it: the first gesture on a player takes it from the assistant at once.
  const [mode, setMode] = useState<LineupMode>(() => modeOf(editor));
  const [state, setState] = useState(() => initialState(editor, unsaved));
  const [history, setHistory] = useState<Step[]>([]); // the visit's gestures, for « Annuler »
  const [tookHand, setTookHand] = useState(false); // a gesture of this visit took the line-up from the assistant
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState(false); // a save on its way, waiting its turn, or lost
  // A line-up of the player's own saved, with its eleven: until then the one shown is « pas encore enregistré ».
  const [everSaved, setEverSaved] = useState(editor.saved !== null && editor.saved.starters.length > 0);
  const [selected, setSelected] = useState<number | null>(null);
  const [candidatesSlot, setCandidatesSlot] = useState<number | null>(null); // the last selected: the sheet's, as it closes
  const [sheetOpen, setSheetOpen] = useState(false); // under xl: over the page, until it is closed
  const [pending, startTransition] = useTransition();
  const sheetInColumn = useMediaQuery(SHEET_COLUMN_QUERY);
  const computer = useMediaQuery(COMPUTER_QUERY);
  // The state shown and who makes the line-up, for a drop: the drag's callback may be one of an earlier render.
  const latest = useRef(state);
  const latestMode = useRef(mode);
  // What the editor believes saved, sent with each save: what it read, then what its own saves left (§ 1.5).
  const known = useRef<ExpectedLineup>({
    formation: editor.formation,
    lineup: editor.saved,
    ...(editor.byAssistant === undefined ? {} : { byAssistant: editor.byAssistant }),
  });
  const queue = useRef(saves.emptyQueue<EditorState>()); // its saves (save-queue.ts), out of React's state

  const show = (next: EditorState): void => {
    latest.current = next;
    setState(next);
  };

  /** The queue as it now stands: whether a save is on its way, waiting or lost shows at once. */
  const setQueue = (next: saves.SaveQueue<EditorState>): void => {
    queue.current = next;
    setBusy(saves.busyOf(next));
  };

  /** Why the save on its way was refused, as the editor answers it (§ 1.6). */
  const refused = (reason: SaveRefusal, message: string): void => {
    if (reason === "conflict" || reason === "player") {
      // Another tab changed the line-up, took it or gave it back: nothing more is sent until it is read again.
      setQueue(saves.blocked(queue.current));
      setSaveState("conflict");
      return;
    }
    if (reason === "live") {
      // A match waits live: the page read again shows the screen read only.
      setQueue(saves.blocked(queue.current));
      router.refresh();
      return;
    }
    toast.error(message);
    if (reason === "not-in-squad") {
      // A player sold or released elsewhere: the editor starts again from what is saved, read anew.
      setQueue(saves.blocked(queue.current));
      onReload();
      return;
    }
    setSaveState("failed");
  };

  /**
   * Sends the save waiting, one at a time: once it answers, the latest state waiting. A lost answer is tried again after
   * 2, 5 then 15 s, then « Réessayer » is offered; the same state sent again is only `unchanged` (§ 1.3, 1.4).
   */
  const send = async (): Promise<void> => {
    const next = saves.nextToSend(queue.current);
    setQueue(next.queue);
    const { job } = next;
    if (job === null) {
      return;
    }
    const slow = window.setTimeout(() => setSaveState("saving"), SAVING_SHOWN_AFTER_MS);
    const stalled = window.setTimeout(() => setSaveState("failed"), SAVE_STALLED_AFTER_MS);
    let retryIn: number | null = null;
    try {
      if (job.kind === "plan") {
        const result = await planAction(saveId, { formation: job.state.formation, instruction: job.state.instruction });
        setQueue(saves.answered(queue.current));
        if (result.ok) {
          known.current = { formation: job.state.formation, lineup: result.saved, byAssistant: true };
          onSaved();
          setSaveState("saved");
        } else {
          refused(result.reason, result.message);
        }
      } else {
        const lineup = savedOf(job.state);
        const result = await saveAction(saveId, { formation: job.state.formation, lineup, expected: known.current });
        setQueue(saves.answered(queue.current));
        if (result.ok) {
          known.current = {
            formation: job.state.formation,
            lineup,
            ...(known.current.byAssistant === undefined ? {} : { byAssistant: false }),
          };
          onSaved();
          setEverSaved(true);
          setSaveState("saved");
        } else {
          refused(result.reason, result.message);
        }
      }
    } catch (error) {
      const newVersion = isNewVersionError(error);
      const step = saves.lost(queue.current, job, newVersion);
      setQueue(step.queue);
      retryIn = step.retryIn;
      if (retryIn !== null) {
        // Tried again soon: still on its way, as far as the player is concerned, however fast it failed.
        setSaveState("saving");
      } else {
        setSaveState("failed");
        if (newVersion) {
          toast.error(common("newVersion"));
        }
      }
    } finally {
      window.clearTimeout(slow);
      window.clearTimeout(stalled);
    }
    if (retryIn !== null) {
      window.setTimeout(() => {
        setQueue(saves.retryDue(queue.current));
        void send();
      }, retryIn);
    }
    // The latest gesture's state, if one waits its turn.
    void send();
  };

  /** A save to send: the latest replaces any waiting; an eleven with an empty slot is never sent (§ 1.2). */
  const save = (job: saves.SaveJob<EditorState>): void => {
    setQueue(saves.enqueue(queue.current, job, completeEleven(job.state)));
    void send();
  };

  /** The editor's latest state as it is saved: its formation and instruction alone while the assistant makes it. */
  const latestJob = (): saves.SaveJob<EditorState> => ({
    kind: latestMode.current === "assistant" ? "plan" : "lineup",
    state: latest.current,
  });

  /**
   * A gesture on a player (§ 1.2): shown at once, the state before it kept for « Annuler », then saved; the first one
   * takes the line-up from the assistant, which a discreet card says once.
   */
  const commit = (next: EditorState): void => {
    const before = latest.current;
    if (sameState(next, before)) {
      return;
    }
    setHistory((steps) => [...steps, { state: before, mode: latestMode.current }]);
    show(next);
    if (latestMode.current === "assistant") {
      latestMode.current = "player";
      setMode("player");
      setTookHand(true);
    }
    save({ kind: "lineup", state: next });
  };

  /**
   * While the assistant makes the line-up: his eleven in the formation and with the instruction picked, shown at once and
   * saved, his still (docs/design/simplification.md § 3.2); undone like a gesture.
   */
  const plan = (next: EditorState): void => {
    const before = latest.current;
    setSelected(null);
    if (sameState(next, before)) {
      return;
    }
    setHistory((steps) => [...steps, { state: before, mode: latestMode.current }]);
    show(next);
    save({ kind: "plan", state: next });
  };

  const { drag, sourceProps } = usePointerDrag((source, target) => {
    commit(applyDrop(latest.current, source, target));
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
    commit(swapSlots(state, selected, index));
    setSelected(null);
  };

  /** With a slot selected, the player of the line goes there, a starter by exchanging their slots; else, his sheet. */
  const clickLine = (key: string): void => {
    onChoose(key);
    if (selected === null) {
      // Without sheets (a nation's editor), the line is only a player to place in a slot, or to drag onto one.
      if (squad !== undefined) {
        setSheetOpen(true);
      }
      return;
    }
    commit(placeInSlot(state, selected, key));
    setSelected(null);
  };

  /** A candidate takes the selected slot: from outside the eleven, he sends its player to the bench; a starter exchanges. */
  const pickCandidate = (key: string): void => {
    if (selected === null) {
      return; // the sheet closing, its slot already let go
    }
    onChoose(key);
    commit(placeInSlot(state, selected, key));
    setSelected(null);
  };

  /** The selected starter's sheet: over the page under xl, where it takes the place of the candidates' sheet. */
  const openSelectedSheet = (key: string): void => {
    onChoose(key);
    setSheetOpen(true);
  };

  const sendToBench = (): void => {
    if (selected !== null) {
      commit(sendSlotToBench(state, selected));
    }
    setSelected(null);
  };

  /**
   * The formation: while the assistant makes the line-up, his eleven in it, saved at once, his still (point 1.A: the
   * formation never takes the line-up from him); else the player's eleven kept where it fits, a gesture saved.
   */
  const switchFormation = (value: string): void => {
    if (!isFormationName(value) || value === state.formation) {
      return;
    }
    if (mode === "assistant") {
      plan(automaticState(state, value, players, youth));
      return;
    }
    const starters = changeFormation(state.formation, value, state.starters, players);
    const leaving = state.starters.filter((key): key is string => key !== null && !starters.includes(key));
    const bench = [...leaving, ...state.bench]
      .filter((key, index, keys) => !starters.includes(key) && keys.indexOf(key) === index)
      .slice(0, BENCH_SIZE);
    commit({ ...state, formation: value, starters, bench });
    setSelected(null);
  };

  /** A formation of the comparison, with the assistant's eleven in it: the one its row was worked out with. */
  const applyFormation = (value: FormationName): void => {
    const next = automaticState(state, value, players, youth);
    if (mode === "assistant") {
      plan(next);
      return;
    }
    commit(next);
    setSelected(null);
  };

  /** The starting instruction: saved at once, the assistant keeping the line-up while he makes it (point 1.A). */
  const pickInstruction = (instruction: Instruction): void => {
    if (mode === "assistant") {
      plan({ ...state, instruction });
      return;
    }
    commit({ ...state, instruction });
  };

  /** A nation's « Composition automatique »: the assistant's eleven in the formation, the tired rested, nobody out. */
  const automatic = (): void => {
    commit(automaticState(state, state.formation, players, youth));
    setSelected(null);
  };

  /**
   * « Rendre la main à l'adjoint »: his eleven before each match again, the saved line-up kept, unread. Nothing more is
   * sent: the page read again starts the editor over, in his way.
   */
  const handBack = (): void => {
    setQueue(saves.blocked(queue.current));
    startTransition(async () => {
      try {
        const result = await setAssistantSettingAction(saveId, "lineup", true);
        if (result.ok) {
          toast.success(result.message);
          return;
        }
        toast.error(result.message);
      } catch (error) {
        toast.error(isNewVersionError(error) ? common("newVersion") : t("saveFailed"));
      }
      // Still his: the editor goes on, what it shows sent again in case a gesture was waiting (`unchanged` otherwise).
      setQueue(saves.unblocked(queue.current));
      save(latestJob());
    });
  };

  /** « Annuler »: back one gesture of the visit, saved; the one that took the line-up gives it back to the assistant. */
  const undo = (): void => {
    const step = history.at(-1);
    if (step === undefined) {
      return;
    }
    setHistory((steps) => steps.slice(0, -1));
    setSelected(null);
    if (step.mode === "assistant" && latestMode.current === "player") {
      handBack();
      return;
    }
    show(step.state);
    save({ kind: step.mode === "assistant" ? "plan" : "lineup", state: step.state });
  };

  /** « Réessayer »: the latest state sent again, the one lost forgotten. */
  const retry = (): void => {
    setSaveState("saving");
    const job = latestJob();
    setQueue(saves.retried(queue.current, job, completeEleven(job.state)));
    void send();
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
    commit({ ...state, starters, bench: state.bench.filter((key) => !starters.includes(key)) });
  };

  const emptySlots = state.starters.filter((key) => key === null).length;
  // What the status line says (§ 1.2): a conflict or a lost save first, then an empty slot, with which nothing is sent;
  // the eleven the match plays while the player has never saved his own (a nation's assistant's, or the best available
  // where the settings took the line-up from the club's assistant), until the first gesture saves it.
  const shown: SaveState | "incomplete" | "automatic" =
    saveState === "conflict" || saveState === "failed"
      ? saveState
      : emptySlots > 0
        ? "incomplete"
        : saveState === "saved" && mode !== "assistant" && !everSaved
          ? "automatic"
          : saveState;

  // Leaving the page with a gesture not saved yet: the browser asks first, in that case only (§ 1.4).
  const unsavedGesture = busy || saveState === "failed" || (history.length > 0 && emptySlots > 0);
  useEffect(() => {
    if (!unsavedGesture) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsavedGesture]);

  // Starters who will miss the match, each counted once: an injured player's suspension is served while he is out.
  const startersOut = state.starters.flatMap((key) => {
    const player = key === null ? undefined : byKey.get(key);
    return player === undefined || isAvailable(player) ? [] : [player];
  });
  const injuredStarters = startersOut.filter((player) => player.injured).length;
  const suspendedStarters = startersOut.length - injuredStarters;
  const selectedKey = selected === null ? null : state.starters[selected];
  const overBench = drag?.over?.kind === "bench";
  const sheetKey =
    squad === undefined ? null : sheetInColumn ? pinnedSheetKey(selectedKey, chosen, players) : sheetOpen ? chosen : null;
  const profile = squad?.players.find((player) => player.playerKey === sheetKey);

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
        onOpenSheet={
          squad === undefined
            ? undefined
            : () => {
                if (listedKey !== null) {
                  openSelectedSheet(listedKey);
                }
              }
        }
        onSendToBench={sendToBench}
      />
    );

  // The tired players the assistant's eleven rests: his card names them.
  const rested = mode === "assistant" ? restedOf(players, state.formation, state.starters) : [];
  // The status line's words: who makes the eleven, or where its save stands (docs/design/effectif-adjoint.md § 1.2).
  const statusText =
    shown === "incomplete"
      ? t("status.incomplete", { count: emptySlots })
      : shown === "failed"
        ? t("status.failed")
        : shown === "conflict"
          ? t("status.conflict")
          : mode === "assistant"
            ? t("status.assistant")
            : shown === "saving"
              ? t("status.saving")
              : shown === "automatic"
                ? t("notSaved")
                : t("status.saved");
  const warning = shown === "incomplete" || shown === "failed" || shown === "conflict";
  const statusIcon = warning ? (
    <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
  ) : shown === "saving" ? (
    <LoaderCircleIcon aria-hidden className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
  ) : (
    <CheckIcon aria-hidden className="size-4 shrink-0" />
  );
  const handBackButton = (
    <Button variant="outline" className="h-9 px-4" disabled={pending} onClick={handBack} data-testid="lineup-hand-back">
      <SparklesIcon data-icon="inline-start" />
      {t("handBack")}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* A match waiting live (§ 1.7): the line-up is that match's until its final whistle, changed in its Coaching; the
          screen below is read only. « Reprendre le match » is its one useful action, in orange: here under lg, where the
          screen has no game action; from lg, the sidebar's card has it, in orange on this screen (§ 1.9). */}
      {liveHref !== null && (
        <Panel data-testid="lineup-live" className="space-y-2.5 p-4 sm:p-5">
          <PanelTitle>{t("live.title")}</PanelTitle>
          <p className="text-sm">{t("live.about")}</p>
          <Link href={liveHref} className={cn(buttonVariants({ variant: "club" }), "max-sm:min-h-11 lg:hidden")} data-testid="lineup-live-resume">
            {t("live.resume")}
          </Link>
        </Panel>
      )}

      <div inert={liveHref !== null} className={cn("space-y-4", liveHref !== null && "opacity-60")}>
      {/* The assistant's way (docs/design/simplification.md § 6.3): what he does before each match, whom he rests now, and
          how to make one's own eleven. The same card until the first gesture on a player, which takes the line-up. */}
      {mode === "assistant" && (
        <Panel data-testid="lineup-assistant" className="space-y-1.5 p-4 sm:p-5">
          <PanelTitle>{t("assistant.title")}</PanelTitle>
          <p className="text-sm">{t("assistant.about")}</p>
          {rested.length > 0 && (
            <p data-testid="lineup-rested" className="text-sm text-muted-foreground">
              {t("assistant.rested", {
                players: rested
                  .map((player) => t("assistant.restedPlayer", { name: player.lastName, fitness: fitnessFigure(player.fitness) }))
                  .join(", "),
              })}
            </p>
          )}
          <p className="text-[0.8125rem] leading-snug text-muted-foreground">
            <PointerText touch={t("assistant.hint.touch")} click={t("assistant.hint.click")} />
          </p>
        </Panel>
      )}

      {/* Two rows on a phone, with the label left to the screen readers; the same two groups in one row when they fit. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 max-sm:w-full">
          <span aria-hidden className="eyebrow max-sm:hidden">
            {t("formation")}
          </span>
          <FormationPicker
            formation={state.formation}
            players={players}
            tier={editor.tier}
            about={texts?.pickerAbout}
            onPick={switchFormation}
          />
          {/* A nation's: half the row on a phone, beside the formation, its label on two lines there rather than out of it.
              A club's assistant makes its eleven himself, before each match: no such button. */}
          {mode === null && (
            <Button
              variant="outline"
              onClick={automatic}
              className="max-sm:h-auto max-sm:flex-1 max-sm:text-center max-sm:leading-tight max-sm:text-balance max-sm:whitespace-normal"
              data-testid="lineup-automatic"
            >
              <SparklesIcon data-icon="inline-start" />
              {t("automatic")}
            </Button>
          )}
        </div>
        {/* Who makes the eleven, or where its save stands (docs/design/effectif-adjoint.md § 1.2): no button to save,
            every gesture is. Then what the line can offer: « Réessayer », « Voir la dernière », « Annuler », and « Rendre
            la main à l'adjoint » unless the card under it, after the gesture that took the line-up, offers it. The status
            takes the row on a phone, the buttons the next. */}
        {liveHref === null && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 max-sm:w-full">
            {/* Read politely as it changes, a lost save or a conflict at once (§ 1.2). `data-busy`: a save on its way,
                waiting its turn or lost, which the end-to-end tests wait out after a gesture. */}
            <p
              role={shown === "failed" || shown === "conflict" ? "alert" : "status"}
              className={cn("flex items-center gap-1.5 text-sm max-sm:w-full", warning ? "text-warning" : "text-muted-foreground")}
              data-testid="lineup-status"
              data-mode={mode ?? undefined}
              data-save={shown}
              data-busy={busy}
            >
              {statusIcon}
              <span>{statusText}</span>
            </p>
            {shown === "failed" && (
              <Button variant="outline" className="h-9 px-4" onClick={retry} data-testid="lineup-retry">
                <RotateCwIcon data-icon="inline-start" />
                {t("retry")}
              </Button>
            )}
            {shown === "conflict" && (
              <Button variant="outline" className="h-9 px-4" onClick={onReload} data-testid="lineup-reload">
                <RefreshCwIcon data-icon="inline-start" />
                {t("reload")}
              </Button>
            )}
            {history.length > 0 && shown !== "conflict" && (
              <Button variant="outline" className="h-9 px-4" disabled={pending} onClick={undo} data-testid="lineup-cancel">
                <Undo2Icon data-icon="inline-start" />
                {t("cancel")}
              </Button>
            )}
            {mode === "player" && !tookHand && shown !== "conflict" && handBackButton}
          </div>
        )}
      </div>

      {/* Once, under the status line, after the gesture that took the line-up from the assistant (§ 1.2). */}
      {liveHref === null && mode === "player" && tookHand && shown !== "conflict" && (
        <Panel data-testid="lineup-took-hand" className="space-y-2.5 p-4 sm:p-5">
          <p className="text-sm">{t("tookHand")}</p>
          {handBackButton}
        </Panel>
      )}

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
          From lg, the formation's panel takes the first row, under its choice. From xl, a third column for the player's
          sheet; none without sheets (a nation's editor). */}
      <div
        className={cn(
          "flex flex-col gap-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-5",
          squad === undefined
            ? "2xl:grid-cols-[19rem_minmax(0,1fr)]"
            : "xl:grid-cols-[17rem_minmax(0,1fr)_18.5rem] 2xl:grid-cols-[19rem_minmax(0,1fr)_22rem]",
        )}
      >
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
            <StartingInstruction value={state.instruction} onChange={pickInstruction} />
          </Panel>
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
            computer && selected !== null ? (
              selection(true)
            ) : (
              <p className="px-1 text-sm text-muted-foreground">
                <PointerText
                  touch={texts?.selectHint.touch ?? t("selectHint.touch")}
                  click={texts?.selectHint.click ?? t("selectHint.click")}
                />
              </p>
            )
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
        {squad !== undefined && profile !== undefined && (
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
                care={care}
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
    </div>
  );
}
