import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { Panel, PanelTitle } from "@/src/components/panel";
import {
  CYCLE_BREAKS,
  getNationsView,
  type CampaignView,
  type InternationalResult,
  type NationView,
  type TournamentView,
  type ZoneTableView,
} from "@/src/db/nations-view";
import { FINAL_ROUND, FRIENDLY, OLD_CONTINENT_CUP, SEMI_FINAL_ROUND, type TournamentCode } from "@/src/engine/tournaments";
import type { Translator } from "@/src/i18n/translator";
import { formatDayMonth } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { ScoreNotes } from "../_components/score-notes";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nations"))("title") };
}

const GROUP_LETTERS = ["A", "B"] as const;

/** A tournament's name with its year: « Coupe du Vieux Continent 2028 ». */
const tournamentName = (tournament: TournamentCode, year: number, t: Translator<"nations">): string =>
  t("tournamentYear", { name: t(tournament === OLD_CONTINENT_CUP ? "tournaments.eu" : "tournaments.world"), year });

/** What a match was: a friendly, a qualifiers' matchday, a group's matchday, a semi-final or the final. */
function stageOf(result: InternationalResult, t: Translator<"nations">): string {
  if (result.competition === FRIENDLY) {
    return t("stages.friendly");
  }
  if (result.competition === "int.qual.eu" || result.competition === "int.qual.world") {
    return t("stages.qualifier", { round: result.round });
  }
  if (result.round === SEMI_FINAL_ROUND) {
    return t("stages.semiFinal");
  }
  if (result.round === FINAL_ROUND) {
    return t("stages.final");
  }
  return t("stages.group", { group: GROUP_LETTERS[result.pool ?? 0], round: result.round });
}

/** A nation by its code in a pill, as a club by its initials: never a federation's crest. */
function NationPill({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn("inline-grid h-7 min-w-11 place-items-center rounded-md bg-secondary px-1.5 font-heading text-sm leading-none", className)}>
      {code}
    </span>
  );
}

/** A played match: its stage, the two nations, the score (« a.p. », « 5-3 t.a.b. »), the managed club's players' goals marked. */
function ResultLine({ result, t, tWorld }: { result: InternationalResult; t: Translator<"nations">; tWorld: Translator<"world"> }) {
  const goals = (side: "home" | "away") =>
    result.scorers
      .filter((scorer) => scorer.side === side)
      .map((scorer, index) => (
        <span key={`${scorer.minute}-${scorer.name}-${index}`} className={cn(scorer.managed && "font-semibold text-(--club)")}>
          {scorer.name} {scorer.minute}&apos;
        </span>
      ));
  return (
    <li data-testid="internationals-result" data-competition={result.competition} data-round={result.round} className="space-y-1 py-2.5">
      <p className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">{stageOf(result, t)}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <NationPill code={result.home} />
          <span className="truncate text-sm font-semibold">{tWorld(`nationalities.${result.home}`)}</span>
        </span>
        <span className="flex flex-col items-center leading-none">
          <span className="font-heading text-xl tabular-nums">
            {result.homeGoals}-{result.awayGoals}
          </span>
          <ScoreNotes
            match={{ decidedBy: result.decidedBy, homePenalties: result.penalties?.home ?? null, awayPenalties: result.penalties?.away ?? null }}
            className="mt-0.5"
          />
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

/** The figures of a table's row, in narrow columns: played, goal difference, points. */
const TABLE_COLUMNS = "grid grid-cols-[1.25rem_minmax(0,1fr)_2rem_2.5rem_2.5rem] items-center gap-x-2";

function TableHead({ t }: { t: Translator<"nations"> }) {
  return (
    <div className={cn(TABLE_COLUMNS, "px-1 pb-1 text-[0.6875rem] font-semibold text-muted-foreground uppercase")}>
      <span />
      <span>{t("table.nation")}</span>
      <abbr title={t("table.playedTitle")} className="text-right no-underline">
        {t("table.played")}
      </abbr>
      <abbr title={t("table.differenceTitle")} className="text-right no-underline">
        {t("table.difference")}
      </abbr>
      <abbr title={t("table.pointsTitle")} className="text-right no-underline">
        {t("table.points")}
      </abbr>
    </div>
  );
}

/** A zone's qualifiers: its table, its qualifying places above a dashed line. */
function ZoneTable({ zone, t, tWorld }: { zone: ZoneTableView; t: Translator<"nations">; tWorld: Translator<"world"> }) {
  return (
    <section data-testid="internationals-zone" data-zone={zone.zone} className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="eyebrow">{t(`campaign.zone.${zone.zone}`)}</h3>
        <p className="text-xs text-muted-foreground">{t("campaign.places", { count: zone.places })}</p>
      </div>
      <TableHead t={t} />
      <ol className="text-sm">
        {zone.rows.map((row) => {
          const qualified = row.rank <= zone.places;
          return (
            <li
              key={row.code}
              data-testid="internationals-zone-row"
              data-code={row.code}
              data-qualified={qualified}
              className={cn(
                TABLE_COLUMNS,
                "min-h-10 border-b px-1 py-1 last:border-b-0",
                row.rank === zone.places && "border-b-2 border-dashed border-highlight/60",
              )}
            >
              <span className={cn("text-right font-heading tabular-nums", qualified ? "text-highlight" : "text-muted-foreground")}>{row.rank}</span>
              <span className="flex min-w-0 items-center gap-2">
                <NationPill code={row.code} className="h-6 min-w-10 text-xs" />
                <span className="truncate font-semibold">{tWorld(`nationalities.${row.code}`)}</span>
              </span>
              <span className="text-right tabular-nums">{row.played}</span>
              <span className="text-right tabular-nums">{row.goalsFor - row.goalsAgainst > 0 ? `+${row.goalsFor - row.goalsAgainst}` : row.goalsFor - row.goalsAgainst}</span>
              <span className="text-right font-heading text-base tabular-nums">{row.points}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The qualifiers of the cycle in progress, zone by zone (the Old Continent cycle's World zone plays friendlies). */
function CampaignPanel({ campaign, t, tWorld }: { campaign: CampaignView; t: Translator<"nations">; tWorld: Translator<"world"> }) {
  return (
    <Panel aria-labelledby="internationals-campaign-title" className="space-y-4" data-testid="internationals-campaign" data-tournament={campaign.tournament}>
      <div className="space-y-0.5">
        <PanelTitle id="internationals-campaign-title">
          {t("campaign.title")} · {tournamentName(campaign.tournament, campaign.year, t)}
        </PanelTitle>
        <p className="text-sm text-muted-foreground">
          {campaign.draw === null ? t("campaign.progress", { played: campaign.breaksPlayed, total: CYCLE_BREAKS }) : t("campaign.drawn")}
        </p>
      </div>
      {campaign.zones.map((zone) => (
        <ZoneTable key={zone.zone} zone={zone} t={t} tWorld={tWorld} />
      ))}
      {campaign.tournament === OLD_CONTINENT_CUP && <p className="text-xs text-muted-foreground">{t("campaign.friendliesOnly")}</p>}
    </Panel>
  );
}

/** A tournament, drawn or played: its winner, its groups, its knockout matches, the managed club's players in it. */
function TournamentPanel({
  tournament,
  eyebrow,
  t,
  tWorld,
  locale,
}: {
  tournament: TournamentView;
  eyebrow: string;
  t: Translator<"nations">;
  tWorld: Translator<"world">;
  locale: Parameters<typeof formatDayMonth>[1];
}) {
  const played = tournament.state === "played";
  const knockouts = tournament.results.filter((result) => result.round >= SEMI_FINAL_ROUND);
  const groupMatches = tournament.results.filter((result) => result.round < SEMI_FINAL_ROUND);
  const titleId = `internationals-tournament-${tournament.state}`;
  return (
    <Panel aria-labelledby={titleId} className="space-y-4" data-testid="internationals-tournament" data-state={tournament.state} data-tournament={tournament.tournament}>
      <div className="space-y-0.5">
        <p className="eyebrow text-muted-foreground">{eyebrow}</p>
        <PanelTitle id={titleId}>{tournamentName(tournament.tournament, tournament.year, t)}</PanelTitle>
        <p className="text-sm text-muted-foreground">
          {t("tournament.dates", { from: formatDayMonth(tournament.from, locale), to: formatDayMonth(tournament.to, locale) })}
        </p>
      </div>

      {played && tournament.winner !== null && (
        <div data-testid="internationals-winner" data-code={tournament.winner} className="flex items-center gap-3 rounded-card bg-primary p-4 text-primary-foreground">
          <NationPill code={tournament.winner} className="h-9 min-w-14 bg-(--club) text-base text-background" />
          <div className="min-w-0 leading-tight">
            <p className="eyebrow text-on-blue">{t("tournament.winner")}</p>
            <p className="font-heading text-xl normal-case">
              {t("tournament.winnerLine", { nation: tWorld(`nationalities.${tournament.winner}`), name: t(tournament.tournament === OLD_CONTINENT_CUP ? "tournaments.eu" : "tournaments.world"), year: tournament.year })}
            </p>
            {tournament.runnerUp !== null && (
              <p className="text-sm text-on-blue">{t("tournament.runnerUp", { nation: tWorld(`nationalities.${tournament.runnerUp}`) })}</p>
            )}
          </div>
        </div>
      )}
      {!played && <p className="text-sm">{t("tournament.toPlay")}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tournament.groups.map((group) => (
          <section key={group.pool} data-testid="internationals-group" data-group={GROUP_LETTERS[group.pool]} className="space-y-1.5">
            <h3 className="eyebrow">{t("tournament.group", { group: GROUP_LETTERS[group.pool] })}</h3>
            {played && <TableHead t={t} />}
            <ol className="text-sm">
              {group.rows.map((row) => (
                <li
                  key={row.code}
                  data-testid="internationals-group-row"
                  data-code={row.code}
                  className={cn(played ? TABLE_COLUMNS : "flex items-center gap-2", "min-h-10 border-b px-1 py-1 last:border-b-0")}
                >
                  {played && <span className={cn("text-right font-heading tabular-nums", row.rank <= 2 ? "text-highlight" : "text-muted-foreground")}>{row.rank}</span>}
                  <span className="flex min-w-0 items-center gap-2">
                    <NationPill code={row.code} className="h-6 min-w-10 text-xs" />
                    <span className="truncate font-semibold">{tWorld(`nationalities.${row.code}`)}</span>
                  </span>
                  {played && (
                    <>
                      <span className="text-right tabular-nums">{row.played}</span>
                      <span className="text-right tabular-nums">
                        {row.goalsFor - row.goalsAgainst > 0 ? `+${row.goalsFor - row.goalsAgainst}` : row.goalsFor - row.goalsAgainst}
                      </span>
                      <span className="text-right font-heading text-base tabular-nums">{row.points}</span>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      {knockouts.length > 0 && (
        <section data-testid="internationals-bracket" className="space-y-1">
          <h3 className="eyebrow">{t("tournament.knockouts")}</h3>
          <ol className="divide-y">
            {knockouts.map((result) => (
              <ResultLine key={`${result.round}-${result.home}`} result={result} t={t} tWorld={tWorld} />
            ))}
          </ol>
        </section>
      )}

      {groupMatches.length > 0 && (
        <details className="group rounded-lg bg-background px-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold [&::-webkit-details-marker]:hidden">
            {t("tournament.groupMatches")}
          </summary>
          <ol className="divide-y pb-2">
            {groupMatches.map((result) => (
              <ResultLine key={`${result.date.toISOString()}-${result.home}`} result={result} t={t} tWorld={tWorld} />
            ))}
          </ol>
        </details>
      )}

      {played && (
        <section data-testid="internationals-yours" className="space-y-1">
          <h3 className="eyebrow">{t("tournament.yours")}</h3>
          {tournament.yours.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tournament.noneOfYours")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {tournament.yours.map((player) => (
                <li key={player.name} className="flex min-h-10 items-center gap-3 py-1.5" data-champion={player.champion}>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block font-semibold wrap-break-word text-(--club)">{player.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t("tournament.yourLine", { nation: player.nation, matches: player.matches, goals: player.goals })}
                    </span>
                  </span>
                  {player.champion && (
                    <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">{t("tournament.champion")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Panel>
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
 * The national teams of the save (docs/design/selections.md § 9.5): its next international break and the tournament its
 * cycle leads to, the qualifiers' tables, the tournament drawn then played (its groups, its knockout matches, its winner,
 * the club's players in it), the results of the last break, and the 14 nations as they would be called today, by
 * strength, each with its 23. No full orange here: the game's action stays in the column, as on the other screens of
 * Match. 404 in a save without nations.
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
  const { campaign, lastTournament, freshTournament } = view;

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
        {campaign !== null && (
          <p data-testid="internationals-campaign-line" className="text-sm font-semibold">
            {tournamentName(campaign.tournament, campaign.year, t)} ·{" "}
            {campaign.draw === null ? t("campaign.progress", { played: campaign.breaksPlayed, total: CYCLE_BREAKS }) : t("campaign.drawn")}
          </p>
        )}
        <p className="text-sm text-on-blue">{t("explain")}</p>
      </section>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        {freshTournament && lastTournament !== null && (
          <TournamentPanel tournament={lastTournament} eyebrow={t("tournament.last")} t={t} tWorld={tWorld} locale={locale} />
        )}
        {campaign?.draw != null && (
          <TournamentPanel tournament={campaign.draw} eyebrow={t("campaign.eyebrow")} t={t} tWorld={tWorld} locale={locale} />
        )}
        {campaign !== null && <CampaignPanel campaign={campaign} t={t} tWorld={tWorld} />}
        {!freshTournament && lastTournament !== null && (
          <TournamentPanel tournament={lastTournament} eyebrow={t("tournament.last")} t={t} tWorld={tWorld} locale={locale} />
        )}

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
                <ResultLine key={`${result.date.toISOString()}-${result.home}`} result={result} t={t} tWorld={tWorld} />
              ))}
            </ol>
          )}
        </Panel>

        <Panel aria-labelledby="internationals-nations-title" className="space-y-2">
          <PanelTitle id="internationals-nations-title">{t("nations")}</PanelTitle>
          <p className="text-xs text-muted-foreground">{t("nationsExplain")}</p>
          <ol className="divide-y">
            {view.nations.map((nation) => (
              <NationRow key={nation.code} nation={nation} t={t} tWorld={tWorld} tPositions={tPositions} />
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
