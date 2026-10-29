import { useTranslations } from "next-intl";
import { cn } from "@/src/lib/utils";
import { RESULT_CLASSES, type ResultKind } from "../_lib/results";

/** V, N or D in its fixed color. */
export function ResultPill({ result, className }: { result: ResultKind; className?: string }) {
  const tResults = useTranslations("results");
  return (
    <span
      title={tResults(`label.${result}`)}
      className={cn(
        "inline-grid size-6 place-items-center rounded-sm font-heading text-xs font-semibold",
        RESULT_CLASSES[result],
        className,
      )}
    >
      <span aria-hidden>{tResults(`letter.${result}`)}</span>
      <span className="sr-only">{tResults(`label.${result}`)}</span>
    </span>
  );
}
