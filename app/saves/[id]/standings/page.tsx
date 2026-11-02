import { getLocale, getTranslations } from "next-intl/server";
import { competitionName } from "@/src/i18n/countries";
import type { Metadata } from "next";
import { requireOwnedSave } from "@/src/auth/current-user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { getLatestSeasonTables } from "@/src/db/standings";
import { seasonLabel } from "@/src/engine/world";
import { FullTableFrame } from "./_components/full-table";
import { SideCards } from "./_components/side-cards";
import { StandingsCard } from "./_components/standings-card";
import { StandingsTable } from "./_components/standings-table";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("standings"))("title") };
}

export default async function StandingsPage({ params }: PageProps<"/saves/[id]/standings">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, tWorld, locale] = await Promise.all([getTranslations("standings"), getTranslations("world"), getLocale()]);
  const tables = await getLatestSeasonTables(id);
  const defaultTable = tables.find((table) => table.hasManagedClub) ?? tables[0];

  if (defaultTable === undefined) {
    return (
      <p data-testid="standings-empty" className="text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  // A save with the second divisions: a tab per country, then Division 1 / Division 2; otherwise a tab per competition.
  // By country, sorted by its name in the player's language.
  const countries = [...Map.groupBy(tables, (table) => table.country)].sort(([a], [b]) =>
    tWorld(`countries.${a}`).localeCompare(tWorld(`countries.${b}`), locale),
  );
  const divided = countries.some(([, divisions]) => divisions.length > 1);
  const managed = defaultTable.rows.find((row) => row.isManaged);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 data-testid="standings-title" className="font-heading text-4xl font-bold">
            {t("title")}
          </h1>
          <p data-testid="standings-season" className="text-sm text-muted-foreground tabular-nums">
            {t("season", { season: seasonLabel(defaultTable.startYear) })}
          </p>
        </div>
        {managed !== undefined && managed.played > 0 && (
          <p data-testid="standings-summary" className="rounded-full bg-card px-3.5 py-2 text-sm font-bold tabular-nums">
            {t("summary", {
              played: managed.played,
              matchdays: 2 * (defaultTable.rows.length - 1),
              rank: managed.rank,
              points: managed.points,
            })}
          </p>
        )}
      </div>

      <FullTableFrame className="grid grid-cols-1 gap-5 xl:grid-cols-5 data-full:xl:grid-cols-1">
        <div className="xl:col-span-3 xl:group-data-full/standings:col-span-1">
          {divided ? (
            <Tabs defaultValue={defaultTable.country} className="gap-4">
              <TabsList aria-label={t("countries")} className="flex-wrap">
                {countries.map(([country]) => (
                  <TabsTrigger key={country} value={country} data-testid={`standings-country-${country}`}>
                    {tWorld(`countries.${country}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {countries.map(([country, divisions]) => {
                const countryLabel = tWorld(`countries.${country}`);
                const ordered = [...divisions].sort((a, b) => a.tier - b.tier);
                const shown = ordered.find((table) => table.hasManagedClub) ?? ordered[0];
                return (
                  <TabsContent key={country} value={country}>
                    <Tabs defaultValue={shown.code}>
                      <StandingsCard
                        title={countryLabel}
                        divisions={
                          <TabsList aria-label={t("divisions", { country: countryLabel })} className="bg-background">
                            {ordered.map((table) => (
                              <TabsTrigger
                                key={table.code}
                                value={table.code}
                                className="px-4 max-sm:px-2.5 sm:min-h-9.5"
                                data-testid={`standings-division-${table.tier}`}
                              >
                                {t("division", { tier: table.tier })}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                        }
                      >
                        {ordered.map((table) => (
                          <TabsContent key={table.code} value={table.code}>
                            <StandingsTable table={table} divided />
                          </TabsContent>
                        ))}
                      </StandingsCard>
                    </Tabs>
                  </TabsContent>
                );
              })}
            </Tabs>
          ) : (
            <Tabs defaultValue={defaultTable.code} className="gap-4">
              <TabsList className="flex-wrap">
                {tables.map((table) => (
                  <TabsTrigger key={table.code} value={table.code} data-testid={`standings-competition-${table.code}`}>
                    {competitionName(table.code, tWorld)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {tables.map((table) => (
                <TabsContent key={table.code} value={table.code}>
                  <StandingsCard title={competitionName(table.code, tWorld)}>
                    <StandingsTable table={table} divided={false} />
                  </StandingsCard>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>

        {/* Beside the table on a wide screen, under it side by side on a smaller one, one taking the whole width if alone;
            on a phone, the Calendrier and Coupe tabs have them. The full table takes their place. */}
        <div className="grid content-start items-start gap-5 group-data-full/standings:hidden max-lg:hidden lg:auto-cols-fr lg:grid-flow-col xl:col-span-2 xl:grid-flow-row">
          <SideCards saveId={id} />
        </div>
      </FullTableFrame>
    </div>
  );
}
