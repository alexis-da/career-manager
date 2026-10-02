"use client";

import { ArmchairIcon, SaveIcon, SparklesIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import type { LineupPlayer } from "@/src/db/lineup";
import { FORMATION_NAMES, FORMATIONS, isFormationName, type FormationName } from "@/src/engine/formations";
import { BENCH_SIZE, changeFormation, resolveLineup, type SavedLineup } from "@/src/engine/lineup";
import { POSITION_GROUPS, positionGroup, ratingAt, type Position, type PositionGroup } from "@/src/engine/positions";
import { cn } from "@/src/lib/utils";
import { Panel, PanelTitle } from "../../_components/panel";
import { POSITION_LABEL, POSITION_SHORT, positionTextClass } from "../../_lib/positions";
import { saveLineupAction } from "../actions";
import { Pitch } from "./pitch";

type EditorState = {
  formation: FormationName;
  starters: (string | null)[]; // player key per slot index
  bench: string[]; // substitutes in order, at most BENCH_SIZE
};

const GROUP_LABEL: Record<PositionGroup, string> = {
  GK: "Gardiens",
  DF: "Défenseurs",
  MF: "Milieux",
  FW: "Attaquants",
};

/** What the match will play, except that saved starters now injured stay in their slot, shown in red. */
function initialState(formation: FormationName, saved: SavedLineup | null, players: readonly LineupPlayer[]): EditorState {
  const resolved = resolveLineup(formation, saved, players);
  const starters: (string | null)[] = FORMATIONS[formation].map(() => null);
  for (const starter of resolved.starters) {
    starters[starter.index] = starter.player.id;
  }
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

/** The bench with `key` inserted at `index` (at the end when undefined), without duplicates, cut to its size. */
function benchWith(bench: readonly string[], key: string, index?: number): string[] {
  const others = bench.filter((candidate) => candidate !== key);
  const at = index === undefined ? others.length : Math.min(index, others.length);
  return [...others.slice(0, at), key, ...others.slice(at)].slice(0, BENCH_SIZE);
}

const sameState = (a: EditorState, b: EditorState): boolean => JSON.stringify(a) === JSON.stringify(b);

type LineupEditorProps = {
  saveId: string;
  formation: FormationName;
  saved: SavedLineup | null;
  players: LineupPlayer[];
};

export function LineupEditor({ saveId, formation, saved, players }: LineupEditorProps) {
  const [initial] = useState(() => initialState(formation, saved, players));
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const byKey = new Map(players.map((player) => [player.id, player]));
  const slots = FORMATIONS[state.formation];
  const selectedPosition: Position | null = selected === null ? null : slots[selected].position;
  const dirty = !sameState(state, initial);

  const clickSlot = (index: number): void => {
    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected !== index) {
      // Two slots: their players swap places.
      const starters = [...state.starters];
      [starters[selected], starters[index]] = [starters[index], starters[selected]];
      setState({ ...state, starters });
    }
    setSelected(null);
  };

  const placePlayer = (key: string): void => {
    if (selected === null) {
      return;
    }
    const starters = [...state.starters];
    const outgoing = starters[selected];
    starters[selected] = key;
    const benchIndex = state.bench.indexOf(key);
    let bench = state.bench.filter((candidate) => candidate !== key);
    if (outgoing !== null) {
      // The starter replaced takes the substitute's place on the bench, or the first one.
      bench = benchWith(bench, outgoing, benchIndex === -1 ? 0 : benchIndex);
    }
    setState({ ...state, starters, bench });
    setSelected(null);
  };

  const sendToBench = (): void => {
    if (selected === null) {
      return;
    }
    const outgoing = state.starters[selected];
    if (outgoing !== null) {
      const starters = [...state.starters];
      starters[selected] = null;
      setState({ ...state, starters, bench: benchWith(state.bench, outgoing, 0) });
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
    const starters: (string | null)[] = slots.map(() => null);
    for (const starter of resolved.starters) {
      starters[starter.index] = starter.player.id;
    }
    setState({ ...state, starters, bench: resolved.bench.map((player) => player.id) });
    setSelected(null);
  };

  const save = (): void =>
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

  const reserves = players.filter((player) => !state.starters.includes(player.id));
  const ratingFor = (player: LineupPlayer): number =>
    selectedPosition === null ? player.overall : ratingAt(player, selectedPosition);
  const emptySlots = state.starters.filter((key) => key === null).length;
  const injuredStarters = state.starters.filter((key) => key !== null && byKey.get(key)?.injured === true).length;
  const selectedPlayer = selected === null ? undefined : byKey.get(state.starters[selected] ?? "");

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
        <p className="rounded-lg border border-warning/25 bg-warning/5 px-4 py-2 text-sm text-warning">
          {injuredStarters > 0 && "Un titulaire blessé sera remplacé automatiquement au coup d'envoi. "}
          {emptySlots > 0 && "Les postes vides seront complétés automatiquement."}
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,460px)_minmax(0,1fr)]">
        <Pitch slots={slots} starters={state.starters} players={byKey} selected={selected} onSelect={clickSlot} />

        <Panel className="space-y-4">
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
            {selectedPosition === null || selected === null ? (
              <p className="text-sm text-muted-foreground">
                Sélectionnez un poste sur le terrain : la note de chaque joueur s&apos;affiche alors pour ce poste.
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
                          disabled={selected === null}
                          onClick={() => placePlayer(player.id)}
                          className="grid w-full grid-cols-[3rem_minmax(0,1fr)_auto_3rem_3rem] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm enabled:hover:bg-muted disabled:cursor-default"
                        >
                          <span className={cn("font-heading font-bold", positionTextClass(player.position))}>
                            {POSITION_SHORT[player.position]}
                          </span>
                          <span className="truncate font-medium">
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
                              rating < player.overall && "text-warning",
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
  );
}
