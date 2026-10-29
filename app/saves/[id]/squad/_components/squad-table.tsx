"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { PlayerFace } from "@/src/components/player-face";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Button } from "@/src/components/ui/button";
import { HoverCardTrigger } from "@/src/components/ui/hover-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import type { SquadPlayerView } from "@/src/db/squad";
import { HOVER_POINTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { formatDate, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { SquadPlayerActions } from "../../_components/contract-actions";
import { PlayerBadges } from "../../_components/player-badges";
import { PlayerSheet } from "../../_components/player-sheet";
import { nationalityCode, nationalityName } from "../../_lib/nationalities";
import { POSITION_ORDER, positionTextClass } from "../../_lib/positions";
import { SecondaryPositionBadges } from "../../_components/position-badge";
import { formBarClass, ratingClasses } from "../../_lib/ratings";
import { PLAYER_CARD_DELAY_MS, playerCardHandle, PlayerHoverCard } from "./player-hover-card";

type SortKey = "position" | "name" | "age" | "overall" | "potential" | "form" | "marketValue" | "wage" | "contractUntil";
type Direction = "asc" | "desc";
type Sort = { key: SortKey; direction: Direction };

/** The table's columns, named by their key in the squad messages (columns.<key>); an abbreviated one has a title. */
const COLUMNS: { key: SortKey; title?: "potential"; align: "left" | "right"; firstDirection: Direction }[] = [
  { key: "position", align: "left", firstDirection: "asc" },
  { key: "name", align: "left", firstDirection: "asc" },
  { key: "age", align: "right", firstDirection: "asc" },
  { key: "overall", align: "right", firstDirection: "desc" },
  { key: "potential", title: "potential", align: "right", firstDirection: "desc" },
  { key: "form", align: "left", firstDirection: "desc" },
  { key: "marketValue", align: "right", firstDirection: "desc" },
  { key: "wage", align: "right", firstDirection: "desc" },
  { key: "contractUntil", align: "left", firstDirection: "asc" },
];

/** The sorting shortcuts, named by their id in the squad messages (presets.<id>). */
const PRESETS: { id: "position" | "overall" | "contracts"; sort: Sort }[] = [
  { id: "position", sort: { key: "position", direction: "asc" } },
  { id: "overall", sort: { key: "overall", direction: "desc" } },
  { id: "contracts", sort: { key: "contractUntil", direction: "asc" } },
];

/** A column's key as a test id: « marketValue » gives « market-value ». */
const kebabCase = (key: string): string => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

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
  const t = useTranslations("squad");
  return (
    <span title={t("formTitle", { form })} className="inline-flex items-center">
      <span aria-hidden className="block h-1 w-12 rounded-full bg-border">
        <span className={cn("block h-1 rounded-full", formBarClass(form))} style={{ width: `${form}%` }} />
      </span>
      <span className="sr-only">{form}</span>
    </span>
  );
}

type SquadRowProps = {
  player: SquadPlayerView;
  canHover: boolean;
  onSelect: () => void;
  className: string;
  children: ReactNode;
};

/** A row of the squad: a click opens the sheet; with a mouse, hovering or focusing it also shows the player's card. */
function SquadRow({ player, canHover, onSelect, className, children }: SquadRowProps) {
  const row = (
    <TableRow data-player-key={player.playerKey} data-testid="squad-row" onClick={onSelect} className={className}>
      {children}
    </TableRow>
  );
  return canHover ? (
    <HoverCardTrigger handle={playerCardHandle} payload={player} delay={PLAYER_CARD_DELAY_MS} render={row} />
  ) : (
    row
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
  const t = useTranslations("squad");
  const tWorld = useTranslations("world");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  const [sort, setSort] = useState<Sort>({ key: "position", direction: "asc" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // No card on a touch screen: a tap opens the sheet, nothing else.
  const canHover = useMediaQuery(HOVER_POINTER_QUERY);

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
          <div role="group" aria-label={t("sortLabel")} className="flex gap-1.5" data-testid="squad-sort">
            {PRESETS.map((preset) => {
              const active = sort.key === preset.sort.key && sort.direction === preset.sort.direction;
              return (
                <Button
                  key={preset.id}
                  size="sm"
                  variant="outline"
                  aria-pressed={active}
                  onClick={() => setSort(preset.sort)}
                  className={cn("text-muted-foreground", active && "bg-muted text-foreground dark:bg-muted")}
                  data-testid={`squad-sort-${preset.id}`}
                >
                  {t(`presets.${preset.id}`)}
                </Button>
              );
            })}
          </div>
        </div>

        <Table className="tabular-nums" data-testid="squad-table">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <TableHead
                    key={column.key}
                    title={column.title === undefined ? undefined : t(`columnTitles.${column.title}`)}
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(TABLE_HEAD, column.align === "right" && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(column.key, column.firstDirection)}
                      className={cn("inline-flex items-center gap-1 uppercase hover:text-foreground", active && "text-foreground")}
                      data-testid={`squad-column-${kebabCase(column.key)}`}
                    >
                      {t(`columns.${column.key}`)}
                      <span aria-hidden className="text-[0.5625rem]">
                        {active ? (sort.direction === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  </TableHead>
                );
              })}
              <TableHead className={TABLE_HEAD}>
                <span className="sr-only">{t("columns.status")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((player) => {
              const name = `${player.firstName} ${player.lastName}`;
              const isSelected = player.id === selectedId;
              return (
                <SquadRow
                  key={player.id}
                  player={player}
                  canHover={canHover}
                  onSelect={() => setSelectedId(player.id)}
                  className={cn(TABLE_ROW, "cursor-pointer", isSelected && "bg-muted hover:bg-muted")}
                >
                  <TableCell
                    title={tPositions(`label.${player.position}`)}
                    className={cn(TABLE_CELL, "w-28 font-heading text-sm font-bold", positionTextClass(player.position))}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span data-primary-position>{tPositions(`short.${player.position}`)}</span>
                      <SecondaryPositionBadges playerKey={player.playerKey} position={player.position} />
                    </span>
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "whitespace-nowrap")}>
                    <PlayerFace
                      playerKey={player.playerKey}
                      age={player.age}
                      clubColors={player.clubColors}
                      size={28}
                      className="mr-2 inline-block align-middle"
                    />
                    <button
                      type="button"
                      aria-label={t("openSheet", { name })}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(player.id);
                      }}
                      className="font-semibold hover:underline"
                      data-testid="squad-player-open"
                    >
                      {name}
                    </button>
                    <span className="ml-1.5 text-xs text-muted-foreground" title={nationalityName(player.nationality, tWorld)}>
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
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{formatMoney(player.marketValue, locale)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right text-muted-foreground")}>
                    {formatMoney(player.wage, locale)}
                  </TableCell>
                  <TableCell data-column="contractUntil" className={cn(TABLE_CELL, player.contractExpiring && "text-warning")}>
                    {player.contractUntil === null ? "—" : formatDate(player.contractUntil, locale)}
                  </TableCell>
                  <TableCell className={TABLE_CELL}>
                    <span className="flex gap-1">
                      <PlayerBadges player={player} />
                    </span>
                  </TableCell>
                </SquadRow>
              );
            })}
          </TableBody>
        </Table>
        {canHover && <PlayerHoverCard />}
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
