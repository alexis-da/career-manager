"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";

const SECTIONS = [
  { segment: "", label: "Tableau de bord" },
  { segment: "/squad", label: "Effectif" },
  { segment: "/fixtures", label: "Calendrier" },
  { segment: "/standings", label: "Classement" },
  { segment: "/transfers", label: "Transferts" },
] as const;

export function SaveNav({ saveId }: { saveId: string }) {
  const pathname = usePathname();
  const base = `/saves/${saveId}`;

  return (
    <nav aria-label="Navigation de la partie" className="-mx-1 flex gap-1 overflow-x-auto px-1">
      {SECTIONS.map(({ segment, label }) => {
        const href = `${base}${segment}`;
        const active = segment === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-(--club-fg) text-(--club)"
                : "text-(--club-fg)/80 hover:bg-(--club-fg)/10 hover:text-(--club-fg)",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
