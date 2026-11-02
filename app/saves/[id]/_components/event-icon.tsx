import { ArrowLeftRightIcon, CheckIcon, PlusIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { MatchEventType } from "@/src/engine/match";
import { cn } from "@/src/lib/utils";

/** A square around an icon, 30 px unless a size is given: its corners and its icon follow. Decorative: its words are beside it. */
export function IconChip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span aria-hidden className={cn("flex size-7.5 shrink-0 items-center justify-center rounded-[30%] bg-background [&>svg]:size-[70%]", className)}>
      {children}
    </span>
  );
}

/** A card, upright: a small full rectangle. */
const card = (fill: string): ReactNode => (
  <svg viewBox="0 0 24 24">
    <rect x="6" y="3" width="12" height="18" rx="2" className={fill} />
  </svg>
);

const ICONS: Record<MatchEventType, ReactNode> = {
  // The ball of the navigation's Match entry, its pentagon full: empty, at this size, it closes up into a ring.
  GOAL: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4 3-1.5 5h-5L8 10z" fill="currentColor" />
    </svg>
  ),
  YELLOW_CARD: card("fill-warning"),
  RED_CARD: card("fill-loss"),
  INJURY: <PlusIcon strokeWidth={3.5} className="text-loss" />,
  SUBSTITUTION: <ArrowLeftRightIcon strokeWidth={2.5} className="text-on-blue" />,
  SHOOTOUT_GOAL: <CheckIcon strokeWidth={3.5} className="text-win" />,
  SHOOTOUT_MISS: <XIcon strokeWidth={3.5} className="text-loss" />,
};

type EventIconProps = {
  type: MatchEventType;
  managed: boolean; // the event is the managed club's: its goals are on the orange, the other club's on white
  className?: string;
};

/** A match event, drawn: never an emoji, whose look is the system's. */
export function EventIcon({ type, managed, className }: EventIconProps) {
  return (
    <IconChip className={cn(type === "GOAL" && (managed ? "bg-(--club) text-(--club-fg)" : "bg-foreground text-background"), className)}>
      {ICONS[type]}
    </IconChip>
  );
}
