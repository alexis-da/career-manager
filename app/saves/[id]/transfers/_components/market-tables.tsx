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
import type { ClubColors } from "@/src/lib/color";
import { formatDate, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "../../_components/panel";
import { nationalityCode } from "../../_lib/nationalities";
import { POSITION_LABEL, POSITION_SHORT, positionTextClass } from "../../_lib/positions";
import { ratingClasses } from "../../_lib/ratings";
import { marketHref, type SearchValues } from "../_lib/market-url";
import { MakeOfferDialog, SignFreeAgentDialog } from "./market-dialogs";

const ROW_ACTION = "h-7";

type ListProps = {
  saveId: string;
  values: SearchValues; // the current search params, kept by every link of the list
};

function Head({ children, className }: { children: ReactNode; className?: string }) {
  return <TableHead className={cn(TABLE_HEAD, className)}>{children}</TableHead>;
}

type FaceProps = { playerKey: string; age: number; clubColors: ClubColors | null };

function PlayerCell({
  saveId,
  values,
  player,
  face,
}: ListProps & { player: { id: string; firstName: string; lastName: string; nationality?: string }; face?: FaceProps }) {
  const name = `${player.firstName} ${player.lastName}`;
  return (
    <TableCell className={cn(TABLE_CELL, "whitespace-nowrap")}>
      {face !== undefined && <PlayerFace {...face} size={28} className="mr-2 inline-block align-middle" />}
      <Link
        href={marketHref(saveId, values, { player: player.id })}
        scroll={false}
        aria-label={`Voir la fiche de ${name}`}
        className="font-semibold hover:underline"
      >
        {name}
      </Link>
      {player.nationality !== undefined && (
        <span className="ml-1.5 text-xs text-muted-foreground" title={player.nationality}>
          {nationalityCode(player.nationality)}
        </span>
      )}
    </TableCell>
  );
}

function PositionCell({ position }: { position: Position }) {
  return (
    <TableCell title={POSITION_LABEL[position]} className={cn(TABLE_CELL, "font-heading text-sm font-bold", positionTextClass(position))}>
      {POSITION_SHORT[position]}
    </TableCell>
  );
}

function RatingCell({ overall }: { overall: number }) {
  return (
    <TableCell className={cn(TABLE_CELL, "text-right")}>
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

function Pagination<T>({ saveId, values, list, noun }: ListProps & { list: Paginated<T>; noun: [string, string] }) {
  const summary = `${list.total} ${list.total > 1 ? noun[1] : noun[0]}`;
  if (list.pageCount <= 1) {
    return <p className="text-xs text-muted-foreground tabular-nums">{summary}</p>;
  }
  const pageLink = (page: number, label: string, disabled: boolean) =>
    disabled ? (
      <span aria-disabled className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
        {label}
      </span>
    ) : (
      <Link
        href={marketHref(saveId, values, { page: page === 1 ? undefined : String(page), player: undefined })}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {label}
      </Link>
    );
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground tabular-nums">
        {summary} · page {list.page} sur {list.pageCount}
      </p>
      <div className="flex gap-2">
        {pageLink(list.page - 1, "Précédent", list.page === 1)}
        {pageLink(list.page + 1, "Suivant", list.page === list.pageCount)}
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
  if (list.total === 0) {
    return (
      <Panel>
        <p className="text-muted-foreground">
          Aucun joueur libre pour le moment. Les joueurs arrivent sur le marché quand un club les libère : les clubs
          font le tri à chaque présaison, et vous pouvez libérer un joueur depuis votre effectif.
        </p>
      </Panel>
    );
  }
  return (
    <div className="space-y-3">
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <Head>Joueur</Head>
            <Head>Poste</Head>
            <Head className="text-right">Âge</Head>
            <Head className="text-right">Note</Head>
            <Head className="text-right">
              <span title="Potentiel">Pot.</span>
            </Head>
            <Head className="text-right">Salaire demandé</Head>
            <Head>Ancien club</Head>
            <Head>
              <span className="sr-only">Action</span>
            </Head>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.rows.map((player) => (
            <TableRow key={player.id} data-player-id={player.id} className={TABLE_ROW}>
              <PlayerCell
                saveId={saveId}
                values={values}
                player={player}
                face={{ playerKey: player.playerKey, age: player.age, clubColors: null }}
              />
              <PositionCell position={player.position} />
              <TableCell className={cn(TABLE_CELL, "text-right")}>{player.age}</TableCell>
              <RatingCell overall={player.overall} />
              <TableCell className={cn(TABLE_CELL, "text-right text-muted-foreground")}>{player.potential}</TableCell>
              <TableCell className={cn(TABLE_CELL, "text-right")}>{formatMoney(player.askedWage)}</TableCell>
              <TableCell className={cn(TABLE_CELL, "text-muted-foreground")}>{player.formerClubName ?? "—"}</TableCell>
              <TableCell className={cn(TABLE_CELL, "text-right")}>
                <SignFreeAgentDialog
                  saveId={saveId}
                  player={{ id: player.id, name: `${player.firstName} ${player.lastName}` }}
                  askedWage={player.askedWage}
                  wageRoom={overview.wageRoom}
                  currentDate={overview.currentDate}
                  disabled={!overview.windowOpen}
                  triggerClassName={ROW_ACTION}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination saveId={saveId} values={values} list={list} noun={["joueur libre", "joueurs libres"]} />
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
}: ListProps & { filters: MarketFilters; sortKey: MarketFilters["sort"]; label: string }) {
  const active = filters.sort === sortKey;
  // A new column starts with the highest first; the active one flips.
  const dir = active && filters.dir === "desc" ? "asc" : "desc";
  return (
    <TableHead
      aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(TABLE_HEAD, "text-right")}
    >
      <Link
        href={marketHref(saveId, values, { sort: sortKey, dir, page: undefined, player: undefined })}
        scroll={false}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
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
  if (list.total === 0) {
    return (
      <Panel>
        <p className="text-muted-foreground">Aucun joueur ne correspond à ces filtres.</p>
      </Panel>
    );
  }
  return (
    <div className="space-y-3">
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <Head>Joueur</Head>
            <Head>Club</Head>
            <Head>Poste</Head>
            <Head className="text-right">Âge</Head>
            <SortHeader saveId={saveId} values={values} filters={filters} sortKey="overall" label="Note" />
            <Head className="text-right">
              <span title="Potentiel">Pot.</span>
            </Head>
            <SortHeader saveId={saveId} values={values} filters={filters} sortKey="price" label="Prix demandé" />
            <Head className="text-right">Salaire demandé</Head>
            <Head>Fin de contrat</Head>
            <Head>
              <span className="sr-only">Action</span>
            </Head>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.rows.map((player) => (
            <TableRow key={player.id} data-player-id={player.id} className={TABLE_ROW}>
              <PlayerCell
                saveId={saveId}
                values={values}
                player={player}
                face={{ playerKey: player.playerKey, age: player.age, clubColors: player.clubColors }}
              />
              <TableCell className={cn(TABLE_CELL, "max-w-44 truncate text-muted-foreground")} title={player.clubName}>
                {player.clubName}
              </TableCell>
              <PositionCell position={player.position} />
              <TableCell className={cn(TABLE_CELL, "text-right")}>{player.age}</TableCell>
              <RatingCell overall={player.overall} />
              <TableCell className={cn(TABLE_CELL, "text-right text-muted-foreground")}>{player.potential}</TableCell>
              <TableCell className={cn(TABLE_CELL, "text-right font-semibold")}>{formatMoney(player.askingPrice)}</TableCell>
              <TableCell className={cn(TABLE_CELL, "text-right")}>{formatMoney(player.askedWage)}</TableCell>
              <TableCell className={cn(TABLE_CELL, "whitespace-nowrap text-muted-foreground")}>
                {player.contractUntil === null ? "—" : formatDate(player.contractUntil)}
              </TableCell>
              <TableCell className={cn(TABLE_CELL, "text-right")}>
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
                  triggerClassName={cn(ROW_ACTION, "whitespace-nowrap")}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination saveId={saveId} values={values} list={list} noun={["joueur", "joueurs"]} />
    </div>
  );
}

// -------------------------------------------------------------- movements

function movementType(movement: MovementRow): string {
  switch (movement.type) {
    case "TRANSFER":
      return "Transfert";
    case "LOAN":
      return "Prêt";
    case "FREE":
      return movement.toClubName === null ? "Libération" : "Signature libre";
    case "RETIREMENT":
      return "Retraite";
  }
}

export function MovementsTable({ saveId, values, mine, list }: ListProps & { mine: boolean; list: Paginated<MovementRow> }) {
  const toggle = (label: string, active: boolean, href: string) => (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
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
      <div role="group" aria-label="Clubs concernés" className="flex gap-1.5">
        {toggle("Tous les clubs", !mine, marketHref(saveId, values, { mine: undefined, page: undefined, player: undefined }))}
        {toggle("Mon club seulement", mine, marketHref(saveId, values, { mine: "1", page: undefined, player: undefined }))}
      </div>

      {list.total === 0 ? (
        <Panel>
          <p className="text-muted-foreground">
            {mine ? "Votre club n'a encore fait aucun mouvement." : "Aucun mouvement pour le moment."}
          </p>
        </Panel>
      ) : (
        <Table className="tabular-nums">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <Head>Date</Head>
              <Head>Joueur</Head>
              <Head>De</Head>
              <Head>Vers</Head>
              <Head className="text-right">Indemnité</Head>
              <Head>Type</Head>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.map((movement) => (
              <TableRow
                key={movement.id}
                data-managed={movement.managedClubInvolved || undefined}
                className={cn(TABLE_ROW, movement.managedClubInvolved && "bg-muted/40")}
              >
                <TableCell className={cn(TABLE_CELL, "whitespace-nowrap text-muted-foreground")}>{formatDate(movement.date)}</TableCell>
                <PlayerCell
                  saveId={saveId}
                  values={values}
                  player={{ id: movement.playerSaveId, firstName: movement.firstName, lastName: movement.lastName }}
                />
                <TableCell className={TABLE_CELL}>{movement.fromClubName ?? <span className="text-muted-foreground">Libre</span>}</TableCell>
                <TableCell className={TABLE_CELL}>
                  {movement.toClubName ?? (
                    <span className="text-muted-foreground">{movement.type === "RETIREMENT" ? "Fin de carrière" : "Libre"}</span>
                  )}
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "text-right")}>{movement.fee > 0 ? formatMoney(movement.fee) : "—"}</TableCell>
                <TableCell className={cn(TABLE_CELL, "text-muted-foreground")}>{movementType(movement)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination saveId={saveId} values={values} list={list} noun={["mouvement", "mouvements"]} />
    </div>
  );
}
