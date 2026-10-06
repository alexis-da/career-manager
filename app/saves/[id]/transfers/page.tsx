import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import * as z from "zod";
import {
  getMarketOverview,
  getPlayerSheet,
  listClubPlayers,
  listFreeAgents,
  listTransfers,
  marketFiltersSchema,
  type MarketOverview,
  type PlayerSheet,
} from "@/src/db/market";
import { seasonStartYear } from "@/src/engine/world";
import { formatDate, formatMillions, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { SquadPlayerActions } from "../_components/contract-actions";
import { ClosedWindowNote } from "../_components/contract-fields";
import { Panel } from "../_components/panel";
import { MakeOfferDialog, SignFreeAgentDialog } from "./_components/market-dialogs";
import { MarketFiltersForm } from "./_components/market-filters";
import { MarketPlayerSheet } from "./_components/market-player-sheet";
import { ClubPlayersTable, FreeAgentsTable, MovementsTable } from "./_components/market-tables";
import { marketHref, singleValues, type MarketTab } from "./_lib/market-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transferts" };

const querySchema = z.object({
  tab: z.enum(["free", "clubs", "moves"]).catch("free"),
  page: z.coerce.number().int().min(1).catch(1),
  mine: z.literal("1").optional().catch(undefined),
  player: z.string().min(1).max(64).optional().catch(undefined), // PlayerSave.id of the open sheet
});

const TABS: { key: MarketTab; label: string }[] = [
  { key: "free", label: "Joueurs libres" },
  { key: "clubs", label: "Autres clubs" },
  { key: "moves", label: "Mouvements" },
];

function MarketBanner({ overview }: { overview: MarketOverview }) {
  const { windowOpen, windowClosesOn, nextWindowOpensOn } = overview;
  return (
    <Panel className="flex flex-wrap items-center gap-x-10 gap-y-4 py-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className={cn("size-2.5 rounded-full", windowOpen ? "bg-win" : "bg-warning")} />
        <div>
          <p className="font-heading text-xl leading-tight font-bold">{windowOpen ? "Mercato ouvert" : "Mercato fermé"}</p>
          <p className="text-xs text-muted-foreground">
            {windowOpen && windowClosesOn !== null
              ? `jusqu'au ${formatDate(windowClosesOn)}`
              : `prochaine fenêtre le ${formatDate(nextWindowOpensOn)}`}
          </p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-10 gap-y-3 tabular-nums sm:ml-auto">
        <div>
          <dt className="eyebrow">Budget transferts</dt>
          <dd data-summary="budget" data-value={overview.budget} className="font-heading text-2xl font-bold">
            {formatMillions(overview.budget)} <span className="text-base font-semibold text-muted-foreground">M€</span>
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Marge salariale</dt>
          <dd
            data-summary="wage-room"
            data-value={overview.wageRoom}
            className={cn("font-heading text-2xl font-bold", overview.wageRoom <= 0 && "text-loss")}
          >
            {formatMillions(overview.wageRoom)}{" "}
            <span className="text-base font-semibold text-muted-foreground">
              / {formatMillions(overview.wageBudget)} M€ par saison
            </span>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

/** The sheet's actions depend on where the player plays: free, at an AI club, or at the managed club. */
function sheetFooter(saveId: string, sheet: PlayerSheet, overview: MarketOverview): ReactNode {
  const { profile, status } = sheet;
  const player = { id: profile.id, name: `${profile.firstName} ${profile.lastName}` };
  const mainAction = "h-10 w-full font-heading text-base font-semibold";
  const closed = !overview.windowOpen;

  switch (status.kind) {
    case "managed":
      return (
        <SquadPlayerActions
          saveId={saveId}
          player={profile}
          terms={status.terms}
          currentDate={overview.currentDate}
          windowOpen={overview.windowOpen}
          nextWindowOpensOn={overview.nextWindowOpensOn}
        />
      );
    case "free":
      return (
        <>
          {closed && <ClosedWindowNote actions="les signatures" reopensOn={overview.nextWindowOpensOn} />}
          <p className="text-xs text-muted-foreground">
            Joueur libre : il accepte au moins {formatMoney(status.quote.minimumWage)} par saison.
          </p>
          <SignFreeAgentDialog
            saveId={saveId}
            player={player}
            askedWage={status.quote.minimumWage}
            wageRoom={overview.wageRoom}
            currentDate={overview.currentDate}
            disabled={closed}
            primary
            triggerClassName={mainAction}
          />
        </>
      );
    case "club":
      return (
        <>
          {closed && <ClosedWindowNote actions="les offres" reopensOn={overview.nextWindowOpensOn} />}
          <p className="text-xs text-muted-foreground">
            {status.clubName} demande {formatMoney(status.quote.askingPrice)} ; le joueur veut au moins{" "}
            {formatMoney(status.quote.minimumWage)} par saison.
          </p>
          <MakeOfferDialog
            saveId={saveId}
            player={player}
            clubName={status.clubName}
            askingPrice={status.quote.askingPrice}
            askedWage={status.quote.minimumWage}
            budget={overview.budget}
            wageRoom={overview.wageRoom}
            currentDate={overview.currentDate}
            disabled={closed}
            primary
            triggerClassName={mainAction}
          />
        </>
      );
    case "retired":
      return <p className="text-sm text-muted-foreground">Ce joueur a quitté le monde du football : aucune action possible.</p>;
  }
}

export default async function TransfersPage({ params, searchParams }: PageProps<"/saves/[id]/transfers">) {
  const { id } = await params;
  const values = singleValues(await searchParams);
  const query = querySchema.parse(values);
  const [overview, sheet] = await Promise.all([
    getMarketOverview(id),
    query.player === undefined ? null : getPlayerSheet(id, query.player),
  ]);

  let list: ReactNode;
  if (query.tab === "free") {
    const freeAgents = await listFreeAgents(id, query.page);
    list = <FreeAgentsTable saveId={id} values={values} list={freeAgents} overview={overview} />;
  } else if (query.tab === "clubs") {
    const filters = marketFiltersSchema.parse(values);
    const players = await listClubPlayers(id, filters);
    list = (
      <>
        {/* Its fields are uncontrolled: remount on every change of the filters, or a client navigation such as
            « Réinitialiser » keeps the old values on screen and the next submit applies them again. */}
        <MarketFiltersForm key={JSON.stringify(filters)} saveId={id} filters={filters} competitions={overview.competitions} />
        <ClubPlayersTable saveId={id} values={values} filters={filters} list={players} overview={overview} />
      </>
    );
  } else {
    const mine = query.mine === "1";
    const movements = await listTransfers(id, { mine, page: query.page });
    list = <MovementsTable saveId={id} values={values} mine={mine} list={movements} />;
  }

  return (
    <div className={cn("grid items-start gap-6", sheet !== null && "lg:grid-cols-[minmax(0,1fr)_400px]")}>
      <div className="min-w-0 space-y-5">
        <h1 className="font-heading text-4xl font-bold">Transferts</h1>
        <MarketBanner overview={overview} />

        <nav aria-label="Listes du marché" className="flex flex-wrap gap-1 border-b pb-2">
          {TABS.map((tab) => {
            const active = tab.key === query.tab;
            return (
              <Link
                key={tab.key}
                href={marketHref(id, {}, { tab: tab.key === "free" ? undefined : tab.key })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-(--club)/18 font-semibold text-foreground after:absolute after:inset-x-2 after:-bottom-[9px] after:h-0.5 after:rounded-full after:bg-(--club)"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {tab.key === "free" && (
                  <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{overview.freeAgents}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {!overview.windowOpen && query.tab !== "moves" && (
          <ClosedWindowNote actions="signatures et offres" reopensOn={overview.nextWindowOpensOn} />
        )}
        {list}
      </div>

      {sheet !== null && (
        <MarketPlayerSheet
          key={sheet.profile.id}
          profile={sheet.profile}
          startYear={seasonStartYear(overview.currentDate)}
          closeHref={marketHref(id, values, { player: undefined })}
          footer={sheetFooter(id, sheet, overview)}
        />
      )}
    </div>
  );
}
