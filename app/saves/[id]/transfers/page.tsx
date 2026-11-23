import type { Metadata } from "next";
import Link from "@/src/components/link";
import { getLocale, getTranslations } from "next-intl/server";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import { SegmentedLinks } from "@/src/components/segmented";
import { Badge } from "@/src/components/ui/badge";
import { getMarketOverview } from "@/src/db/market";
import { getMarketProposals } from "@/src/db/market-proposals";
import { getMarketSales } from "@/src/db/market-sales";
import { formatMoney } from "@/src/lib/format";
import { marketScreenStep } from "@/src/lib/tutorial";
import { ClosedWindowNote } from "../_components/contract-fields";
import { getFirstSteps } from "../_components/first-steps";
import { TutorialBubble } from "../_components/tutorial/tutorial-bubble";
import { getSaveTutorial } from "../_lib/tutorial";
import { MarketBuy } from "./_components/market-buy";
import { MarketSell, SaleOfferCard } from "./_components/market-sell";
import { marketHref, singleValues } from "./_lib/market-url";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("market"))("title") };
}

const querySchema = z.object({ tab: z.enum(["buy", "sell"]).catch("buy") });

/** The market in one screen: what to buy, one proposal at a time, and the offers for the players out of the eleven. */
export default async function MarketPage({ params, searchParams }: PageProps<"/saves/[id]/transfers">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, tTransfers, tTutorial, locale] = await Promise.all([
    getTranslations("market"),
    getTranslations("transfers"),
    getTranslations("tutorial"),
    getLocale(),
  ]);
  const { tab } = querySchema.parse(singleValues(await searchParams));
  const [overview, sales, proposals, tutorial] = await Promise.all([
    getMarketOverview(id),
    getMarketSales(id),
    tab === "buy" ? getMarketProposals(id) : null,
    getSaveTutorial(id),
  ]);
  // The tutorial's market step (scenario 2), from the second day: arriving here is its move, and the assistant shows the
  // first proposal of « Mes besoins », the entry the buying side opens on, by its « Recruter »: scrolled to above the
  // bubble on a phone, « Passer » beside it. Not simulation code: its day is real time.
  const marketStep =
    tutorial !== null &&
    proposals !== null &&
    proposals.entries.needs.length > 0 &&
    marketScreenStep(tutorial, { now: new Date(), matchesPlayed: (await getFirstSteps(id)).matches }, overview.windowOpen);
  const base = `/saves/${id}/transfers`;
  const bestOffer = sales.rows.find((row) => row.terms.sale.ok);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 data-testid="transfers-title" className="font-heading text-4xl">
          {t("title")}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Badge
            data-summary="budget"
            data-value={overview.budget}
            variant="secondary"
            className="h-9 bg-card px-3.5 text-[0.8125rem] tabular-nums"
          >
            {t("budget", { amount: formatMoney(overview.budget, locale) })}
          </Badge>
          <Badge
            data-summary="wage-room"
            data-value={overview.wageRoom}
            variant="secondary"
            className="h-9 bg-card px-3.5 text-[0.8125rem] tabular-nums max-lg:hidden"
          >
            {t("wageRoom", { amount: formatMoney(overview.wageRoom, locale) })}
          </Badge>
        </div>
      </div>

      <SegmentedLinks
        label={t("tabs.label")}
        testId="market-sides"
        links={[
          { href: base, label: t("tabs.buy"), active: tab === "buy", testId: "market-tab-buy" },
          { href: `${base}?tab=sell`, label: t("tabs.sell", { count: sales.offers }), active: tab === "sell", testId: "market-tab-sell" },
        ]}
      />

      {!overview.windowOpen && <ClosedWindowNote actions={tTransfers("closedWindow.both")} reopensOn={overview.nextWindowOpensOn} />}

      {marketStep && (
        <TutorialBubble
          saveId={id}
          step="market"
          text={tTutorial("steps.marketProposal", { sign: t("recruit"), pass: t("pass") })}
          place={null}
          target='[data-testid="market-proposal"] [data-testid="market-recruit"]'
          doneOnShow
        />
      )}

      {proposals === null ? (
        <MarketSell saveId={id} sales={sales} windowOpen={overview.windowOpen} />
      ) : (
        <MarketBuy
          saveId={id}
          proposals={proposals}
          overview={overview}
          sideOffer={bestOffer !== undefined && <SaleOfferCard saveId={id} row={bestOffer} variant="side" />}
        />
      )}

      <Link
        href={marketHref(id, {}, {})}
        data-testid="market-advanced"
        className="block text-center text-sm text-muted-foreground hover:text-foreground max-sm:flex max-sm:min-h-11 max-sm:items-center max-sm:justify-center"
      >
        {t("advanced")}
      </Link>
    </div>
  );
}
