import { clubInitials } from "@/src/lib/club-initials";
import { cn } from "@/src/lib/utils";

/**
 * A club's mark: its initials, never a crest, on the orange for the managed club, on white for another. Its name is next to
 * it, read by screen readers.
 */
export function ClubInitials({ name, managed = true, className }: { name: string; managed?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl font-heading text-lg",
        managed ? "bg-(--club) text-(--club-fg)" : "bg-foreground text-background",
        className,
      )}
    >
      {clubInitials(name)}
    </span>
  );
}
