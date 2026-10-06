"use client";

import { EyeIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/src/components/ui/sheet";
import type { LineupPlayer } from "@/src/db/lineup";
import type { OpponentPreview } from "@/src/db/opponent";
import { FORMATIONS } from "@/src/engine/formations";
import { formatDecimal, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { resultFor } from "../_lib/results";
import { Pitch } from "./pitch";
import { ResultPill } from "./result-pill";

function SectionTitle({ children }: { children: string }) {
  return <h3 className="eyebrow">{children}</h3>;
}

/** His starters' mean rating against the managed club's, the higher one in the strong color. */
function RatingComparison({ preview }: { preview: OpponentPreview }) {
  const rows = [
    { label: preview.clubName, value: preview.averageRating, mine: false },
    { label: "Mon onze", value: preview.managedAverageRating, mine: true },
  ];
  const best = Math.max(preview.averageRating, preview.managedAverageRating);
  return (
    <dl className="space-y-1.5" data-opponent="ratings">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_8rem_2.5rem] items-center gap-3 text-sm">
          <dt className={cn("truncate", row.mine ? "font-semibold" : "text-muted-foreground")}>{row.label}</dt>
          <span aria-hidden className="h-1.5 rounded-full bg-border">
            <span
              // Fixed colors: the sheet is portaled out of the save layout, which sets --club.
              className={cn("block h-1.5 rounded-full", row.mine ? "bg-info" : "bg-foreground/60")}
              style={{ width: `${row.value}%` }}
            />
          </span>
          <dd className={cn("text-right font-heading font-bold tabular-nums", row.value === best && "text-win")}>
            {formatDecimal(row.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The « Voir l'adversaire » button and the panel it opens: the next opponent's probable eleven on a read-only
 * pitch, his starters' rating against the managed club's, his last results and his top scorer. Beside the page (on
 * the lineup editor), the panel is not modal: the page stays usable, so the manager adjusts his eleven while
 * looking at the opponent's, and only the close button or Escape closes it.
 */
export function OpponentSheet({ preview, besidePage = false }: { preview: OpponentPreview; besidePage?: boolean }) {
  const slots = FORMATIONS[preview.formation];
  const { starters, players } = useMemo(() => {
    const keys: (string | null)[] = slots.map(() => null);
    const byKey = new Map<string, LineupPlayer>();
    for (const { player, index } of preview.lineup.starters) {
      keys[index] = player.id;
      byKey.set(player.id, player);
    }
    return { starters: keys, players: byKey };
  }, [preview.lineup, slots]);

  return (
    <Sheet modal={!besidePage} disablePointerDismissal={besidePage}>
      <SheetTrigger render={<Button size="sm" variant="outline" />}>
        <EyeIcon />
        Voir l&apos;adversaire
      </SheetTrigger>
      <SheetContent showOverlay={!besidePage} className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading text-2xl">{preview.clubName}</SheetTitle>
          <SheetDescription className="first-letter:uppercase">
            {formatShortDate(preview.matchDate)} · {preview.atHome ? "à domicile" : "à l'extérieur"} · onze probable en{" "}
            {preview.formation}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          <Pitch
            slots={slots}
            starters={starters}
            players={players}
            clubColors={preview.clubColors}
            label={`Onze probable de ${preview.clubName}`}
          />

          <section className="space-y-2">
            <SectionTitle>Note moyenne des titulaires</SectionTitle>
            <RatingComparison preview={preview} />
          </section>

          <section className="space-y-2">
            <SectionTitle>Derniers résultats</SectionTitle>
            {preview.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun match joué.</p>
            ) : (
              <ol className="space-y-1.5" data-opponent="recent">
                {preview.recent.map((match) => (
                  <li key={match.date.toISOString()} className="flex items-center gap-2.5 text-sm">
                    <ResultPill result={resultFor(match.scored, match.conceded, true)} />
                    <span className="w-10 font-heading font-bold tabular-nums">
                      {match.scored}-{match.conceded}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {match.atHome ? "contre" : "à"} {match.againstName}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatShortDate(match.date)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="space-y-2">
            <SectionTitle>Meilleur buteur de la saison</SectionTitle>
            <p className="text-sm" data-opponent="top-scorer">
              {preview.topScorer === null ? (
                <span className="text-muted-foreground">Aucun but cette saison.</span>
              ) : (
                <>
                  <span className="font-semibold">{preview.topScorer.name}</span> ·{" "}
                  {preview.topScorer.goals} but{preview.topScorer.goals > 1 ? "s" : ""}
                </>
              )}
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
