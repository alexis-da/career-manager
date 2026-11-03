"use client";

import { ChevronDownIcon, ChevronUpIcon, HeartPulseIcon, type LucideIcon } from "lucide-react";
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
import { FitnessGauge } from "../../_components/fitness-gauge";
import { PlayerBadges } from "../../_components/player-badges";
import { PlayerSheet } from "../../_components/player-sheet";
import { nationalityCode, nationalityName } from "../../_lib/nationalities";
import { POSITION_ORDER, positionTextClass } from "../../_lib/positions";
import { SecondaryPositionBadges } from "../../_components/position-badge";
import { formBarClass, ratingClasses } from "../../_lib/ratings";
import { PLAYER_CARD_DELAY_MS, playerCardHandle, PlayerHoverCard } from "./player-hover-card";

type SortKey =
  | "position"
  | "name"
  | "age"
  | "overall"
  | "potential"
  | "form"
  | "fitness"
  | "marketValue"
  | "wage"
  | "contractUntil";
type Direction = "asc" | "desc";
type Sort = { key: SortKey; direction: Direction };

/**
 * From lg, the table follows its own room, not the screen's: 704 px at 1024 px, 960 px at 1280 px (15 px less with a
 * scrollbar), less again beside the open sheet. Two columns leave under 928 px, three more under 672 px, a room only the
 * sheet leaves; the sheet and the hover card have them all. Before the table scrolls, a name wraps and the badges stack.
 */
const NEEDS_928 = "@max-[58rem]:hidden";
const NEEDS_672 = "@max-[42rem]:hidden";
const TIGHT_CELL = "lg:@max-[58rem]:px-1.5";

/**
 * The fitness's cell keeps a place in the card under lg: the room rule of its column from lg only. In the table, its
 * figure over a short bar, under the heart of football games' condition columns, named for the screen readers and on
 * hover: a word's header would make the table scroll, a 10-letter surname and an injury badge beside it, once sorted.
 */
const FITNESS_NEEDS_672 = "lg:@max-[42rem]:hidden";

/**
 * The table's columns, named by their key in the squad messages (columns.<key>); an abbreviated one has a title, and so
 * has the fitness, which is the next match's, and drawn. The tired first: what a manager sorts the fitness for.
 */
const COLUMNS: {
  key: SortKey;
  title?: "potential" | "fitness";
  icon?: LucideIcon; // in the header, for the word, which the screen readers still read
  align: "left" | "right";
  firstDirection: Direction;
  needs?: string;
}[] = [
  { key: "position", align: "left", firstDirection: "asc" },
  { key: "name", align: "left", firstDirection: "asc" },
  { key: "age", align: "right", firstDirection: "asc" },
  { key: "overall", align: "right", firstDirection: "desc" },
  { key: "potential", title: "potential", align: "right", firstDirection: "desc", needs: NEEDS_928 },
  { key: "form", align: "left", firstDirection: "desc" },
  { key: "fitness", title: "fitness", icon: HeartPulseIcon, align: "left", firstDirection: "asc", needs: NEEDS_672 },
  { key: "marketValue", align: "right", firstDirection: "desc", needs: NEEDS_672 },
  { key: "wage", align: "right", firstDirection: "desc", needs: NEEDS_928 },
  { key: "contractUntil", align: "left", firstDirection: "asc", needs: NEEDS_672 },
];

/**
 * Under lg, the rows are cards, each a grid of one line whose cells overlap. On the left, the position and rating cells
 * make the blue tile. In the middle, the name spans three narrow columns and the rest of the width; the age, nationality
 * and form stand in those columns at the foot of the line, and the fitness at the start of the rest, in the room the
 * name's button keeps under its text: a target of 44 px that leaves the card as low as the tile. On the right, the status
 * badges. The other columns are in the sheet. The ring is inset: the table's frame scrolls, and clips what passes a card's
 * edge.
 */
const CARD_ROW =
  "max-lg:grid max-lg:h-auto max-lg:grid-cols-[3.25rem_auto_auto_auto_minmax(auto,1fr)_auto] max-lg:items-center max-lg:gap-x-1 max-lg:rounded-lg max-lg:border-0 max-lg:px-3.5 max-lg:py-2.5 max-lg:hover:ring-1 max-lg:hover:ring-(--club)/60 max-lg:hover:ring-inset";
const CARD_TILE = "max-lg:col-start-1 max-lg:row-start-1 max-lg:size-11 max-lg:p-0";
const CARD_FOOT =
  "max-lg:row-start-1 max-lg:mb-0.5 max-lg:flex max-lg:h-4.5 max-lg:items-center max-lg:self-end max-lg:p-0 max-lg:text-[0.8125rem] max-lg:text-muted-foreground";
const CARD_SEPARATOR = "max-lg:before:mr-1 max-lg:before:content-['·']";

/**
 * Under lg, the sorting shortcuts stand in for the header row: pills of equal width, at a thumb's height, on two lines if
 * a word needs it. The chosen one is in the bright blue of what is active: the orange is the sheet's « Prolonger ».
 */
const PRESET_PILL =
  "max-lg:h-auto max-lg:min-h-11 max-lg:rounded-full max-lg:px-2 max-lg:py-1 max-lg:text-sm max-lg:leading-tight max-lg:font-semibold max-lg:whitespace-normal max-lg:text-foreground max-lg:dark:bg-transparent";
const PRESET_PILL_ACTIVE =
  "max-lg:font-bold max-lg:text-primary-foreground max-lg:hover:text-primary-foreground max-lg:dark:border-primary max-lg:dark:bg-primary max-lg:dark:hover:bg-primary";

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
    <div className={cn("grid grid-cols-1 items-start gap-6", selected !== undefined && "xl:grid-cols-[minmax(0,1fr)_400px]")}>
      <div className="@container min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {header}
          <div
            role="group"
            aria-label={t("sortLabel")}
            className="flex gap-1.5 max-lg:grid max-lg:w-full max-lg:grid-cols-3 max-lg:gap-2"
            data-testid="squad-sort"
          >
            {PRESETS.map((preset) => {
              const active = sort.key === preset.sort.key && sort.direction === preset.sort.direction;
              return (
                <Button
                  key={preset.id}
                  size="sm"
                  variant="outline"
                  aria-pressed={active}
                  onClick={() => setSort(preset.sort)}
                  className={cn(
                    "text-muted-foreground",
                    PRESET_PILL,
                    active && "bg-muted text-foreground dark:bg-muted",
                    active && PRESET_PILL_ACTIVE,
                  )}
                  data-testid={`squad-sort-${preset.id}`}
                >
                  {t(`presets.${preset.id}`)}
                </Button>
              );
            })}
          </div>
        </div>

        <Table className="tabular-nums max-lg:block" data-testid="squad-table">
          <TableHeader className="max-lg:hidden">
            <TableRow className="border-border hover:bg-transparent">
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <TableHead
                    key={column.key}
                    title={column.title === undefined ? undefined : t(`columnTitles.${column.title}`)}
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(TABLE_HEAD, TIGHT_CELL, column.align === "right" && "text-right", column.needs)}
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(column.key, column.firstDirection)}
                      className={cn(
                        "inline-flex items-center gap-1 uppercase hover:text-foreground",
                        column.align === "right" && "justify-end",
                        active && "text-foreground",
                      )}
                      data-testid={`squad-column-${kebabCase(column.key)}`}
                    >
                      {column.icon === undefined ? (
                        t(`columns.${column.key}`)
                      ) : (
                        <>
                          <column.icon aria-hidden className="size-3.5" />
                          <span className="sr-only">{t(`columns.${column.key}`)}</span>
                        </>
                      )}
                      {active &&
                        (sort.direction === "asc" ? (
                          <ChevronUpIcon aria-hidden className="size-3" />
                        ) : (
                          <ChevronDownIcon aria-hidden className="size-3" />
                        ))}
                    </button>
                  </TableHead>
                );
              })}
              <TableHead className={cn(TABLE_HEAD, TIGHT_CELL)}>
                <span className="sr-only">{t("columns.status")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-lg:block max-lg:space-y-2">
            {sorted.map((player) => {
              const name = `${player.firstName} ${player.lastName}`;
              const isSelected = player.id === selectedId;
              const hasBadges = player.injuredUntil !== null || player.contractExpiring || player.arrivedThisSeason;
              return (
                <SquadRow
                  key={player.id}
                  player={player}
                  canHover={canHover}
                  onSelect={() => setSelectedId(player.id)}
                  className={cn(
                    TABLE_ROW,
                    CARD_ROW,
                    "cursor-pointer",
                    isSelected ? "bg-muted hover:bg-muted" : "max-lg:bg-card max-lg:hover:bg-card",
                  )}
                >
                  {/* Under lg, the tile, with the rating over it, and the main position alone: the sheet has the others. */}
                  <TableCell
                    title={tPositions(`label.${player.position}`)}
                    className={cn(
                      TABLE_CELL,
                      TIGHT_CELL,
                      CARD_TILE,
                      "w-28 font-heading text-sm font-bold lg:@max-[58rem]:w-auto",
                      positionTextClass(player.position),
                      "max-lg:flex max-lg:items-end max-lg:justify-center max-lg:rounded-md max-lg:bg-primary max-lg:pb-1.5 max-lg:font-sans max-lg:text-[0.625rem] max-lg:leading-none max-lg:text-on-blue",
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span data-primary-position>{tPositions(`short.${player.position}`)}</span>
                      <span className="contents max-lg:hidden">
                        <SecondaryPositionBadges playerKey={player.playerKey} position={player.position} />
                      </span>
                    </span>
                  </TableCell>
                  {/* The name on as many lines as it needs. Under lg, no face, and the card's grid takes the cell's content. */}
                  <TableCell className={cn(TABLE_CELL, TIGHT_CELL, "py-1 whitespace-normal max-lg:contents")}>
                    <span className="flex items-center gap-2 max-lg:contents">
                      <PlayerFace
                        playerKey={player.playerKey}
                        age={player.age}
                        clubColors={player.clubColors}
                        size={28}
                        className="shrink-0 max-lg:hidden"
                      />
                      <button
                        type="button"
                        aria-label={t("openSheet", { name })}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(player.id);
                        }}
                        className="min-w-0 text-left leading-tight font-semibold wrap-break-word hover:underline max-lg:col-span-4 max-lg:col-start-2 max-lg:row-start-1 max-lg:min-h-11 max-lg:w-full max-lg:self-stretch max-lg:pb-5 max-lg:text-[0.9375rem] max-lg:font-bold"
                        data-testid="squad-player-open"
                      >
                        {name}
                      </button>
                      <span
                        title={nationalityName(player.nationality, tWorld)}
                        className={cn("shrink-0 text-xs text-muted-foreground", CARD_FOOT, CARD_SEPARATOR, "max-lg:col-start-3")}
                      >
                        {nationalityCode(player.nationality)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, TIGHT_CELL, CARD_FOOT, "text-right max-lg:col-start-2")}>
                    <span className="max-lg:hidden">{player.age}</span>
                    <span className="lg:hidden">{t("ageShort", { age: player.age })}</span>
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, TIGHT_CELL, CARD_TILE, "text-right max-lg:pt-1 max-lg:text-center")}>
                    <span
                      className={cn(
                        "inline-grid h-6 min-w-9 place-items-center rounded-sm px-1.5 font-heading text-sm font-bold",
                        ratingClasses(player.overall),
                        "max-lg:h-auto max-lg:min-w-0 max-lg:bg-transparent max-lg:px-0 max-lg:text-[1.375rem] max-lg:leading-none max-lg:text-primary-foreground",
                      )}
                    >
                      {player.overall}
                    </span>
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, TIGHT_CELL, "text-right text-muted-foreground max-lg:hidden", NEEDS_928)}>
                    {player.potential}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, TIGHT_CELL, CARD_FOOT, CARD_SEPARATOR, "max-lg:col-start-4")}>
                    <FormGauge form={player.form} />
                  </TableCell>
                  {/* In the table, the figure over a short bar. In a card, which has no room for a bar at 360 px, the
                      column's heart before the figure, the heart for a separator; none for an injured player, whose badge
                      takes its room and who will not play. */}
                  <TableCell
                    data-column="fitness"
                    className={cn(
                      TABLE_CELL,
                      TIGHT_CELL,
                      CARD_FOOT,
                      "max-lg:col-start-5 max-lg:gap-1 max-lg:pl-1",
                      player.injuredUntil !== null && "max-lg:hidden",
                      FITNESS_NEEDS_672,
                    )}
                  >
                    <HeartPulseIcon aria-hidden className="size-3 shrink-0 lg:hidden" />
                    <FitnessGauge
                      fitness={player.fitness}
                      moment={player.fitnessAtNextMatch ? "nextMatch" : "today"}
                      className="lg:flex-col-reverse lg:items-start lg:gap-1"
                      barClassName="max-lg:hidden lg:w-6"
                    />
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, TIGHT_CELL, "text-right max-lg:hidden", NEEDS_672)}>
                    {formatMoney(player.marketValue, locale)}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, TIGHT_CELL, "text-right text-muted-foreground max-lg:hidden", NEEDS_928)}>
                    {formatMoney(player.wage, locale)}
                  </TableCell>
                  <TableCell
                    data-column="contractUntil"
                    className={cn(TABLE_CELL, TIGHT_CELL, "max-lg:hidden", NEEDS_672, player.contractExpiring && "text-warning")}
                  >
                    {player.contractUntil === null ? "—" : formatDate(player.contractUntil, locale)}
                  </TableCell>
                  {/* Under lg, on the card's right, one under the other; nothing without a badge. */}
                  <TableCell
                    className={cn(
                      TABLE_CELL,
                      TIGHT_CELL,
                      "py-1 max-lg:col-start-6 max-lg:row-start-1 max-lg:p-0 max-lg:pl-2",
                      !hasBadges && "max-lg:hidden",
                    )}
                  >
                    <span className="flex flex-wrap gap-1 max-lg:flex-col max-lg:items-end">
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
