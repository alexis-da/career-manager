import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { ChallengeBannerView } from "@/src/db/challenge-view";
import type { Translator } from "@/src/i18n/translator";
import { formatGoalDifference, formatParisDay } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel, PanelTitle } from "@/src/components/panel";

const CARD = "flex flex-col gap-2 p-4.5";

/** The card's link: as wide as its text, 44 px high on a phone. */
const CARD_LINK =
  "self-start text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";

/** Where the save stands in its challenge. */
function standing({ status, horizon }: ChallengeBannerView, t: Translator<"challengeBanner">): string {
  switch (status.kind) {
    case "playing":
      return t("playing", { played: status.matchdaysPlayed, horizon });
    case "submitted":
      return t("submitted", {
        points: status.points,
        goalDiff: formatGoalDifference(status.goalDiff),
        goals: status.goalsFor,
        rank: status.rank,
      });
    case "too-late":
      return t("tooLate");
    case "not-counted":
      return t("notCounted");
  }
}

/**
 * A challenge save's card: its week, its club's matchday out of the horizon, then its score and provisional rank, then
 * that it no longer counts; or why it does not count. Always the day the purge deletes it, and the ranking.
 */
function ChallengeStanding({ view, saveId, className }: { view: ChallengeBannerView; saveId: string; className?: string }) {
  const t = useTranslations("challengeBanner");
  const locale = useLocale();
  const { status } = view;
  return (
    <Panel aria-label={t("title")} data-testid="challenge-banner" className={cn(CARD, className)}>
      <PanelTitle className="text-(--club)">{t("week", { week: view.weekNumber })}</PanelTitle>
      <p data-testid="challenge-standing" className="text-lg leading-snug font-bold tabular-nums">
        {/* Read alone, by a screen reader or by e2e/challenge.spec.ts, the line still says what it is about. */}
        <span className="sr-only">{t("title")} · </span>
        <span className="block first-letter:uppercase">{standing(view, t)}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        {status.kind === "submitted" && `${t("continues")} `}
        {status.kind === "submitted" && !status.inRanking && `${t("signIn")} `}
        {t("purgedOn", { day: formatParisDay(view.savesPurgedAt, locale) })}
      </p>
      <Link href={`/saves/${saveId}/challenge`} data-testid="challenge-banner-ranking" className={CARD_LINK}>
        {t("ranking")}
      </Link>
    </Panel>
  );
}

/** Any other save's card: what the challenge is and the way to it, its club left for its page. */
function ChallengeTeaser({ saveId, className }: { saveId: string; className?: string }) {
  const t = useTranslations("challengeBanner");
  const tChallenge = useTranslations("challenge");
  return (
    <Panel aria-label={t("title")} data-testid="dashboard-challenge" className={cn(CARD, className)}>
      <PanelTitle className="text-(--club)">{t("title")}</PanelTitle>
      <p className="text-[0.9375rem] leading-snug">{tChallenge("teaser")}</p>
      <Link href={`/saves/${saveId}/challenge`} className={CARD_LINK}>
        {tChallenge("see")}
      </Link>
    </Panel>
  );
}

/** The dashboard's card of the weekly challenge: where a challenge save stands in it, or, for any other save, the way to it. */
export function ChallengeCard({ view, saveId, className }: { view: ChallengeBannerView | null; saveId: string; className?: string }): ReactNode {
  return view === null ? <ChallengeTeaser saveId={saveId} className={className} /> : <ChallengeStanding view={view} saveId={saveId} className={className} />;
}
