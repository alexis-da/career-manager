import { CoinsIcon, FlameIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "@/src/components/link";
import { cn } from "@/src/lib/utils";

// The chips of the missions of the day (missions v2): the streak's days in a row by the flame, the tokens by the coins.
// Shared by the dashboard's card, the « À demain » card, the Rewards tab and the club's settings; never an action.

/** The streak's chip: its days in a row, by the flame. */
export function StreakChip({ count, className }: { count: number; className?: string }) {
  const t = useTranslations("missions");
  return (
    <span
      data-testid="mission-streak"
      data-streak={count}
      className={cn("inline-flex min-h-6 items-center gap-1 rounded-full bg-secondary px-2.5 text-xs font-semibold whitespace-nowrap", className)}
    >
      <FlameIcon aria-hidden className="size-3.5 shrink-0 text-(--club)" />
      {t("streak", { count })}
    </span>
  );
}

/** The tokens' chip: the player's balance, by the coins; a link to the Rewards tab when given one. */
export function TokenChip({ count, href, className }: { count: number; href?: string; className?: string }) {
  const t = useTranslations("missions");
  const content = (
    <>
      <CoinsIcon aria-hidden className="size-3.5 shrink-0 text-warning" />
      <span aria-hidden className="tabular-nums">
        {count}
      </span>
      <span className="sr-only">{t("tokens", { count })}</span>
    </>
  );
  const chip = cn("inline-flex min-h-6 items-center gap-1 rounded-full bg-secondary px-2.5 text-xs font-semibold whitespace-nowrap", className);
  return href === undefined ? (
    <span data-testid="mission-tokens" data-tokens={count} className={chip}>
      {content}
    </span>
  ) : (
    <Link href={href} data-testid="mission-tokens" data-tokens={count} className={cn(chip, "hover:bg-border max-sm:min-h-11 max-sm:px-3")}>
      {content}
    </Link>
  );
}
