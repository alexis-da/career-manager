import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/src/components/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getClubFinances } from "@/src/db/club";
import { getLastClosedObjectives, getSeasonObjectives } from "@/src/db/objectives";
import { getSaveSummary } from "@/src/db/saves";
import { seasonLabel, seasonStartYear } from "@/src/engine/world";
import { objectivesBehind } from "./_lib/season-start";
import { SeasonBudgetDetail, SeasonGrant, SeasonWages } from "./_components/season-budget";
import { SeasonObjectives } from "./_components/season-objectives";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("seasonStart"))("title") };
}

/**
 * The start of a season, before the club's first match (gameplay v2, V2 and V3): « La direction t'accorde X », how the
 * board's dotation was made (its funding at the club's reputation rank, the bonus or malus of last season's objectives,
 * half of the budget left unspent), the wage cap with the payroll and what it leaves, then the season's objectives, the
 * optional one to choose. Under the entry Club, without a tab: the season's review leads here. A save from before the
 * dotations or the objectives shows what it has.
 */
export default async function SeasonStartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, save, finances, objectives, closed] = await Promise.all([
    getTranslations("seasonStart"),
    getSaveSummary(id),
    getClubFinances(id),
    getSeasonObjectives(id),
    getLastClosedObjectives(id),
  ]);
  if (save === null) {
    notFound();
  }
  const { dotation } = finances;

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

      {/* One column the screen's width under lg (minmax(0, 1fr)): the money, then the objectives; side by side above. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SeasonGrant finances={finances} />
          {dotation !== null && <SeasonBudgetDetail dotation={dotation} lastObjectives={objectivesBehind(dotation, closed)} />}
          <SeasonWages finances={finances} />
        </div>
        <SeasonObjectives saveId={id} view={objectives} />
      </div>
    </div>
  );
}
