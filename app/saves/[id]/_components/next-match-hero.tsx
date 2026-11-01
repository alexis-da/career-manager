import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { ClubInitials } from "@/src/components/club-initials";
import { buttonVariants } from "@/src/components/ui/button";
import type { ClubPreview, Dashboard } from "@/src/db/dashboard";
import type { FormationName } from "@/src/engine/formations";
import type { OpponentPreview } from "@/src/db/opponent";
import { competitionName } from "@/src/i18n/countries";
import { formatDecimal, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { stageLabel } from "../_lib/stage";
import { GameActions } from "./game-actions";
import { OpponentSheet } from "./opponent-sheet";
import { ResultPill } from "./result-pill";

/** A secondary control on the hero's blue, outlined. */
const ON_BLUE = "dark:border-on-blue/60 dark:bg-transparent dark:hover:bg-on-blue/10";

function HeroTeam({ team, managed, away }: { team: ClubPreview; managed: boolean; away: boolean }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  return (
    // A column on a phone, the name under the initials; on a computer, side by side, the away team's mirrored.
    <div className={cn("flex min-w-0 flex-col items-center gap-1.5 text-center lg:flex-row lg:gap-4", away ? "lg:flex-row-reverse lg:text-right" : "lg:text-left")}>
      <ClubInitials name={team.name} managed={managed} className="size-14 rounded-[1rem] text-2xl lg:size-20 lg:rounded-[1.25rem] lg:text-4xl" />
      <div className="min-w-0 space-y-1">
        <p className="text-[0.8125rem] leading-tight font-semibold wrap-break-word lg:text-[1.375rem] lg:font-bold">{team.name}</p>
        <p className="text-xs text-on-blue tabular-nums">
          {/* No rank before a club's first match, nor for a cup opponent from another league: no points to give either. */}
          {team.rank === null ? "—" : `${t("teamRank", { rank: team.rank })} · ${t("points", { count: team.points })}`}
          {team.averageOverall !== null && <span className="max-lg:hidden"> · {t("averageRating", { rating: formatDecimal(team.averageOverall, locale) })}</span>}
        </p>
        {team.form.length > 0 && (
          <div className={cn("flex gap-1 max-lg:hidden", away && "justify-end")}>
            {team.form.map((result, index) => (
              <ResultPill key={index} result={result} className="bg-background" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type NextMatchHeroProps = {
  saveId: string;
  dashboard: Dashboard;
  formation: FormationName;
  opponent: OpponentPreview | null;
  className?: string;
};

/**
 * The dashboard's lead card, in the bright blue: the next match, and what to do about it. The game's main action is here,
 * the screen's only full orange one, with « Préparer » and « Simuler » beside it; the sidebar's card leaves them to it.
 */
export function NextMatchHero({ saveId, dashboard, formation, opponent, className }: NextMatchHeroProps) {
  const t = useTranslations("dashboardHero");
  const tStage = useTranslations("stage");
  const tWorld = useTranslations("world");
  const locale = useLocale();
  const { nextMatch } = dashboard;
  return (
    <section
      aria-labelledby="dashboard-hero"
      data-testid="dashboard-next-match"
      className={cn("flex flex-col justify-between gap-4 rounded-card bg-primary p-5 text-primary-foreground lg:gap-5 lg:p-6", className)}
    >
      <div className="space-y-0.5 text-xs font-bold tracking-wider text-on-blue uppercase">
        <h2 id="dashboard-hero">
          {t("title")}
          {nextMatch !== null && ` · ${stageLabel(nextMatch.fixture, tStage)}`}
        </h2>
        {nextMatch !== null && (
          <p>
            {formatShortDate(nextMatch.fixture.scheduledAt, locale)} · {t(nextMatch.fixture.home.isManaged ? "home" : "away")} ·{" "}
            {competitionName(nextMatch.fixture.competitionCode, tWorld)}
          </p>
        )}
      </div>

      {nextMatch === null ? (
        <p className="py-6 text-center text-on-blue">{t(dashboard.seasonFinished ? "seasonOver" : "noUpcomingMatch")}</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 lg:gap-5">
          <HeroTeam team={nextMatch.home} managed={nextMatch.fixture.home.isManaged} away={false} />
          <div className="text-center">
            <p className="font-heading text-[2.125rem] leading-none lg:text-5xl">VS</p>
            {nextMatch.stadium !== null && <p className="mt-1 max-w-24 text-[0.6875rem] leading-tight text-on-blue lg:max-w-32">{nextMatch.stadium}</p>}
          </div>
          <HeroTeam team={nextMatch.away} managed={nextMatch.fixture.away.isManaged} away />
        </div>
      )}

      <GameActions
        saveId={saveId}
        seasonFinished={dashboard.seasonFinished}
        liveMatch={dashboard.liveMatch}
        worldVersion={dashboard.worldVersion}
        hero
        prepare={
          // Nothing to prepare once the season is over, or with a match already under way.
          nextMatch !== null &&
          !dashboard.liveMatch && (
            <Link
              href={`/saves/${saveId}/lineup`}
              data-testid="dashboard-lineup"
              className={buttonVariants({ variant: "outline", className: cn("h-12 text-base font-bold lg:h-14 lg:px-6", ON_BLUE) })}
            >
              {t("prepare")}
            </Link>
          )
        }
      />

      {nextMatch !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-blue">
          <p>{t("formation", { formation })}</p>
          {opponent !== null && <OpponentSheet preview={opponent} triggerClassName={ON_BLUE} />}
        </div>
      )}
    </section>
  );
}
