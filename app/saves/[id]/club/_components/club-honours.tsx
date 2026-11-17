import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "@/src/components/link";
import type { SeasonResultView } from "@/src/db/season-results";
import { seasonLabel } from "@/src/engine/world";
import { competitionName } from "@/src/i18n/countries";
import { cn } from "@/src/lib/utils";
import { Panel } from "@/src/components/panel";
import { rankLabel, seasonCardFileName, seasonCardPath } from "../../_lib/seasons";
import { CLUB_CARD_LINK, ClubCardTitle } from "./club-card";
import { HonoursCardActions } from "./honours-card-actions";

const LATEST_SEASONS = 3;

type ClubHonoursProps = {
  saveId: string;
  seasons: readonly SeasonResultView[]; // most recent first
  dress?: { frame: string | null; title: string | null }; // the frame and title the player wears on the card
  className?: string;
};

/** The club's latest seasons, each leading to its card; from 1024 px, the last one's card, to share or download. */
export function ClubHonours({ saveId, seasons, dress, className }: ClubHonoursProps) {
  const t = useTranslations("seasons");
  const tClub = useTranslations("club");
  const tWorld = useTranslations("world");
  const locale = useLocale();
  const latest = seasons.at(0);
  const title = <ClubCardTitle id="club-honours-title">{t("title")}</ClubCardTitle>;

  if (latest === undefined) {
    return (
      <Panel aria-labelledby="club-honours-title" data-testid="club-honours" className={cn("space-y-3", className)}>
        {title}
        <p data-testid="club-honours-empty" className="text-sm text-muted-foreground">
          {t("empty")}
        </p>
      </Panel>
    );
  }
  const card = seasonCardPath(saveId, latest.seasonId, locale, "square", dress);
  return (
    <Panel aria-labelledby="club-honours-title" data-testid="club-honours" className={cn("flex gap-5.5", className)}>
      {/* Its season is named by the first line beside it. Lazy and hidden, a phone never fetches it. */}
      <Image src={card} alt="" width={200} height={200} unoptimized loading="lazy" className="size-50 shrink-0 rounded-card max-lg:hidden" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {title}
        <ul className="space-y-2">
          {seasons.slice(0, LATEST_SEASONS).map((season) => (
            <li key={season.seasonId}>
              {/* The rank's column widens for « Champion ». */}
              <Link
                href={`/saves/${saveId}/seasons/${season.seasonId}`}
                data-testid={`club-honours-season-${season.startYear}`}
                className="grid min-h-11 grid-cols-[minmax(4rem,auto)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-background px-3.5 py-3 transition-colors hover:bg-secondary"
              >
                <span className={cn("font-heading leading-none", season.champion ? "text-[1.375rem] text-(--club)" : "text-[1.875rem] normal-case")}>
                  {rankLabel(season.rank, t)}
                </span>
                <span className="min-w-0 leading-snug">
                  <span className="block text-[0.9375rem] font-bold tabular-nums">{seasonLabel(season.startYear)}</span>
                  <span className="block text-[0.8125rem] text-muted-foreground tabular-nums">
                    {competitionName(season.competitionCode, tWorld)} ·{" "}
                    <span className="whitespace-nowrap">{tClub("points", { points: season.points })}</span>
                  </span>
                </span>
                <span className="text-[0.8125rem] font-bold text-highlight">{t("columns.card")}</span>
              </Link>
            </li>
          ))}
        </ul>
        {seasons.length > LATEST_SEASONS && (
          <Link href={`/saves/${saveId}/seasons`} data-testid="club-honours-all" className={cn(CLUB_CARD_LINK, "self-start")}>
            {tClub("allHonours")}
          </Link>
        )}
        <HonoursCardActions
          square={{ url: card, fileName: seasonCardFileName(latest.startYear, "square", t) }}
          shareTitle={t("completed.shareTitle", { season: seasonLabel(latest.startYear) })}
        />
      </div>
    </Panel>
  );
}
