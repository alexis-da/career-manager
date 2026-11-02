"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { COMPUTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { cn } from "@/src/lib/utils";
import { sectionAt, SECTIONS, type Section } from "../_lib/sections";

/** Each entry's icon, as the design draws it. */
const ICONS: Record<Section["key"], ReactNode> = {
  dashboard: <path d="M3 11l9-7 9 7v9H3z" />,
  team: <path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c-1 2-2.5 3-4 3S9 5 8 3z" />,
  match: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4 3-1.5 5h-5L8 10z" />
    </>
  ),
  transfers: <path d="M4 8h14l-3-3M20 16H6l3 3" />,
  club: <path d="M7 4h10v4a5 5 0 01-10 0zM5 5H3v2a3 3 0 003 3M19 5h2v2a3 3 0 01-3 3M10 14h4v4h-4zM8 20h8" />,
};

/**
 * The five entries of a save, the current one in orange; the tabs of an entry that has several are in SectionTabs. One
 * nav at every width: a list in the sidebar on a computer; under lg, a bar fixed to the foot of the screen, an icon over a
 * word in each of its five columns.
 */
export function SaveNav({ saveId }: { saveId: string }) {
  const t = useTranslations("nav");
  const base = `/saves/${saveId}`;
  const current = sectionAt(usePathname().slice(base.length));
  // The server does not know the width: it answers for a phone until the page hydrates.
  const computer = useMediaQuery(COMPUTER_QUERY);

  return (
    <nav
      aria-label={t("label")}
      data-testid="save-nav"
      className="flex flex-col gap-1 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:grid max-lg:grid-cols-5 max-lg:gap-0 max-lg:border-t max-lg:border-sidebar-border max-lg:bg-sidebar max-lg:px-2 max-lg:pt-2 max-lg:pb-[max(1.125rem,env(safe-area-inset-bottom))]"
    >
      {SECTIONS.map(({ key, home, computerHome }) => {
        const active = key === current.key;
        return (
          <Link
            key={key}
            href={`${base}${computer ? (computerHome ?? home) : home}`}
            aria-current={active ? "page" : undefined}
            data-testid={`nav-${key}`}
            className={cn(
              "flex items-center transition-colors max-lg:min-h-12 max-lg:flex-col max-lg:justify-center max-lg:gap-1 max-lg:text-[0.6875rem] lg:h-12 lg:gap-3 lg:rounded-xl lg:px-3 lg:text-[0.9375rem]",
              active
                ? "font-bold text-(--club) lg:bg-sidebar-accent"
                : "font-semibold text-muted-foreground hover:text-foreground lg:text-sidebar-foreground",
            )}
          >
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6 shrink-0 lg:size-5.5">
              {ICONS[key]}
            </svg>
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
