"use client";

import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import type { SquadPlayerView } from "@/src/db/squad";
import { formatDate, formatMoney, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { POSITION_GROUP, POSITION_LABEL, POSITION_ORDER, POSITION_SHORT } from "../_lib/positions";
import { PlayerSheet } from "./player-sheet";

type SortKey = "position" | "name" | "age" | "overall" | "potential" | "form" | "marketValue" | "wage" | "contractUntil";
type Direction = "asc" | "desc";
type Sort = { key: SortKey; direction: Direction };

const COLUMNS: { key: SortKey; label: string; numeric: boolean; firstDirection: Direction }[] = [
  { key: "position", label: "Poste", numeric: false, firstDirection: "asc" },
  { key: "name", label: "Nom", numeric: false, firstDirection: "asc" },
  { key: "age", label: "Âge", numeric: true, firstDirection: "asc" },
  { key: "overall", label: "Note", numeric: true, firstDirection: "desc" },
  { key: "potential", label: "Potentiel", numeric: true, firstDirection: "desc" },
  { key: "form", label: "Forme", numeric: true, firstDirection: "desc" },
  { key: "marketValue", label: "Valeur", numeric: true, firstDirection: "desc" },
  { key: "wage", label: "Salaire", numeric: true, firstDirection: "desc" },
  { key: "contractUntil", label: "Fin de contrat", numeric: true, firstDirection: "asc" },
];

const byName = (a: SquadPlayerView, b: SquadPlayerView): number =>
  a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr");

function compare(key: SortKey, a: SquadPlayerView, b: SquadPlayerView): number {
  switch (key) {
    case "position":
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

type SquadTableProps = {
  saveId: string;
  players: SquadPlayerView[];
  currentDate: Date;
  startYear: number;
  windowOpen: boolean;
};

export function SquadTable({ saveId, players, currentDate, startYear, windowOpen }: SquadTableProps) {
  const [sort, setSort] = useState<Sort>({ key: "position", direction: "asc" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...players].sort((a, b) => sign * compare(sort.key, a, b) || byName(a, b));
  }, [players, sort]);
  // Sorting by position shows one group per position, the default view.
  const grouped = sort.key === "position";
  const selected = players.find((player) => player.id === selectedId);

  const sortBy = (key: SortKey, firstDirection: Direction) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: firstDirection },
    );

  return (
    <>
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              return (
                <TableHead
                  key={column.key}
                  aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  className={cn(column.numeric && "text-right")}
                >
                  <button
                    type="button"
                    onClick={() => sortBy(column.key, column.firstDirection)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:text-foreground",
                      active && "text-(--club) font-semibold",
                    )}
                  >
                    {column.label}
                    <span aria-hidden className="text-xs">
                      {active ? (sort.direction === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((player, index) => {
            const name = `${player.firstName} ${player.lastName}`;
            const startsGroup = grouped && (index === 0 || sorted[index - 1].position !== player.position);
            return (
              <Fragment key={player.id}>
                {startsGroup && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLUMNS.length} className="pt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {POSITION_GROUP[player.position]} ({players.filter((other) => other.position === player.position).length})
                    </TableCell>
                  </TableRow>
                )}
                <TableRow
                  data-player-key={player.playerKey}
                  onClick={() => setSelectedId(player.id)}
                  className="cursor-pointer"
                >
                  <TableCell title={POSITION_LABEL[player.position]} className="text-muted-foreground">
                    {POSITION_SHORT[player.position]}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Voir la fiche de ${name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(player.id);
                        }}
                        className="font-medium hover:underline"
                      >
                        {name}
                      </button>
                      {player.injuredUntil !== null && (
                        <Badge variant="destructive">Blessé jusqu&apos;au {formatShortDate(player.injuredUntil)}</Badge>
                      )}
                      {player.contractExpiring && <Badge variant="outline">Fin de contrat</Badge>}
                      {player.arrivedThisSeason && <Badge variant="secondary">Jeune</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{player.age}</TableCell>
                  <TableCell className="text-right font-medium">{player.overall}</TableCell>
                  <TableCell className="text-right">{player.potential}</TableCell>
                  <TableCell className="text-right">{player.form}</TableCell>
                  <TableCell className="text-right">{formatMoney(player.marketValue)}</TableCell>
                  <TableCell className="text-right">{formatMoney(player.wage)}</TableCell>
                  <TableCell data-column="contractUntil" className="text-right">
                    {player.contractUntil === null ? "—" : formatDate(player.contractUntil)}
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      <PlayerSheet
        saveId={saveId}
        player={selected}
        currentDate={currentDate}
        startYear={startYear}
        windowOpen={windowOpen}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
