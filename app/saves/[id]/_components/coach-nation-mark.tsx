import type { NationCode } from "@/src/engine/nations";
import { cn } from "@/src/lib/utils";

/**
 * A nation's mark, as a club has its initials (ClubInitials): its code, never a federation's crest; on the orange for the
 * nation the player coaches, on white for another. Its name is next to it, read by screen readers.
 */
export function CoachNationMark({ code, own = false, className }: { code: NationCode; own?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl font-heading text-lg",
        own ? "bg-(--club) text-(--club-fg)" : "bg-foreground text-background",
        className,
      )}
    >
      {code}
    </span>
  );
}
