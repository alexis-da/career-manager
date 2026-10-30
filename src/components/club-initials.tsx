import { clubInitials } from "@/src/lib/club-initials";
import { cn } from "@/src/lib/utils";

/** The managed club's mark: its initials on the orange, never a crest. Its name is next to it, read by screen readers. */
export function ClubInitials({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-11 shrink-0 place-items-center rounded-xl bg-(--club) font-heading text-lg text-(--club-fg)", className)}
    >
      {clubInitials(name)}
    </span>
  );
}
