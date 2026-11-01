"use client";

import { FastForwardIcon, LightbulbIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";
import { rememberSeen, type Tip } from "../_lib/first-steps";

type TipFrameProps = {
  saveId: string;
  tip: Tip;
  className?: string;
  children: ReactNode;
};

/**
 * A tip's frame, in the flow of the page: it covers no control. Its cross hides it at once and remembers it in a cookie
 * the page reads; the refresh keeps it closed on the browser's Back. The simulation's tip has the icon of the button it
 * speaks of.
 */
export function TipFrame({ saveId, tip, className, children }: TipFrameProps) {
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (!open) {
    return null;
  }
  const close = () => {
    rememberSeen(saveId, tip);
    setOpen(false);
    router.refresh();
  };
  const Icon = tip === "simulation" ? FastForwardIcon : LightbulbIcon;
  return (
    <div
      role="note"
      data-testid={`tip-${tip}`}
      className={cn("flex items-center gap-3 rounded-lg border border-(--club)/40 bg-(--club)/10 py-1.5 pr-1.5 pl-3", className)}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm">{children}</p>
      <button
        type="button"
        onClick={close}
        aria-label={tCommon("close")}
        data-testid={`tip-${tip}-close`}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:size-11"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
