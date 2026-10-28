import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentUser, type CurrentUser } from "@/src/auth/current-user";
import { buttonVariants } from "@/src/components/ui/button";
import { ensureCurrentChallenge } from "@/src/db/challenge";
import { getChallengePage, type ChallengePageView } from "@/src/db/challenge-view";
import { WORLD_START_DATE } from "@/src/engine/world";
import { formatDate, formatParisDateTime, formatParisDay } from "@/src/lib/format";
import { GoogleSignInButton } from "../_components/account-panel";
import { BrandFooter } from "../_components/brand-footer";
import { PlayChallengeForm } from "./_components/play-challenge-form";
import { RankingTable } from "./_components/ranking-table";

export const dynamic = "force-dynamic";

// « Jouer le défi » creates a worldVersion 2 save, several thousand rows in one transaction: up to 60 s, as the home page.
export const maxDuration = 60;

// No club name in the title, nor in the sharing image, the root layout's (CLAUDE.md, « Communication sortante »).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("challenge"))("title") };
}

/** What the player can do this week: play, go back to their save, or why they cannot. */
async function ChallengeAction({ view }: { view: ChallengePageView }) {
  const [t, locale] = await Promise.all([getTranslations("challenge"), getLocale()]);
  const { own } = view;
  if (own !== null && own.saveId !== null) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/saves/${own.saveId}`} className={buttonVariants({ size: "lg" })} data-testid="challenge-resume">
          {t("resume")}
        </Link>
        <p className="text-sm text-muted-foreground tabular-nums">
          {own.submitted ? t("submitted") : t("progress", { played: own.matchdaysPlayed, horizon: view.horizon })}
        </p>
      </div>
    );
  }
  if (own !== null) {
    return (
      <p data-testid="challenge-played" className="text-sm">
        {t("played")}
      </p>
    );
  }
  if (view.full) {
    return (
      <p data-testid="challenge-full" className="text-sm font-semibold">
        {t("full")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <PlayChallengeForm weekKey={view.weekKey} />
      <p className="text-xs text-muted-foreground">{t("purgedOn", { day: formatParisDay(view.savesPurgedAt, locale) })}</p>
    </div>
  );
}

/**
 * The weekly challenge, open to everyone: the week's scenario (its club, its end in Paris time), « Jouer le défi » or
 * the player's save, this week's ranking and last week's. The week's challenge is created here when the Monday
 * workflow has not (ensureCurrentChallenge). Nothing about the player is created before « Jouer le défi ».
 */
export default async function ChallengePage() {
  const user: CurrentUser | null = await getCurrentUser();
  // Not simulation code: the real week.
  const challenge = await ensureCurrentChallenge(new Date());
  const [view, t, countries, competition, locale] = await Promise.all([
    getChallengePage(challenge, user === null ? null : { id: user.id, kind: user.kind }),
    getTranslations("challenge"),
    getTranslations("countries"),
    getTranslations("competition"),
    getLocale(),
  ]);
  const ownOutsideRanking = view.ranking.some((row) => row.rank === null);
  const { club } = view;

  return (
    <main className="brand flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
        <header className="space-y-2">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            {t("back")}
          </Link>
          <h1 className="font-heading text-4xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("week", { week: view.weekNumber, end: formatParisDateTime(view.endsAt, locale) })}
          </p>
        </header>

        <section aria-labelledby="challenge-scenario" className="space-y-4 rounded-lg border bg-card p-5">
          <h2 id="challenge-scenario" className="eyebrow">
            {t("scenario")}
          </h2>
          <div className="space-y-1">
            <p data-testid="challenge-club" className="flex items-center gap-3 font-heading text-3xl font-bold">
              <span aria-hidden className="h-7 w-1.5 shrink-0 rounded-full" style={{ background: club.primaryColor }} />
              {club.name}
            </p>
            {club.competition !== null && (
              <p className="text-sm text-muted-foreground" data-testid="challenge-competition">
                {competition("league", { country: countries(club.competition.country), tier: club.competition.tier })}
              </p>
            )}
          </div>
          <p className="text-sm leading-relaxed">
            {t("rules", { date: formatDate(WORLD_START_DATE, locale), horizon: view.horizon })}
          </p>
          <ChallengeAction view={view} />
        </section>

        <section aria-labelledby="challenge-ranking" className="space-y-3">
          <h2 id="challenge-ranking" className="eyebrow">
            {t("ranking", { week: view.weekNumber })}
          </h2>
          <RankingTable
            rows={view.ranking}
            label={t("ranking", { week: view.weekNumber })}
            empty={t("rankingEmpty")}
          />
          {ownOutsideRanking && <GoogleSignInButton />}
        </section>

        {view.previous !== null && (
          <section aria-labelledby="challenge-previous" className="space-y-3">
            <h2 id="challenge-previous" className="eyebrow">
              {t("previous", { week: view.previous.weekNumber })}
            </h2>
            <RankingTable
              rows={view.previous.ranking}
              label={t("ranking", { week: view.previous.weekNumber })}
              empty={t("previousEmpty")}
            />
          </section>
        )}

        <BrandFooter />
      </div>
    </main>
  );
}
