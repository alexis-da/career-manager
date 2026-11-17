import {
  AwardIcon,
  BrickWallIcon,
  CalendarCheckIcon,
  CalendarRangeIcon,
  CrownIcon,
  FlameIcon,
  MedalIcon,
  RadioIcon,
  RouteIcon,
  ShieldIcon,
  SparklesIcon,
  StarIcon,
  TagIcon,
  TargetIcon,
  TrendingUpIcon,
  TrophyIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { cosmeticOf, frameStyleOf, type CosmeticId } from "@/src/lib/cosmetics";
import { cn } from "@/src/lib/utils";

// The signs of the collection (missions v2): a badge's icon, a frame's border in small, a title's tag. In SVG and CSS,
// never an emoji.

/** Each badge's icon. */
export const BADGE_ICONS: Readonly<Record<Extract<CosmeticId, `badge-${string}`>, LucideIcon>> = {
  "badge-first-mission": TargetIcon,
  "badge-perfect-day": SparklesIcon,
  "badge-centurion": ShieldIcon,
  "badge-one-week": CalendarCheckIcon,
  "badge-one-month": CalendarRangeIcon,
  "badge-seven-weeks": FlameIcon,
  "badge-live": RadioIcon,
  "badge-ten-live-wins": ZapIcon,
  "badge-wall": BrickWallIcon,
  "badge-champion-d1": CrownIcon,
  "badge-champion-d2": TrophyIcon,
  "badge-promoted": TrendingUpIcon,
  "badge-cup": MedalIcon,
  "badge-double": StarIcon,
  "badge-roadmap": RouteIcon,
  "badge-challenge-podium": AwardIcon,
};

/** A badge's icon, named for screen readers; nothing for an id that is not a badge's. */
export function BadgeMark({ id, label, className }: { id: string | null; label: string; className?: string }) {
  const Icon = id === null ? undefined : BADGE_ICONS[id as keyof typeof BADGE_ICONS];
  return Icon === undefined ? null : <Icon role="img" aria-label={label} className={className} />;
}

/** A frame in small: its border around the card's night blue. The night frame, the card as it was, a thin line. */
export function FramePreview({ id, className }: { id: string; className?: string }) {
  const style = frameStyleOf(id);
  const plain = style.width === 0;
  return (
    <span
      aria-hidden
      className={cn("inline-block h-8 w-12 shrink-0 rounded-md", className)}
      style={{ background: plain ? "var(--border)" : style.border, padding: plain ? 1 : 4 }}
    >
      <span className="block size-full rounded-[3px] bg-[#0B1340]" />
    </span>
  );
}

/** A cosmetic's sign: a title's tag, a badge's icon, a frame in small; dimmed while locked. */
export function CosmeticSign({ id, locked = false, className }: { id: string; locked?: boolean; className?: string }) {
  const cosmetic = cosmeticOf(id);
  if (cosmetic?.kind === "FRAME") {
    return <FramePreview id={id} className={cn(locked && "opacity-40 grayscale", className)} />;
  }
  const Icon = (cosmetic?.kind === "BADGE" ? BADGE_ICONS[id as keyof typeof BADGE_ICONS] : undefined) ?? TagIcon;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl",
        locked ? "bg-secondary text-muted-foreground" : "bg-highlight/15 text-highlight",
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
