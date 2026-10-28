import Link from "next/link";
import type { ChallengeBannerView } from "@/src/db/challenge-view";
import { formatGoalDifference, formatParisDay } from "@/src/lib/format";

const plural = (count: number, singular: string, pluralForm: string): string => `${count} ${count > 1 ? pluralForm : singular}`;

const ordinal = (rank: number): string => (rank === 1 ? "1er" : `${rank}e`);

/** Where the save stands in its challenge, after « Défi de la semaine · ». */
function standing({ status, horizon }: ChallengeBannerView): string {
  switch (status.kind) {
    case "playing":
      return `journée ${status.matchdaysPlayed} / ${horizon}`;
    case "submitted":
      return `${plural(status.points, "pt", "pts")} · ${formatGoalDifference(status.goalDiff)} · ${plural(status.goalsFor, "but", "buts")} · ${ordinal(status.rank)} provisoire`;
    case "too-late":
      return "Cette partie ne compte pas au classement : le défi s'est terminé avant sa dernière journée";
    case "not-counted":
      return "Cette partie ne compte pas au classement";
  }
}

/**
 * A challenge save's banner on its dashboard: its club's matchday out of the horizon, then its score and provisional
 * rank, then that it no longer counts; or why it does not count. Always the day the purge deletes it, and the ranking.
 */
export function ChallengeBanner({ view }: { view: ChallengeBannerView }) {
  const { status } = view;
  return (
    <section
      aria-label="Défi de la semaine"
      data-testid="challenge-banner"
      className="brand flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-foreground"
    >
      <span aria-hidden className="h-8 w-1 shrink-0 rounded-full bg-(--brand-orange)" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p data-testid="challenge-standing" className="text-sm tabular-nums">
          <span className="font-semibold">Défi de la semaine</span> · {standing(view)}
        </p>
        <p className="text-xs text-muted-foreground">
          {status.kind === "submitted" && "La partie continue mais ne compte plus. "}
          {status.kind === "submitted" && !status.inRanking && "Connecte-toi pour apparaître au classement. "}
          Partie de défi supprimée le {formatParisDay(view.savesPurgedAt)}
        </p>
      </div>
      <Link href="/challenge" className="shrink-0 text-xs font-semibold text-(--brand-orange) underline-offset-4 hover:underline">
        Classement
      </Link>
    </section>
  );
}
