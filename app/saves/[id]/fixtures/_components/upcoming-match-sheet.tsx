"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/src/components/ui/sheet";
import type { OpponentPreview } from "@/src/db/opponent";
import { opponentPreviewAction } from "../../actions";
import { OpponentPanel } from "../../_components/opponent-sheet";

type Loaded = { kind: "loading" } | { kind: "ready"; preview: OpponentPreview } | { kind: "failed" };

/**
 * The « Voir l'adversaire » panel of an upcoming match of the calendar. The preview is loaded when the panel first
 * opens: a month holds several matches, and most are never opened.
 */
export function UpcomingMatchSheet({
  saveId,
  fixtureId,
  className,
  children,
}: {
  saveId: string;
  fixtureId: string;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("fixtures");
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const load = async () => {
    setLoaded({ kind: "loading" });
    try {
      const preview = await opponentPreviewAction(saveId, fixtureId);
      setLoaded(preview === null ? { kind: "failed" } : { kind: "ready", preview });
    } catch {
      setLoaded({ kind: "failed" });
    }
  };

  return (
    <Sheet
      onOpenChange={(open) => {
        if (open && (loaded === null || loaded.kind === "failed")) {
          void load();
        }
      }}
    >
      <SheetTrigger className={className} data-testid="upcoming-match-trigger">{children}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="upcoming-match-sheet">
        {loaded?.kind === "ready" ? (
          <OpponentPanel preview={loaded.preview} />
        ) : (
          <SheetHeader>
            <SheetTitle className="font-heading text-2xl">
              {loaded?.kind === "failed" ? t("opponent.unavailable") : t("opponent.loading")}
            </SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}
