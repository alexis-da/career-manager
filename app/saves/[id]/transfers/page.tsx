import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
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
import { requireOwnedSave } from "@/src/auth/current-user";
import { SegmentedLinks } from "@/src/components/segmented";
import { Badge } from "@/src/components/ui/badge";
import { seasonStartYear } from "@/src/engine/world";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatDate, formatMillionsAmount, formatMoney, millionsFigure } from "@/src/lib/format";
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

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("transfers"))("title") };
}

const querySchema = z.object({
  tab: z.enum(["free", "clubs", "moves"]).catch("free"),
  page: z.coerce.number().int().min(1).catch(1),
  mine: z.literal("1").optional().catch(undefined),
  player: z.string().min(1).max(64).optional().catch(undefined), // PlayerSave.id of the open sheet
});

const TABS: MarketTab[] = ["free", "clubs", "moves"];

function MarketBanner({ overview }: { overview: MarketOverview }) {
  const t = useTranslations("transfers");
  const locale = useLocale();
  const budget = millionsFigure(overview.budget, locale);
  const { windowOpen, windowClosesOn, nextWindowOpensOn } = overview;
  return (
    <Panel data-testid="market-banner" className="flex flex-wrap items-center gap-x-10 gap-y-4 py-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className={cn("size-2.5 rounded-full", windowOpen ? "bg-win" : "bg-warning")} />
        <div>
          <p data-testid="market-window" className="font-heading text-xl leading-tight font-bold">
            {windowOpen ? t("window.open") : t("window.closed")}
          </p>
          <p className="text-xs text-muted-foreground">
            {windowOpen && windowClosesOn !== null
              ? t("window.until", { date: formatDate(windowClosesOn, locale) })
              : t("window.nextOpens", { date: formatDate(nextWindowOpensOn, locale) })}
          </p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-10 gap-y-3 tabular-nums sm:ml-auto">
        <div>
          <dt className="eyebrow">{t("banner.budget")}</dt>
          <dd data-summary="budget" data-value={overview.budget} className="font-heading text-2xl font-bold">
            {budget.value}
            {budget.unit !== null && (
              <>
                {" "}
                <span className="text-base font-semibold text-muted-foreground">{budget.unit}</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{t("banner.wageRoom")}</dt>
          <dd
            data-summary="wage-room"
            data-value={overview.wageRoom}
            className={cn("font-heading text-2xl font-bold", overview.wageRoom <= 0 && "text-loss")}
          >
            {millionsFigure(overview.wageRoom, locale).value}{" "}
            <span className="text-base font-semibold text-muted-foreground">
              {t("banner.wageBudget", { amount: formatMillionsAmount(overview.wageBudget, locale) })}
            </span>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

/** The sheet's actions depend on where the player plays: free, at an AI club, or at the managed club. */
function sheetFooter(
  saveId: string,
  sheet: PlayerSheet,
  overview: MarketOverview,
  t: Translator<"transfers">,
  locale: Locale,
): ReactNode {
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
          {closed && <ClosedWindowNote actions={t("closedWindow.signings")} reopensOn={overview.nextWindowOpensOn} />}
          <p data-testid="market-sheet-terms" className="text-xs text-muted-foreground">
            {t("sheet.freeAgent", { wage: formatMoney(status.quote.minimumWage, locale) })}
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
          {closed && <ClosedWindowNote actions={t("closedWindow.offers")} reopensOn={overview.nextWindowOpensOn} />}
          <p data-testid="market-sheet-terms" className="text-xs text-muted-foreground">
            {t("asking", {
              club: status.clubName,
              price: formatMoney(status.quote.askingPrice, locale),
              wage: formatMoney(status.quote.minimumWage, locale),
            })}
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
      return (
        <p data-testid="market-sheet-retired" className="text-sm text-muted-foreground">
          {t("sheet.retired")}
        </p>
      );
  }
}

export default async function TransfersPage({ params, searchParams }: PageProps<"/saves/[id]/transfers">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, locale] = await Promise.all([getTranslations("transfers"), getLocale()]);
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
    <div className={cn("grid items-start gap-6", sheet !== null && "xl:grid-cols-[minmax(0,1fr)_400px]")}>
      <div className="min-w-0 space-y-5">
        <h1 data-testid="transfers-title" className="font-heading text-4xl font-bold">
          {t("title")}
        </h1>
        <MarketBanner overview={overview} />

        <SegmentedLinks
          label={t("tabs.label")}
          testId="market-tabs"
          links={TABS.map((tab) => ({
            // Keeps the other params, filters included, so that coming back to a tab finds its search again;
            // the page and the open sheet belong to the list being left.
            href: marketHref(id, values, { tab: tab === "free" ? undefined : tab, page: undefined, player: undefined }),
            label: (
              <>
                {t(`tabs.${tab}`)}
                {tab === "free" && (
                  <Badge variant="secondary" className="tabular-nums">
                    {overview.freeAgents}
                  </Badge>
                )}
              </>
            ),
            active: tab === query.tab,
            testId: `market-tab-${tab}`,
          }))}
        />

        {!overview.windowOpen && query.tab !== "moves" && (
          <ClosedWindowNote actions={t("closedWindow.both")} reopensOn={overview.nextWindowOpensOn} />
        )}
        {list}
      </div>

      {sheet !== null && (
        <MarketPlayerSheet
          key={sheet.profile.id}
          profile={sheet.profile}
          startYear={seasonStartYear(overview.currentDate)}
          closeHref={marketHref(id, values, { player: undefined })}
          footer={sheetFooter(id, sheet, overview, t, locale)}
        />
      )}
    </div>
  );
}
