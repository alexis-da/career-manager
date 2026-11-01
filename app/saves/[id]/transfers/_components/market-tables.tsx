import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { PlayerFace } from "@/src/components/player-face";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { buttonVariants } from "@/src/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import type {
  ClubPlayerRow,
  FreeAgentRow,
  MarketFilters,
  MarketOverview,
  MovementRow,
  Paginated,
} from "@/src/db/market";
import type { Position } from "@/src/engine/positions";
import type { Translator } from "@/src/i18n/translator";
import type { ClubColors } from "@/src/lib/color";
import { formatDate, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "../../_components/panel";
import { nationalityCode, nationalityName } from "../../_lib/nationalities";
import { positionTextClass } from "../../_lib/positions";
import { SecondaryPositionBadges } from "../../_components/position-badge";
import { ratingClasses } from "../../_lib/ratings";
import { marketHref, type SearchValues } from "../_lib/market-url";
import { MakeOfferDialog, SignFreeAgentDialog } from "./market-dialogs";

const ROW_ACTION = "h-7";

/**
 * On a phone (under 640 px), a list of players is a grid of five columns in every row, the header's included: the
 * player, his position, age, rating, and his wage or price. Potential, contract and the action are in the player's
 * sheet, a tap on his name away; a club player's club goes under his name.
 */
const PHONE_PLAYER_ROW =
  "max-sm:grid max-sm:h-auto max-sm:grid-cols-[minmax(0,1fr)_2.75rem_2.25rem_3rem_4.5rem] max-sm:items-center max-sm:py-1";
const PHONE_CELL = "max-sm:px-1.5";
const PHONE_HEAD = "max-sm:px-0.5 max-sm:tracking-normal";
const PHONE_HIDDEN = "max-sm:hidden";

type ListProps = {
  saveId: string;
  values: SearchValues; // the current search params, kept by every link of the list
};

function Head({ children, className }: { children: ReactNode; className?: string }) {
  return <TableHead className={cn(TABLE_HEAD, PHONE_HEAD, className)}>{children}</TableHead>;
}

/** A column's name, and the shorter one its narrow column has on a phone. */
function HeadLabel({ full, phone }: { full: string; phone: string }) {
  return (
    <>
      <span className="max-sm:hidden">{full}</span>
      <span className="sm:hidden">{phone}</span>
    </>
  );
}

type FaceProps = { playerKey: string; age: number; clubColors: ClubColors | null };

function PlayerCell({
  saveId,
  values,
  player,
  face,
}: ListProps & { player: { id: string; firstName: string; lastName: string; nationality?: string }; face?: FaceProps }) {
  const t = useTranslations("transfers.table");
  const tWorld = useTranslations("world");
  const name = `${player.firstName} ${player.lastName}`;
  return (
    <TableCell className={cn(TABLE_CELL, PHONE_CELL, "whitespace-nowrap max-sm:whitespace-normal")}>
      {face !== undefined && <PlayerFace {...face} size={28} className="mr-2 inline-block align-middle max-sm:hidden" />}
      <Link
        href={marketHref(saveId, values, { player: player.id })}
        scroll={false}
        aria-label={t("viewPlayer", { name })}
        data-testid="market-player"
        className="font-semibold hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
      >
        {name}
      </Link>
      {player.nationality !== undefined && (
        <span className="ml-1.5 text-xs text-muted-foreground" title={nationalityName(player.nationality, tWorld)}>
          {nationalityCode(player.nationality)}
        </span>
      )}
    </TableCell>
  );
}

function PositionCell({ position, playerKey }: { position: Position; playerKey: string }) {
  const tPositions = useTranslations("positions");
  return (
    <TableCell
      title={tPositions(`label.${position}`)}
      className={cn(TABLE_CELL, PHONE_CELL, "font-heading text-sm font-bold", positionTextClass(position))}
    >
      {/* On a phone, the main position alone: the sheet has the others. */}
      <span className="inline-flex items-center gap-1.5">
        <span data-primary-position>{tPositions(`short.${position}`)}</span>
        <span className="contents max-sm:hidden">
          <SecondaryPositionBadges playerKey={playerKey} position={position} />
        </span>
      </span>
    </TableCell>
  );
}

function RatingCell({ overall }: { overall: number }) {
  return (
    <TableCell className={cn(TABLE_CELL, PHONE_CELL, "text-right")}>
      <span
        className={cn(
          "inline-grid h-6 min-w-9 place-items-center rounded-sm px-1.5 font-heading text-sm font-bold",
          ratingClasses(overall),
        )}
      >
        {overall}
      </span>
    </TableCell>
  );
}

/** How a list counts its rows: « 1 joueur libre », « 12 mouvements ». */
type CountMessage = "freeAgents.count" | "clubPlayers.count" | "movements.count";

function Pagination<T>({ saveId, values, list, count }: ListProps & { list: Paginated<T>; count: CountMessage }) {
  const t = useTranslations("transfers");
  const summary = t(count, { count: list.total });
  if (list.pageCount <= 1) {
    return (
      <p data-testid="market-count" className="text-xs text-muted-foreground tabular-nums">
        {summary}
      </p>
    );
  }
  const pageLink = (page: number, label: string, disabled: boolean, testId: string) =>
    disabled ? (
      <span
        aria-disabled
        data-testid={testId}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}
      >
        {label}
      </span>
    ) : (
      <Link
        href={marketHref(saveId, values, { page: page === 1 ? undefined : String(page), player: undefined })}
        data-testid={testId}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {label}
      </Link>
    );
  return (
    <nav aria-label={t("pagination.label")} data-testid="market-pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p data-testid="market-count" className="text-xs text-muted-foreground tabular-nums">
        {t("pagination.paged", { summary, page: list.page, pageCount: list.pageCount })}
      </p>
      <div className="flex gap-2">
        {pageLink(list.page - 1, t("pagination.previous"), list.page === 1, "market-previous")}
        {pageLink(list.page + 1, t("pagination.next"), list.page === list.pageCount, "market-next")}
      </div>
    </nav>
  );
}

// -------------------------------------------------------------- free agents

export function FreeAgentsTable({
  saveId,
  values,
  list,
  overview,
}: ListProps & { list: Paginated<FreeAgentRow>; overview: MarketOverview }) {
  const t = useTranslations("transfers");
  const locale = useLocale();
  if (list.total === 0) {
    return (
      <Panel data-testid="free-agents-empty">
        <p className="text-muted-foreground">{t("freeAgents.empty")}</p>
      </Panel>
    );
  }
  return (
    <div className="space-y-3">
      <Table className="tabular-nums max-sm:block" data-testid="free-agents-table">
        <TableHeader className="max-sm:block">
          <TableRow className={cn("border-border hover:bg-transparent", PHONE_PLAYER_ROW)}>
            <Head>{t("table.player")}</Head>
            <Head>
              <HeadLabel full={t("table.position")} phone={t("table.phone.position")} />
            </Head>
            <Head className="text-right">{t("table.age")}</Head>
            <Head className="text-right">{t("table.overall")}</Head>
            <Head className={cn("text-right", PHONE_HIDDEN)}>
              <span title={t("table.potentialTitle")}>{t("table.potential")}</span>
            </Head>
            <Head className="text-right">
              <HeadLabel full={t("table.askedWage")} phone={t("table.phone.askedWage")} />
            </Head>
            <Head className={PHONE_HIDDEN}>{t("table.formerClub")}</Head>
            <Head className={PHONE_HIDDEN}>
              <span className="sr-only">{t("table.action")}</span>
            </Head>
          </TableRow>
        </TableHeader>
        <TableBody className="max-sm:block">
          {list.rows.map((player) => (
            <TableRow key={player.id} data-player-id={player.id} className={cn(TABLE_ROW, PHONE_PLAYER_ROW)}>
              <PlayerCell
                saveId={saveId}
                values={values}
                player={player}
                face={{ playerKey: player.playerKey, age: player.age, clubColors: null }}
              />
              <PositionCell position={player.position} playerKey={player.playerKey} />
              <TableCell className={cn(TABLE_CELL, PHONE_CELL, "text-right")}>{player.age}</TableCell>
              <RatingCell overall={player.overall} />
              <TableCell className={cn(TABLE_CELL, "text-right text-muted-foreground", PHONE_HIDDEN)}>{player.potential}</TableCell>
              <TableCell className={cn(TABLE_CELL, PHONE_CELL, "text-right")}>{formatMoney(player.askedWage, locale)}</TableCell>
              <TableCell className={cn(TABLE_CELL, "text-muted-foreground", PHONE_HIDDEN)}>{player.formerClubName ?? "—"}</TableCell>
              <TableCell className={cn(TABLE_CELL, "text-right", PHONE_HIDDEN)}>
                <SignFreeAgentDialog
                  saveId={saveId}
                  player={{ id: player.id, name: `${player.firstName} ${player.lastName}` }}
                  askedWage={player.askedWage}
                  wageRoom={overview.wageRoom}
                  currentDate={overview.currentDate}
                  disabled={!overview.windowOpen}
                  refused={player.minimumReputation > overview.reputation}
                  triggerClassName={ROW_ACTION}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination saveId={saveId} values={values} list={list} count="freeAgents.count" />
    </div>
  );
}

// ----------------------------------------------------- players of AI clubs

function SortHeader({
  saveId,
  values,
  filters,
  sortKey,
  label,
}: ListProps & { filters: MarketFilters; sortKey: MarketFilters["sort"]; label: ReactNode }) {
  const active = filters.sort === sortKey;
  // A new column starts with the highest first; the active one flips.
  const dir = active && filters.dir === "desc" ? "asc" : "desc";
  return (
    <TableHead
      aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(TABLE_HEAD, PHONE_HEAD, "text-right")}
    >
      <Link
        href={marketHref(saveId, values, { sort: sortKey, dir, page: undefined, player: undefined })}
        scroll={false}
        data-testid={`market-sort-${sortKey}`}
        className={cn(
          "inline-flex items-center justify-end gap-1 hover:text-foreground max-sm:min-h-11 max-sm:min-w-11",
          active && "text-foreground",
        )}
      >
        {label}
        <span aria-hidden className="text-[0.5625rem]">
          {active ? (filters.dir === "asc" ? "▲" : "▼") : ""}
        </span>
      </Link>
    </TableHead>
  );
}

export function ClubPlayersTable({
  saveId,
  values,
  filters,
  list,
  overview,
}: ListProps & { filters: MarketFilters; list: Paginated<ClubPlayerRow>; overview: MarketOverview }) {
  const t = useTranslations("transfers");
  const locale = useLocale();
  if (list.total === 0) {
    return (
      <Panel data-testid="club-players-empty">
        <p className="text-muted-foreground">{t("clubPlayers.empty")}</p>
      </Panel>
    );
  }
  return (
    <div className="space-y-3">
      <Table className="tabular-nums max-sm:block" data-testid="club-players-table">
        <TableHeader className="max-sm:block">
          <TableRow className={cn("border-border hover:bg-transparent", PHONE_PLAYER_ROW)}>
            <Head>{t("table.player")}</Head>
            <Head className={PHONE_HIDDEN}>{t("table.club")}</Head>
            <Head>
              <HeadLabel full={t("table.position")} phone={t("table.phone.position")} />
            </Head>
            <Head className="text-right">{t("table.age")}</Head>
            <SortHeader saveId={saveId} values={values} filters={filters} sortKey="overall" label={t("table.overall")} />
            <Head className={cn("text-right", PHONE_HIDDEN)}>
              <span title={t("table.potentialTitle")}>{t("table.potential")}</span>
            </Head>
            <SortHeader
              saveId={saveId}
              values={values}
              filters={filters}
              sortKey="price"
              label={<HeadLabel full={t("table.askingPrice")} phone={t("table.phone.askingPrice")} />}
            />
            <Head className={cn("text-right", PHONE_HIDDEN)}>{t("table.askedWage")}</Head>
            <Head className={PHONE_HIDDEN}>{t("table.contractUntil")}</Head>
            <Head className={PHONE_HIDDEN}>
              <span className="sr-only">{t("table.action")}</span>
            </Head>
          </TableRow>
        </TableHeader>
        <TableBody className="max-sm:block">
          {list.rows.map((player) => (
            <TableRow key={player.id} data-player-id={player.id} className={cn(TABLE_ROW, PHONE_PLAYER_ROW)}>
              <PlayerCell
                saveId={saveId}
                values={values}
                player={player}
                face={{ playerKey: player.playerKey, age: player.age, clubColors: player.clubColors }}
              />
              {/* On a phone, under the player's name, whole. */}
              <TableCell
                className={cn(
                  TABLE_CELL,
                  PHONE_CELL,
                  "max-w-44 truncate text-muted-foreground max-sm:col-start-1 max-sm:row-start-2 max-sm:max-w-none max-sm:pb-1.5 max-sm:text-xs max-sm:whitespace-normal",
                )}
                title={player.clubName}
              >
                {player.clubName}
              </TableCell>
              <PositionCell position={player.position} playerKey={player.playerKey} />
              <TableCell className={cn(TABLE_CELL, PHONE_CELL, "text-right")}>{player.age}</TableCell>
              <RatingCell overall={player.overall} />
              <TableCell className={cn(TABLE_CELL, "text-right text-muted-foreground", PHONE_HIDDEN)}>{player.potential}</TableCell>
              <TableCell className={cn(TABLE_CELL, PHONE_CELL, "text-right font-semibold")}>{formatMoney(player.askingPrice, locale)}</TableCell>
              <TableCell className={cn(TABLE_CELL, "text-right", PHONE_HIDDEN)}>{formatMoney(player.askedWage, locale)}</TableCell>
              <TableCell className={cn(TABLE_CELL, "whitespace-nowrap text-muted-foreground", PHONE_HIDDEN)}>
                {player.contractUntil === null ? "—" : formatDate(player.contractUntil, locale)}
              </TableCell>
              <TableCell className={cn(TABLE_CELL, "text-right", PHONE_HIDDEN)}>
                <MakeOfferDialog
                  saveId={saveId}
                  player={{ id: player.id, name: `${player.firstName} ${player.lastName}` }}
                  clubName={player.clubName}
                  askingPrice={player.askingPrice}
                  askedWage={player.askedWage}
                  budget={overview.budget}
                  wageRoom={overview.wageRoom}
                  currentDate={overview.currentDate}
                  disabled={!overview.windowOpen}
                  refused={player.minimumReputation > overview.reputation}
                  triggerClassName={cn(ROW_ACTION, "whitespace-nowrap")}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination saveId={saveId} values={values} list={list} count="clubPlayers.count" />
    </div>
  );
}

// -------------------------------------------------------------- movements

/** A movement's kind: a free move without a destination is a release. */
function movementType(movement: MovementRow, t: Translator<"transfers.movements">): string {
  return movement.type === "FREE" && movement.toClubName === null ? t("types.RELEASE") : t(`types.${movement.type}`);
}

export function MovementsTable({ saveId, values, mine, list }: ListProps & { mine: boolean; list: Paginated<MovementRow> }) {
  const t = useTranslations("transfers.movements");
  const tTable = useTranslations("transfers.table");
  const locale = useLocale();
  const toggle = (label: string, active: boolean, href: string, testId: string) => (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      data-testid={testId}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "text-muted-foreground",
        active && "bg-muted text-foreground dark:bg-muted",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-3">
      <div role="group" aria-label={t("filter")} data-testid="movements-filter" className="flex gap-1.5">
        {toggle(
          t("all"),
          !mine,
          marketHref(saveId, values, { mine: undefined, page: undefined, player: undefined }),
          "movements-all",
        )}
        {toggle(t("mine"), mine, marketHref(saveId, values, { mine: "1", page: undefined, player: undefined }), "movements-mine")}
      </div>

      {list.total === 0 ? (
        <Panel data-testid="movements-empty">
          <p className="text-muted-foreground">{mine ? t("emptyMine") : t("empty")}</p>
        </Panel>
      ) : (
        // On a phone, each movement is a card: the player and the date, the club he leaves and the fee, the club he
        // joins and the movement's kind. Same rows, laid out by CSS.
        <Table className="tabular-nums max-sm:block" data-testid="movements-table">
          <TableHeader className="max-sm:hidden">
            <TableRow className="border-border hover:bg-transparent">
              <Head>{t("date")}</Head>
              <Head>{tTable("player")}</Head>
              <Head>{t("from")}</Head>
              <Head>{t("to")}</Head>
              <Head className="text-right">{t("fee")}</Head>
              <Head>{t("type")}</Head>
            </TableRow>
          </TableHeader>
          <TableBody className="max-sm:block">
            {list.rows.map((movement) => (
              <TableRow
                key={movement.id}
                data-managed={movement.managedClubInvolved || undefined}
                className={cn(
                  TABLE_ROW,
                  "max-sm:grid max-sm:h-auto max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-3 max-sm:py-1.5",
                  movement.managedClubInvolved && "bg-muted/40",
                )}
              >
                <TableCell
                  className={cn(TABLE_CELL, "whitespace-nowrap text-muted-foreground max-sm:col-start-2 max-sm:row-start-1 max-sm:px-0 max-sm:text-right max-sm:text-xs")}
                >
                  {formatDate(movement.date, locale)}
                </TableCell>
                <PlayerCell
                  saveId={saveId}
                  values={values}
                  player={{ id: movement.playerSaveId, firstName: movement.firstName, lastName: movement.lastName }}
                />
                <TableCell className={cn(TABLE_CELL, "max-sm:col-start-1 max-sm:row-start-2 max-sm:px-0 max-sm:whitespace-normal")}>
                  {movement.fromClubName ?? <span className="text-muted-foreground">{t("free")}</span>}
                </TableCell>
                <TableCell
                  className={cn(
                    TABLE_CELL,
                    "max-sm:col-start-1 max-sm:row-start-3 max-sm:px-0 max-sm:whitespace-normal max-sm:before:mr-1 max-sm:before:text-muted-foreground max-sm:before:content-['→']",
                  )}
                >
                  {movement.toClubName ?? (
                    <span className="text-muted-foreground">{movement.type === "RETIREMENT" ? t("retired") : t("free")}</span>
                  )}
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "text-right max-sm:col-start-2 max-sm:row-start-2 max-sm:px-0")}>
                  {movement.fee > 0 ? formatMoney(movement.fee, locale) : "—"}
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "text-muted-foreground max-sm:col-start-2 max-sm:row-start-3 max-sm:px-0 max-sm:text-right")}>
                  {movementType(movement, t)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination saveId={saveId} values={values} list={list} count="movements.count" />
    </div>
  );
}
