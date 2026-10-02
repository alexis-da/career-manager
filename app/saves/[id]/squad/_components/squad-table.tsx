"use client";

import { useMemo, useState, type ReactNode } from "react";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Button } from "@/src/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import type { SquadPlayerView } from "@/src/db/squad";
import { formatDate, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { SquadPlayerActions } from "../../_components/contract-actions";
import { PlayerBadges } from "../../_components/player-badges";
import { PlayerSheet } from "../../_components/player-sheet";
import { nationalityCode } from "../../_lib/nationalities";
import { POSITION_LABEL, POSITION_ORDER, POSITION_SHORT, positionTextClass } from "../../_lib/positions";
import { formBarClass, ratingClasses } from "../../_lib/ratings";

type SortKey = "position" | "name" | "age" | "overall" | "potential" | "form" | "marketValue" | "wage" | "contractUntil";
type Direction = "asc" | "desc";
type Sort = { key: SortKey; direction: Direction };

const COLUMNS: { key: SortKey; label: string; title?: string; align: "left" | "right"; firstDirection: Direction }[] = [
  { key: "position", label: "Poste", align: "left", firstDirection: "asc" },
  { key: "name", label: "Joueur", align: "left", firstDirection: "asc" },
  { key: "age", label: "Âge", align: "right", firstDirection: "asc" },
  { key: "overall", label: "Note", align: "right", firstDirection: "desc" },
  { key: "potential", label: "Pot.", title: "Potentiel", align: "right", firstDirection: "desc" },
  { key: "form", label: "Forme", align: "left", firstDirection: "desc" },
  { key: "marketValue", label: "Valeur", align: "right", firstDirection: "desc" },
  { key: "wage", label: "Salaire", align: "right", firstDirection: "desc" },
  { key: "contractUntil", label: "Contrat", align: "left", firstDirection: "asc" },
];

const PRESETS: { label: string; sort: Sort }[] = [
  { label: "Par poste", sort: { key: "position", direction: "asc" } },
  { label: "Par note", sort: { key: "overall", direction: "desc" } },
  { label: "Contrats", sort: { key: "contractUntil", direction: "asc" } },
];

const byName = (a: SquadPlayerView, b: SquadPlayerView): number =>
  a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr");

function compare(key: SortKey, a: SquadPlayerView, b: SquadPlayerView): number {
  switch (key) {
    case "position":
      // Line by line (GK, DF, MF, FW), each position of the line in turn.
      return POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || b.overall - a.overall;
    case "name":
      return byName(a, b);
    case "contractUntil":
      // A player without a contract end sorts last.
      return (a.contractUntil?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.contractUntil?.getTime() ?? Number.MAX_SAFE_INTEGER);
    default:
      return a[key] - b[key];
  }
}

function FormGauge({ form }: { form: number }) {
  return (
    <span title={`Forme ${form}`} className="inline-flex items-center">
      <span aria-hidden className="block h-1 w-12 rounded-full bg-border">
        <span className={cn("block h-1 rounded-full", formBarClass(form))} style={{ width: `${form}%` }} />
      </span>
      <span className="sr-only">{form}</span>
    </span>
  );
}

type SquadTableProps = {
  saveId: string;
  header: ReactNode;
  players: SquadPlayerView[];
  currentDate: Date;
  startYear: number;
  windowOpen: boolean;
  nextWindowOpensOn: Date;
};

export function SquadTable({ saveId, header, players, currentDate, startYear, windowOpen, nextWindowOpensOn }: SquadTableProps) {
  const [sort, setSort] = useState<Sort>({ key: "position", direction: "asc" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...players].sort((a, b) => sign * compare(sort.key, a, b) || byName(a, b));
  }, [players, sort]);
  const selected = players.find((player) => player.id === selectedId);

  const sortBy = (key: SortKey, firstDirection: Direction) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: firstDirection },
    );

  return (
    <div className={cn("grid items-start gap-6", selected !== undefined && "lg:grid-cols-[minmax(0,1fr)_400px]")}>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {header}
          <div role="group" aria-label="Tri de l'effectif" className="flex gap-1.5">
            {PRESETS.map((preset) => {
              const active = sort.key === preset.sort.key && sort.direction === preset.sort.direction;
              return (
                <Button
                  key={preset.label}
                  size="sm"
                  variant="outline"
                  aria-pressed={active}
                  onClick={() => setSort(preset.sort)}
                  className={cn("text-muted-foreground", active && "bg-muted text-foreground dark:bg-muted")}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>
        </div>

        <Table className="tabular-nums">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <TableHead
                    key={column.key}
                    title={column.title}
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(TABLE_HEAD, column.align === "right" && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(column.key, column.firstDirection)}
                      className={cn("inline-flex items-center gap-1 uppercase hover:text-foreground", active && "text-foreground")}
                    >
                      {column.label}
                      <span aria-hidden className="text-[0.5625rem]">
                        {active ? (sort.direction === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  </TableHead>
                );
              })}
              <TableHead className={TABLE_HEAD}>
                <span className="sr-only">Statut</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((player) => {
              const name = `${player.firstName} ${player.lastName}`;
              const isSelected = player.id === selectedId;
              return (
                <TableRow
                  key={player.id}
                  data-player-key={player.playerKey}
                  onClick={() => setSelectedId(player.id)}
                  className={cn(TABLE_ROW, "cursor-pointer", isSelected && "bg-muted hover:bg-muted")}
                >
                  <TableCell
                    title={POSITION_LABEL[player.position]}
                    className={cn(TABLE_CELL, "w-16 font-heading text-sm font-bold", positionTextClass(player.position))}
                  >
                    {POSITION_SHORT[player.position]}
                  </TableCell>
                  <TableCell className={TABLE_CELL}>
                    <button
                      type="button"
                      aria-label={`Voir la fiche de ${name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(player.id);
                      }}
                      className="font-semibold hover:underline"
                    >
                      {name}
                    </button>
                    <span className="ml-1.5 text-xs text-muted-foreground" title={player.nationality}>
                      {nationalityCode(player.nationality)}
                    </span>
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{player.age}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>
                    <span
                      className={cn(
                        "inline-grid h-6 min-w-9 place-items-center rounded-sm px-1.5 font-heading text-sm font-bold",
                        ratingClasses(player.overall),
                      )}
                    >
                      {player.overall}
                    </span>
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right text-muted-foreground")}>{player.potential}</TableCell>
                  <TableCell className={TABLE_CELL}>
                    <FormGauge form={player.form} />
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{formatMoney(player.marketValue)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right text-muted-foreground")}>{formatMoney(player.wage)}</TableCell>
                  <TableCell data-column="contractUntil" className={cn(TABLE_CELL, player.contractExpiring && "text-warning")}>
                    {player.contractUntil === null ? "—" : formatDate(player.contractUntil)}
                  </TableCell>
                  <TableCell className={TABLE_CELL}>
                    <span className="flex gap-1">
                      <PlayerBadges player={player} />
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selected !== undefined && (
        <PlayerSheet
          key={selected.id}
          profile={selected}
          startYear={startYear}
          onClose={() => setSelectedId(null)}
          footer={
            <SquadPlayerActions
              saveId={saveId}
              player={selected}
              terms={selected.terms}
              currentDate={currentDate}
              windowOpen={windowOpen}
              nextWindowOpensOn={nextWindowOpensOn}
            />
          }
        />
      )}
    </div>
  );
}
