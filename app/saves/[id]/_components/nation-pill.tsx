import { cn } from "@/src/lib/utils";

/** A nation by its code in a pill, as a club by its initials: never a federation's crest. */
export function NationPill({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn("inline-grid h-7 min-w-11 place-items-center rounded-md bg-secondary px-1.5 font-heading text-sm leading-none", className)}>
      {code}
    </span>
  );
}
