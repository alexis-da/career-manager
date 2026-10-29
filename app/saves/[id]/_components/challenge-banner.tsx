import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ChallengeBannerView } from "@/src/db/challenge-view";
import type { Translator } from "@/src/i18n/translator";
import { formatGoalDifference, formatParisDay } from "@/src/lib/format";

/** Where the save stands in its challenge, after « Défi de la semaine · ». */
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
 * A challenge save's banner on its dashboard: its club's matchday out of the horizon, then its score and provisional
 * rank, then that it no longer counts; or why it does not count. Always the day the purge deletes it, and the ranking.
 */
export function ChallengeBanner({ view }: { view: ChallengeBannerView }) {
  const t = useTranslations("challengeBanner");
  const locale = useLocale();
  const { status } = view;
  return (
    <section
      aria-label={t("title")}
      data-testid="challenge-banner"
      className="brand flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-foreground"
    >
      <span aria-hidden className="h-8 w-1 shrink-0 rounded-full bg-(--brand-orange)" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p data-testid="challenge-standing" className="text-sm tabular-nums">
          <span className="font-semibold">{t("title")}</span> · {standing(view, t)}
        </p>
        <p className="text-xs text-muted-foreground">
          {status.kind === "submitted" && `${t("continues")} `}
          {status.kind === "submitted" && !status.inRanking && `${t("signIn")} `}
          {t("purgedOn", { day: formatParisDay(view.savesPurgedAt, locale) })}
        </p>
      </div>
      <Link
        href="/challenge"
        data-testid="challenge-banner-ranking"
        className="shrink-0 text-xs font-semibold text-(--brand-orange) underline-offset-4 hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center max-sm:justify-center"
      >
        {t("ranking")}
      </Link>
    </section>
  );
}
