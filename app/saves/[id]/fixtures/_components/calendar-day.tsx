"use client";

import { XIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import { formatDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { useSimulation } from "../../_components/simulation";

/**
 * A day of the month grid. While the manager picks a day to simulate to, a day after the save's current date
 * becomes one button over the whole cell; the others fade.
 */
export function CalendarDay({
  day,
  pickable,
  today,
  className,
  children,
}: {
  day: string; // « 2026-08-31 »
  pickable: boolean;
  today: boolean; // the save's current date
  className?: string;
  children: ReactNode;
}) {
  const { picking, start } = useSimulation();
  const label = formatDate(new Date(`${day}T00:00:00.000Z`));

  return (
    <div
      role="gridcell"
      aria-current={today ? "date" : undefined}
      data-day={day}
      className={cn("relative", className, picking && !pickable && "opacity-40", picking && pickable && "hover:bg-(--club)/12")}
    >
      {children}
      {picking && pickable && (
        <button
          type="button"
          aria-label={`Simuler jusqu'au ${label}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-(--club)"
          onClick={() => start({ kind: "date", date: day })}
        />
      )}
    </div>
  );
}

/** Above the grid while the manager picks a day: what to do, and how to give up. Escape gives up too. */
export function PickBanner() {
  const { picking, cancelPicking } = useSimulation();

  useEffect(() => {
    if (!picking) {
      return;
    }
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelPicking();
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [picking, cancelPicking]);

  if (!picking) {
    return null;
  }
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-(--club)/40 bg-(--club)/10 px-4 py-2.5 text-sm"
    >
      <span className="flex-1">
        <span className="font-semibold">Simuler jusqu&apos;à une date :</span> cliquez sur un jour à venir de la saison.
      </span>
      <Button variant="ghost" size="sm" onClick={cancelPicking}>
        <XIcon />
        Annuler
      </Button>
    </div>
  );
}
