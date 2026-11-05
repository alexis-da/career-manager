import type { TeamView } from "@/src/db/calendar";
import { cn } from "@/src/lib/utils";

/** A club's name beside the score. On a phone, smaller: a word longer than its column wraps rather than being cut. */
const SCORE_NAME =
  "min-w-0 font-heading leading-tight font-bold text-balance wrap-break-word max-[390px]:text-sm min-[390px]:max-sm:text-base sm:text-lg";

type PauseScoreProps = {
  home: TeamView;
  away: TeamView;
  homeGoals: number; // at the pause
  awayGoals: number;
  scoreTestId?: string;
};

/** The score of a match paused, between its clubs' names: the Coaching panel's, and a break's card's. */
export function PauseScore({ home, away, homeGoals, awayGoals, scoreTestId }: PauseScoreProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 max-sm:gap-2">
      <p className={cn(SCORE_NAME, "text-right")}>{home.name}</p>
      <p data-testid={scoreTestId} className="font-heading text-4xl font-bold whitespace-nowrap tabular-nums">
        {homeGoals} – {awayGoals}
      </p>
      <p className={SCORE_NAME}>{away.name}</p>
    </div>
  );
}
