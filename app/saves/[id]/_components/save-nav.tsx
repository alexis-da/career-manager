"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
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

/** The five entries of a save, the current one in orange; the tabs of an entry that has several are in SectionTabs. */
export function SaveNav({ saveId }: { saveId: string }) {
  const t = useTranslations("nav");
  const base = `/saves/${saveId}`;
  const current = sectionAt(usePathname().slice(base.length));

  return (
    <nav aria-label={t("label")} data-testid="save-nav" className="mx-auto flex w-full max-w-[1440px] gap-1 px-4 lg:px-7">
      {SECTIONS.map(({ key, home }) => {
        const active = key === current.key;
        return (
          <Link
            key={key}
            href={`${base}${home}`}
            aria-current={active ? "page" : undefined}
            data-testid={`nav-${key}`}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
              active ? "font-bold text-(--club)" : "font-semibold text-muted-foreground hover:text-foreground",
            )}
          >
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5 shrink-0">
              {ICONS[key]}
            </svg>
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
