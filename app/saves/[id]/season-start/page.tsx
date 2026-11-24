import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/src/components/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getClubFinances } from "@/src/db/club";
import { getSeasonContractMoves } from "@/src/db/contracts";
import { getCoachOffers } from "@/src/db/national-view";
import { getLastClosedObjectives, getSeasonObjectives } from "@/src/db/objectives";
import { getSaveSummary } from "@/src/db/saves";
import { seasonLabel, seasonStartYear } from "@/src/engine/world";
import { CoachOfferCard } from "../_components/coach-offer-card";
import { objectivesBehind } from "./_lib/season-start";
import { SeasonAssistant } from "./_components/season-assistant";
import { SeasonBudgetDetail, SeasonGrant } from "./_components/season-budget";
import { SeasonObjectives } from "./_components/season-objectives";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("seasonStart"))("title") };
}

/**
 * The start of a season, before the club's first match (gameplay v2, V2 and V3): « La direction t'accorde X », how the
 * board's dotation was made (its funding at the club's reputation rank, the bonus or malus of last season's objectives,
 * half of the budget left unspent), what the assistant did at the turn (« Ton adjoint à l'intersaison »: contracts
 * renewed or gone, signings, young players, the squad against its limit; docs/design/simplification.md § 6.9), then the
 * season's objectives, the optional one to choose. Under the entry Club, without a tab: the season's review leads here.
 * A save from before the dotations or the objectives, or in its first season, shows what it has. A federation's offer to
 * coach its nation comes first, while it is open (docs/design/selections.md § 9.6).
 */
export default async function SeasonStartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, save, finances, objectives, closed, coachOffers, moves] = await Promise.all([
    getTranslations("seasonStart"),
    getSaveSummary(id),
    getClubFinances(id),
    getSeasonObjectives(id),
    getLastClosedObjectives(id),
    getCoachOffers(id),
    getSeasonContractMoves(id),
  ]);
  if (save === null) {
    notFound();
  }
  const { dotation } = finances;
  // Until the club's first match of the season: then the offers go, as the choice of the objective closes.
  const offers = coachOffers !== null && coachOffers.open ? coachOffers.offers : [];

  return (
    <div data-testid="season-start" className="space-y-5">
      <div className="space-y-1">
        <Link
          href={`/saves/${id}`}
          data-testid="season-start-dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground max-sm:min-h-11"
        >
          <ChevronLeftIcon className="size-4" />
          {t("back")}
        </Link>
        <p className="text-xs font-bold tracking-wider text-highlight uppercase">
          {t("season", { season: seasonLabel(seasonStartYear(save.currentDate)) })}
        </p>
        <h1 data-testid="season-start-title" className="font-heading text-[2.5rem] leading-[0.95] font-bold">
          {t("title")}
        </h1>
        <p className="pt-1 text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      {/* One column the screen's width under lg (minmax(0, 1fr)): the money, then the objectives; side by side above. A
          federation's offer first, across the page. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {offers.map((offer) => (
          <CoachOfferCard key={offer.code} saveId={id} offer={offer} className="lg:col-span-2" />
        ))}
        <div className="space-y-5">
          <SeasonGrant finances={finances} />
          {dotation !== null && <SeasonBudgetDetail dotation={dotation} lastObjectives={objectivesBehind(dotation, closed)} />}
          {moves !== null && <SeasonAssistant moves={moves} />}
        </div>
        <SeasonObjectives saveId={id} view={objectives} />
      </div>
    </div>
  );
}
