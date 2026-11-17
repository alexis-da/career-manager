import Link from "@/src/components/link";
import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

export type SegmentedLink = {
  href: string;
  label: ReactNode;
  active: boolean;
  testId: string;
  scroll?: boolean;
};

type SegmentedLinksProps = {
  label: string; // names the group for screen readers
  links: SegmentedLink[];
  testId?: string;
  className?: string;
};

/**
 * A switch between the views of a screen, each one a link: equal parts on a card, the active one in the bright blue,
 * 44 px high. A label too long for its part goes to the next line; under 640 px the parts have less room around their
 * label, and a word longer than its part breaks (« Récompenses » among four tabs at 360 px).
 */
export function SegmentedLinks({ label, links, testId, className }: SegmentedLinksProps) {
  return (
    <nav aria-label={label} data-testid={testId} className={cn("grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-card p-1", className)}>
      {links.map((link) => (
        <Link
          key={link.testId}
          href={link.href}
          scroll={link.scroll}
          aria-current={link.active ? "page" : undefined}
          data-testid={link.testId}
          className={cn(
            "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-center text-[0.9375rem] leading-tight hyphens-auto wrap-break-word transition-colors max-sm:px-1.5",
            link.active ? "bg-primary font-bold text-primary-foreground" : "font-semibold text-muted-foreground hover:text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
