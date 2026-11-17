import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrophyIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { Panel, PanelTitle } from "@/src/components/panel";
import { SegmentedLinks } from "@/src/components/segmented";
import { getEuropeView } from "@/src/db/europe-view";
import { seasonLabel } from "@/src/engine/world";
import { competitionName, europeKey } from "@/src/i18n/countries";
import { FixtureRow } from "../_components/fixture-row";
import { nextFixture } from "../_lib/fixture-window";
import { EuropeBracket } from "./_components/europe-bracket";
import { EuropeCard } from "./_components/europe-card";
import { EuropeTable } from "./_components/europe-table";
import { managedCompetition, shownCompetition } from "./_lib/europe";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("europe"))("title") };
}

type EuropePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The European competitions of the save's latest year (docs/design/europe.md § 6): the managed club's card on the bright
 * blue, whichever competition is shown; then the switch between the two and the one shown, the club's unless the address
 * asks for the other (`?c=eu.2`): its winner once the final is played, its league phase table, the club's matches when
 * it plays it, and its knockout bracket. No full orange here: the game's action stays in the column, as on the cup's page.
 */
export default async function EuropePage({ params, searchParams }: EuropePageProps) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, tWorld, view, query] = await Promise.all([
    getTranslations("europe"),
    getTranslations("world"),
    getEuropeView(id),
    searchParams,
  ]);
  if (view === null) {
    notFound();
  }
  const shown = shownCompetition(view, Array.isArray(query.c) ? query.c[0] : query.c);
  const managed = managedCompetition(view);
  // The club's matches belong to its own competition: shown with it only.
  const matches = shown.code === view.managedCode ? view.managedMatches : [];
  const next = nextFixture(matches);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 data-testid="europe-title" className="font-heading text-4xl font-bold">
          {t("title")}
        </h1>
        <p data-testid="europe-subtitle" className="text-sm text-muted-foreground tabular-nums">
          {t("subtitle", { season: seasonLabel(view.startYear) })}
        </p>
      </div>

      <EuropeCard competition={managed} matches={view.managedMatches} />

      <section aria-labelledby="europe-competition-title" data-testid="europe-competition" data-competition={shown.code} className="space-y-5">
        <h2 id="europe-competition-title" className="sr-only">
          {competitionName(shown.code, tWorld)}
        </h2>
        {/* The switch heads what it changes: the card above stays the club's. */}
        {view.competitions.length > 1 && (
          <SegmentedLinks
            label={t("switch")}
            testId="europe-switch"
            className="lg:max-w-md"
            links={view.competitions.map((competition) => ({
              href: `/saves/${id}/europe?c=${competition.code}`,
              label: competitionName(competition.code, tWorld),
              active: competition.code === shown.code,
              testId: `europe-switch-${europeKey(competition.code) ?? competition.code}`,
              // The switch lies under the club's card: the other competition opens where the player is.
              scroll: false,
            }))}
          />
        )}

        {shown.winner !== null && (
          <Panel data-testid="europe-winner" className="flex items-center gap-4">
            <TrophyIcon aria-hidden className="size-8 shrink-0 text-(--club)" />
            <div className="min-w-0">
              <PanelTitle>{t("winner")}</PanelTitle>
              <p className="font-heading text-3xl font-bold wrap-break-word">{shown.winner.name}</p>
            </div>
          </Panel>
        )}

        {/* From xl, the club's matches beside the table. */}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-5">
          <EuropeTable competition={shown} className={matches.length > 0 ? "xl:col-span-3" : "xl:col-span-5"} />
          {matches.length > 0 && (
            <Panel aria-labelledby="europe-matches-title" data-testid="europe-matches" className="flex min-w-0 flex-col gap-3 xl:col-span-2">
              <h3 id="europe-matches-title" className="font-heading text-[1.75rem] leading-none">
                {t("matches.title")}
              </h3>
              <ol className="space-y-1.5">
                {matches.map((fixture) => (
                  <FixtureRow key={fixture.id} saveId={id} fixture={fixture} next={fixture.id === next?.id} dense />
                ))}
              </ol>
            </Panel>
          )}
        </div>

        <EuropeBracket competition={shown} />
      </section>
    </div>
  );
}
