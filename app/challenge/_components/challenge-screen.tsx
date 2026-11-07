import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { GoogleSignInButton } from "@/app/_components/account-panel";
import type { ChallengePageView } from "@/src/db/challenge-view";
import { formatParisDateTime } from "@/src/lib/format";
import { ChallengeHead } from "./challenge-head";
import { OwnChallengeCard } from "./own-challenge-card";
import { RankingTable } from "./ranking-table";

const SECTION = "space-y-2";
const SECTION_TITLE = "font-heading text-xl";
const NOTE = "text-sm text-muted-foreground";

/**
 * The weekly challenge, one screen for the public page and for its tab in a save: the week's scenario, where the player
 * stands in it, whichever save is open, this week's ranking and last week's. Under xl, one column; from xl, the rankings
 * beside the rest, a save's content being too narrow for two below it.
 */
export function ChallengeScreen({ view, clubName }: { view: ChallengePageView; clubName?: ReactNode }) {
  const t = useTranslations("challenge");
  const tScreen = useTranslations("challengeScreen");
  const locale = useLocale();
  const managers = view.ranking.filter((row) => row.rank !== null).length;
  const ownOutsideRanking = view.ranking.some((row) => row.rank === null);

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-5">
      <div className="space-y-5 xl:col-span-2">
        <ChallengeHead view={view} clubName={clubName} />
        <OwnChallengeCard view={view} />
      </div>

      <div className="space-y-5 xl:col-span-3">
        <section aria-labelledby="challenge-ranking" className={SECTION}>
          <h2 id="challenge-ranking" className={SECTION_TITLE}>
            {t("ranking", { week: view.weekNumber })}
          </h2>
          <RankingTable rows={view.ranking} label={t("ranking", { week: view.weekNumber })} empty={t("rankingEmpty")} />
          <p data-testid="challenge-managers" className={NOTE}>
            {tScreen("managers", { count: managers, end: formatParisDateTime(view.endsAt, locale) })}
          </p>
          <p className={NOTE}>{tScreen("rankingRules", { horizon: view.horizon })}</p>
          {ownOutsideRanking && <GoogleSignInButton />}
        </section>

        {view.previous !== null && (
          <section aria-labelledby="challenge-previous" className={SECTION}>
            <h2 id="challenge-previous" className={SECTION_TITLE}>
              {t("previous", { week: view.previous.weekNumber })}
            </h2>
            <RankingTable
              rows={view.previous.ranking}
              label={t("ranking", { week: view.previous.weekNumber })}
              empty={t("previousEmpty")}
            />
          </section>
        )}
      </div>
    </div>
  );
}
