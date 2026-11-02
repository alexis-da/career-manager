import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/app/_components/account-panel";
import { RankingTable } from "@/app/challenge/_components/ranking-table";
import { getCurrentUser, requireOwnedSave } from "@/src/auth/current-user";
import { ensureCurrentChallenge } from "@/src/db/challenge";
import { getChallengePage } from "@/src/db/challenge-view";
import { formatParisDateTime } from "@/src/lib/format";
import { ChallengeHead } from "./_components/challenge-head";
import { OwnChallengeCard } from "./_components/own-challenge-card";

export const dynamic = "force-dynamic";

const SECTION = "space-y-2";
const SECTION_TITLE = "font-heading text-xl";
const NOTE = "text-sm text-muted-foreground";

// No club name in the title (CLAUDE.md, « Communication sortante »).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("challenge"))("title") };
}

/**
 * The weekly challenge inside a save, under Club: the week's scenario, where the player stands in it, whichever save is
 * open, this week's ranking and last week's. The same data as the public page /challenge, on the game's screens. Under
 * xl, one column; from xl, the rankings beside the rest, the content being too narrow for two below it.
 */
export default async function SaveChallengePage({ params }: PageProps<"/saves/[id]/challenge">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const user = await getCurrentUser();
  // Not simulation code: the real week.
  const challenge = await ensureCurrentChallenge(new Date());
  const [view, t, tScreen, locale] = await Promise.all([
    getChallengePage(challenge, user === null ? null : { id: user.id, kind: user.kind }),
    getTranslations("challenge"),
    getTranslations("challengeScreen"),
    getLocale(),
  ]);
  const managers = view.ranking.filter((row) => row.rank !== null).length;
  const ownOutsideRanking = view.ranking.some((row) => row.rank === null);

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-5">
      <div className="space-y-5 xl:col-span-2">
        <ChallengeHead view={view} />
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
