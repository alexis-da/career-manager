import { useTranslations } from "next-intl";
import { cn } from "@/src/lib/utils";
import { type Decision, extraTimeNote, penaltiesNote } from "../_lib/stage";

/** What a cup tie's score does not say: « a.p. », and « 5-3 t.a.b. » after a shoot-out. Nothing for any other match. */
export function ScoreNotes({ match, className }: { match: Decision; className?: string }) {
  const tScore = useTranslations("score");
  const extraTime = extraTimeNote(match, tScore);
  const penalties = penaltiesNote(match, tScore);
  if (extraTime === null && penalties === null) {
    return null;
  }
  return (
    <span data-score-notes="" className={cn("text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums", className)}>
      {extraTime !== null && <span data-score-note="extra-time">{extraTime}</span>}
      {penalties !== null && (
        <>
          {" · "}
          <span data-score-note="penalties">{penalties}</span>
        </>
      )}
    </span>
  );
}
