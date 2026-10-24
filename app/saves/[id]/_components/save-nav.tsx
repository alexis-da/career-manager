"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";

const SECTIONS = [
  { segment: "", label: "Tableau de bord" },
  { segment: "/squad", label: "Effectif" },
  { segment: "/lineup", label: "Composition" },
  { segment: "/fixtures", label: "Calendrier" },
  { segment: "/standings", label: "Classement" },
  { segment: "/cup", label: "Coupe" },
  { segment: "/transfers", label: "Transferts" },
  { segment: "/seasons", label: "Palmarès" },
] as const;

/** Tabs of a save, « Coupe » only with a cup; the active one gets the club accent at 18 % and an accent underline. */
export function SaveNav({ saveId, hasCup }: { saveId: string; hasCup: boolean }) {
  const pathname = usePathname();
  const base = `/saves/${saveId}`;

  return (
    // Full bar height: the active tab's underline hangs below the tab and must stay inside the nav, which never scrolls.
    <nav aria-label="Navigation de la partie" className="flex min-w-0 items-center gap-1 self-stretch overflow-hidden">
      {SECTIONS.filter(({ segment }) => hasCup || segment !== "/cup").map(({ segment, label }) => {
        const href = `${base}${segment}`;
        const active = segment === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              active
                ? "bg-(--club)/18 font-semibold text-foreground after:absolute after:inset-x-2 after:-bottom-[3px] after:h-0.5 after:rounded-full after:bg-(--club)"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
