import { useTranslations } from "next-intl";
import Link from "next/link";
import { buttonVariants } from "@/src/components/ui/button";
import type { ChallengePageView, ChallengeRankingRow } from "@/src/db/challenge-view";
import type { Translator } from "@/src/i18n/translator";
import { cn } from "@/src/lib/utils";
import { Panel } from "@/src/components/panel";
import { ClubCardTitle } from "./club-card";

const TOP_LINES = 3;

/** The ranking's first lines, then the viewer's when it is further down. */
function shownLines(ranking: readonly ChallengeRankingRow[]): ChallengeRankingRow[] {
  const top = ranking.slice(0, TOP_LINES);
  const own = ranking.slice(TOP_LINES).find((row) => row.isViewer);
  return own === undefined ? top : [...top, own];
}

/** Where the player stands this week: the scenario until they play, then their matchday, then their score. */
function standing(view: ChallengePageView, t: Translator<"club">, tChallenge: Translator<"challenge">): string {
  const { own, club, horizon, ranking } = view;
  if (own === null) {
    return t("challengeScenario", { club: club.name, horizon });
  }
  if (!own.submitted) {
    // Without its save, deleted before the last matchday, an entry has nothing left to play.
    return own.saveId === null ? tChallenge("played") : tChallenge("progress", { played: own.matchdaysPlayed, horizon });
  }
  const line = ranking.find((row) => row.isViewer);
  if (line === undefined) {
    return tChallenge("submitted");
  }
  return line.rank === null
    ? t("challengeScore", { points: line.points })
    : t("challengeRank", { points: line.points, rank: line.rank });
}

/** The week's challenge: where the player stands in it, its ranking's head from 1024 px, and the way to it. */
export function ClubChallenge({ saveId, view }: { saveId: string; view: ChallengePageView }) {
  const t = useTranslations("club");
  const tChallenge = useTranslations("challenge");
  const tTable = useTranslations("challenge.table");
  const lines = shownLines(view.ranking);
  return (
    <Panel aria-labelledby="club-challenge-title" data-testid="club-challenge" className="flex flex-col gap-3 bg-primary text-primary-foreground">
      {/* The week before the title on a phone, after it on a computer, where the status has the card's width. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-0.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-y-2">
        <ClubCardTitle id="club-challenge-title" className="col-start-2 lg:col-start-1">
          {tChallenge("title")}
        </ClubCardTitle>
        <p className="col-start-1 row-span-2 row-start-1 font-heading text-[2.125rem] leading-none text-(--club) lg:col-start-2 lg:row-span-1">
          {t("challengeWeek", { week: view.weekNumber })}
        </p>
        <p data-testid="club-challenge-status" className="col-start-2 text-sm text-on-blue tabular-nums wrap-break-word lg:col-span-2 lg:col-start-1">
          {standing(view, t, tChallenge)}
        </p>
      </div>

      {lines.length > 0 && (
        <ul aria-label={tChallenge("ranking", { week: view.weekNumber })} data-testid="club-challenge-ranking" className="space-y-1 text-sm tabular-nums max-lg:hidden">
          {lines.map((line) => (
            <li
              key={line.rank ?? "own"}
              data-viewer={line.isViewer || undefined}
              className={cn(
                "grid min-h-9 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2.5 py-1",
                line.isViewer && "bg-background font-bold",
              )}
            >
              <span className="font-bold text-on-blue">{line.rank ?? "—"}</span>
              <span className="wrap-break-word">{line.rank === null ? tTable("you") : (line.name ?? tTable("anonymous"))}</span>
              <span className="font-bold">{t("points", { points: line.points })}</span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/saves/${saveId}/challenge`}
        data-testid="club-challenge-link"
        className={cn(buttonVariants({ variant: "club" }), "mt-auto h-11 w-full font-heading text-lg font-semibold")}
      >
        {tChallenge("see")}
      </Link>
    </Panel>
  );
}
