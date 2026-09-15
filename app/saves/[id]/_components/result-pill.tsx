import { cn } from "@/src/lib/utils";
import { RESULT_CLASSES, RESULT_LABEL, RESULT_LETTER, type ResultKind } from "../_lib/results";

/** V, N or D in its fixed color. */
export function ResultPill({ result, className }: { result: ResultKind; className?: string }) {
  return (
    <span
      title={RESULT_LABEL[result]}
      className={cn(
        "inline-grid size-6 place-items-center rounded-sm font-heading text-xs font-semibold",
        RESULT_CLASSES[result],
        className,
      )}
    >
      <span aria-hidden>{RESULT_LETTER[result]}</span>
      <span className="sr-only">{RESULT_LABEL[result]}</span>
    </span>
  );
}
