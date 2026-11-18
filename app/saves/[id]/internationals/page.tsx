import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { Panel, PanelTitle } from "@/src/components/panel";
import { getNationsView, type InternationalResult, type NationView } from "@/src/db/nations-view";
import type { Translator } from "@/src/i18n/translator";
import { formatDayMonth } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nations"))("title") };
}

/** A nation by its code in a pill, as a club by its initials: never a federation's crest. */
function NationPill({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn("inline-grid h-7 min-w-11 place-items-center rounded-md bg-secondary px-1.5 font-heading text-sm leading-none", className)}>
      {code}
    </span>
  );
}

/** A result of the last break: the two nations, the score, the goals of the managed club's players marked. */
function ResultLine({ result, tWorld }: { result: InternationalResult; tWorld: Translator<"world"> }) {
  const goals = (side: "home" | "away") =>
    result.scorers
      .filter((scorer) => scorer.side === side)
      .map((scorer) => (
        <span key={`${scorer.minute}-${scorer.name}`} className={cn(scorer.managed && "font-semibold text-(--club)")}>
          {scorer.name} {scorer.minute}&apos;
        </span>
      ));
  return (
    <li data-testid="internationals-result" className="space-y-1 py-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <NationPill code={result.home} />
          <span className="truncate text-sm font-semibold">{tWorld(`nationalities.${result.home}`)}</span>
        </span>
        <span className="font-heading text-xl tabular-nums">
          {result.homeGoals}-{result.awayGoals}
        </span>
        <span className="flex min-w-0 flex-row-reverse items-center gap-2">
          <NationPill code={result.away} />
          <span className="truncate text-right text-sm font-semibold">{tWorld(`nationalities.${result.away}`)}</span>
        </span>
      </div>
      {result.scorers.length > 0 && (
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <p className="flex flex-wrap gap-x-1.5">{goals("home")}</p>
          <p className="flex flex-wrap justify-end gap-x-1.5 text-right">{goals("away")}</p>
        </div>
      )}
    </li>
  );
}

/** A nation, its strength's rank and its eleven's rating; open, its 23, line by line, the managed club's players marked. */
function NationRow({ nation, t, tWorld, tPositions }: { nation: NationView; t: Translator<"nations">; tWorld: Translator<"world">; tPositions: Translator<"positions"> }) {
  const managed = nation.players.filter((player) => player.managed).length;
  return (
    <li data-testid="internationals-nation" data-code={nation.code} data-rank={nation.rank}>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="w-6 text-right font-heading text-lg tabular-nums text-muted-foreground">{nation.rank}</span>
          <NationPill code={nation.code} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block font-semibold wrap-break-word">{tWorld(`nationalities.${nation.code}`)}</span>
            <span className="block text-xs text-muted-foreground">
              {[t("outside", { count: nation.outside }), ...(managed > 0 ? [t("yours", { count: managed })] : [])].join(" · ")}
            </span>
          </span>
          <span className="text-right leading-tight">
            <span className="block font-heading text-xl tabular-nums">{nation.eleven.toFixed(1)}</span>
            <span className="block text-[0.6875rem] text-muted-foreground">{t("eleven")}</span>
          </span>
        </summary>
        <ol className="mb-3 divide-y rounded-lg bg-background px-3 text-sm" data-testid="internationals-squad">
          {nation.players.map((player) => (
            <li key={player.key} className="flex items-center gap-3 py-2" data-managed={player.managed}>
              <span className="w-8 shrink-0 text-xs font-bold text-muted-foreground">{tPositions(`short.${player.position}`)}</span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className={cn("block wrap-break-word", player.managed && "font-semibold text-(--club)")}>{player.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {[player.club ?? t("outsideLeagues"), t("caps", { count: player.caps })].join(" · ")}
                </span>
              </span>
              <span className="font-heading text-lg tabular-nums">{player.overall}</span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

/**
 * The national teams of the save (docs/design/selections.md § 9.5): its next international break, the results of the last
 * one, and the 14 nations as they would be called today, by strength, each with its 23. No full orange here: the game's
 * action stays in the column, as on the other screens of Match. 404 in a save without nations.
 */
export default async function InternationalsPage({ params }: PageProps<"/saves/[id]/internationals">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, tWorld, tPositions, locale, view] = await Promise.all([
    getTranslations("nations"),
    getTranslations("world"),
    getTranslations("positions"),
    getLocale(),
    getNationsView(id),
  ]);
  if (view === null) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 data-testid="internationals-title" className="font-heading text-4xl font-bold">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <section data-testid="internationals-next" className="space-y-1 rounded-card bg-primary p-5 text-primary-foreground">
        <p className="eyebrow text-on-blue">{t("nextBreak")}</p>
        <p className="font-heading text-2xl normal-case">
          {view.nextBreak === null
            ? t("noBreak")
            : t("breakDates", { from: formatDayMonth(view.nextBreak.from, locale), to: formatDayMonth(view.nextBreak.to, locale) })}
        </p>
        <p className="text-sm text-on-blue">{t("explain")}</p>
      </section>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <Panel aria-labelledby="internationals-nations-title" className="space-y-2">
          <PanelTitle id="internationals-nations-title">{t("nations")}</PanelTitle>
          <p className="text-xs text-muted-foreground">{t("nationsExplain")}</p>
          <ol className="divide-y">
            {view.nations.map((nation) => (
              <NationRow key={nation.code} nation={nation} t={t} tWorld={tWorld} tPositions={tPositions} />
            ))}
          </ol>
        </Panel>

        <Panel aria-labelledby="internationals-last-title" className="space-y-2" data-testid="internationals-last">
          <PanelTitle id="internationals-last-title">
            {view.lastBreak === null
              ? t("lastBreak")
              : t("lastBreakDates", { from: formatDayMonth(view.lastBreak.from, locale), to: formatDayMonth(view.lastBreak.to, locale) })}
          </PanelTitle>
          {view.lastBreak === null ? (
            <p className="text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <ol className="divide-y">
              {view.lastBreak.results.map((result) => (
                <ResultLine key={`${result.date.toISOString()}-${result.home}`} result={result} tWorld={tWorld} />
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
