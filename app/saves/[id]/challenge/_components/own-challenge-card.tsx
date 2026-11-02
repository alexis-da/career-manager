import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { PlayChallengeForm } from "@/app/challenge/_components/play-challenge-form";
import { buttonVariants } from "@/src/components/ui/button";
import type { ChallengePageView } from "@/src/db/challenge-view";
import { formatParisDay } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "../../_components/panel";
import { ownChallenge, type OwnScore } from "../_lib/own-challenge";

const TITLE = "challenge-own-title";

/** The way back to the save: across a phone's card, the height of « Jouer le défi », whose place it takes. */
const RESUME = "h-11 px-4.5 text-[0.9375rem] font-bold max-sm:w-full";

/** « 14 pts · 3e »; points alone for an anonymous player, outside the ranking. */
function Score({ score: { points, rank } }: { score: OwnScore }) {
  const t = useTranslations("challengeScreen");
  return (
    <p data-testid="challenge-own-score" className="font-heading text-3xl leading-none normal-case tabular-nums">
      {rank === null ? t("scoreOutsideRanking", { points }) : t("score", { points, rank })}
    </p>
  );
}

/**
 * Where the player stands in this week's challenge, whichever save is open: their save's matchdays out of the horizon,
 * then its score, and the way back to it; or « Jouer le défi », or why not. The screen's one full orange action.
 */
export function OwnChallengeCard({ view }: { view: ChallengePageView }) {
  const t = useTranslations("challenge");
  const tScreen = useTranslations("challengeScreen");
  const locale = useLocale();
  const { horizon } = view;
  const state = ownChallenge(view);
  const save = state.kind === "playing" || state.kind === "submitted" ? state : null;

  return (
    <Panel aria-labelledby={TITLE} data-testid="challenge-own" className="flex flex-col gap-2.5 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={TITLE} className="text-[0.9375rem] font-bold">
          {tScreen("yourGame")}
        </h2>
        {save !== null && (
          <p data-testid="challenge-own-progress" className="text-[0.8125rem] text-muted-foreground tabular-nums">
            {t("progress", { played: save.played, horizon })}
          </p>
        )}
      </div>

      {save !== null && (
        <>
          <div
            role="progressbar"
            aria-labelledby={TITLE}
            aria-valuemin={0}
            aria-valuemax={horizon}
            aria-valuenow={save.played}
            className="h-2.5 overflow-hidden rounded-full bg-background"
          >
            <div className="h-full rounded-full bg-(--club)" style={{ width: `${(save.played / horizon) * 100}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {save.kind === "submitted" && (
              <div className="min-w-0 space-y-1">
                {save.score !== null && <Score score={save.score} />}
                <p className="text-[0.8125rem] text-muted-foreground">{t("submitted")}</p>
              </div>
            )}
            <Link href={`/saves/${save.saveId}`} data-testid="challenge-resume" className={cn(buttonVariants({ variant: "club" }), RESUME)}>
              {t("resume")}
            </Link>
          </div>
        </>
      )}

      {state.kind === "played" && (
        <p data-testid="challenge-played" className="text-sm">
          {t("played")}
        </p>
      )}
      {state.kind === "full" && (
        <p data-testid="challenge-full" className="text-sm font-semibold">
          {t("full")}
        </p>
      )}
      {state.kind === "open" && (
        <div className="space-y-2">
          <PlayChallengeForm weekKey={view.weekKey} variant="club" />
          <p className="text-xs text-muted-foreground">{t("purgedOn", { day: formatParisDay(view.savesPurgedAt, locale) })}</p>
        </div>
      )}
    </Panel>
  );
}
