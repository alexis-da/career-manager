"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";

type FullTableContextValue = {
  full: boolean;
  toggle: () => void;
};

const FullTableContext = createContext<FullTableContextValue | null>(null);

/**
 * Compact or full table: a state of the page in the browser, without a trip to the server or a change of address, so the
 * tabs inside keep their country and division. Everything else follows in CSS, from `data-full` on this group: the
 * table's extra columns and the cards beside it.
 */
export function FullTableFrame({ className, children }: { className?: string; children: ReactNode }) {
  const [full, setFull] = useState(false);
  const value = useMemo(() => ({ full, toggle: () => setFull(!full) }), [full]);
  return (
    <FullTableContext.Provider value={value}>
      <div data-full={full || undefined} className={cn("group/standings", className)}>
        {children}
      </div>
    </FullTableContext.Provider>
  );
}

/** At the foot of the table's card, the way to the full table and back. */
export function FullTableToggle() {
  const t = useTranslations("standings");
  const context = useContext(FullTableContext);
  if (context === null) {
    throw new Error("FullTableToggle must be rendered inside FullTableFrame");
  }
  return (
    <button
      type="button"
      data-testid="standings-full-toggle"
      onClick={context.toggle}
      className="ml-auto cursor-pointer text-sm font-semibold text-(--club) transition-colors hover:text-(--club-hover) max-sm:min-h-11"
    >
      {t(context.full ? "fullTable.hide" : "fullTable.show")}
    </button>
  );
}
