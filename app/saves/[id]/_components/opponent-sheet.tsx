"use client";

import { EyeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
  const t = useTranslations("opponent");
  const locale = useLocale();
  const rows = [
    { label: preview.clubName, value: preview.averageRating, mine: false },
    { label: t("myEleven"), value: preview.managedAverageRating, mine: true },
  ];
  const best = Math.max(preview.averageRating, preview.managedAverageRating);
  return (
    <dl className="space-y-1.5" data-opponent="ratings">
      {rows.map((row) => (
        // On a phone, a shorter bar, and the club's name whole.
        <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_8rem_2.5rem] items-center gap-3 text-sm max-sm:grid-cols-[minmax(0,1fr)_4.5rem_2.5rem]">
          <dt className={cn("truncate max-sm:whitespace-normal", row.mine ? "font-semibold" : "text-muted-foreground")}>{row.label}</dt>
          <span aria-hidden className="h-1.5 rounded-full bg-border">
            <span
              // Fixed colors: the sheet is portaled out of the save layout, which sets --club.
              className={cn("block h-1.5 rounded-full", row.mine ? "bg-info" : "bg-foreground/60")}
              style={{ width: `${row.value}%` }}
            />
          </span>
          <dd className={cn("text-right font-heading font-bold tabular-nums", row.value === best && "text-win")}>
            {formatDecimal(row.value, locale)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What the « Voir l'adversaire » panel shows: the opponent's probable eleven on a read-only pitch, his starters'
 * rating against the managed club's, his last results and his top scorer.
 */
export function OpponentPanel({ preview }: { preview: OpponentPreview }) {
  const t = useTranslations("opponent");
  const locale = useLocale();
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
    <>
      <SheetHeader>
        <SheetTitle className="font-heading text-2xl" data-testid="opponent-title">
          {preview.clubName}
        </SheetTitle>
        <SheetDescription className="first-letter:uppercase">
          {formatShortDate(preview.matchDate, locale)} · {preview.atHome ? t("atHome") : t("away")} ·{" "}
          {t("likelyEleven", { formation: preview.formation })}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-6">
        <Pitch
          slots={slots}
          starters={starters}
          players={players}
          clubColors={preview.clubColors}
          label={t("pitchLabel", { club: preview.clubName })}
        />

        <section className="space-y-2">
          <SectionTitle>{t("averageRating")}</SectionTitle>
          <RatingComparison preview={preview} />
        </section>

        <section className="space-y-2">
          <SectionTitle>{t("recentResults")}</SectionTitle>
          {preview.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noMatch")}</p>
          ) : (
            <ol className="space-y-1.5" data-opponent="recent">
              {preview.recent.map((match) => (
                <li key={match.date.toISOString()} className="flex items-center gap-2.5 text-sm">
                  <ResultPill result={resultFor(match.scored, match.conceded, true)} />
                  <span className="w-10 font-heading font-bold tabular-nums">
                    {match.scored}-{match.conceded}
                  </span>
                  <span className="min-w-0 flex-1 truncate max-sm:whitespace-normal">
                    {match.atHome ? t("against", { club: match.againstName }) : t("at", { club: match.againstName })}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatShortDate(match.date, locale)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="space-y-2">
          <SectionTitle>{t("topScorer")}</SectionTitle>
          <p className="text-sm" data-opponent="top-scorer">
            {preview.topScorer === null ? (
              <span className="text-muted-foreground">{t("noGoal")}</span>
            ) : (
              <>
                <span className="font-semibold">{preview.topScorer.name}</span> ·{" "}
                {t("goals", { count: preview.topScorer.goals })}
              </>
            )}
          </p>
        </section>
      </div>
    </>
  );
}

/**
 * The « Voir l'adversaire » button and the panel it opens on the next opponent. Beside the page (on the lineup
 * editor), the panel is not modal: the page stays usable, so the manager adjusts his eleven while looking at the
 * opponent's, and only the close button or Escape closes it.
 */
export function OpponentSheet({ preview, besidePage = false }: { preview: OpponentPreview; besidePage?: boolean }) {
  const t = useTranslations("opponent");
  return (
    <Sheet modal={!besidePage} disablePointerDismissal={besidePage}>
      <SheetTrigger render={<Button size="sm" variant="outline" />} data-testid="view-opponent">
        <EyeIcon />
        {t("view")}
      </SheetTrigger>
      {/* The screen's whole width on a phone: the sheet's three quarters crushed the pitch and the names. */}
      <SheetContent showOverlay={!besidePage} className="w-full overflow-y-auto sm:max-w-md data-[side=right]:w-full">
        <OpponentPanel preview={preview} />
      </SheetContent>
    </Sheet>
  );
}
