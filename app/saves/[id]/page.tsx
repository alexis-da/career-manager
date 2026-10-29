import { competitionName } from "@/src/i18n/countries";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, requireOwnedSave } from "@/src/auth/current-user";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { getChallengeBanner } from "@/src/db/challenge-view";
import type { ClubPreview, Dashboard } from "@/src/db/dashboard";
import { getDashboard } from "@/src/db/dashboard";
import { getManagedLineup, type ManagedLineup } from "@/src/db/lineup";
import { getOpponentPreview } from "@/src/db/opponent";
import { hasPlayedMatch } from "@/src/db/saves";
import { nextTransferWindowOpening, transferWindowCloseDate } from "@/src/engine/world";
import { formatDayMonth, formatDecimal, formatMillions, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { AccountBanner } from "./_components/account-banner";
import { ChallengeBanner } from "./_components/challenge-banner";
import { OpponentSheet } from "./_components/opponent-sheet";
import { Panel, PanelTitle } from "./_components/panel";
import { ResultPill } from "./_components/result-pill";
import { ScoreNotes } from "./_components/score-notes";
import { positionTextClass } from "./_lib/positions";
import { RESULT_CLASSES } from "./_lib/results";
import { matchResultFor, stageLabel } from "./_lib/stage";
import { MANAGED_ROW, TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tableau de bord" };

/** Below this many players under contract, the dashboard warns. */
const SQUAD_ALERT_SIZE = 18;
const MIN_GOALKEEPERS = 2;
/** From this share of the wage budget, the payroll gauge turns to warning. */
const PAYROLL_WARNING_SHARE = 0.9;
const EXPIRING_NAMES_SHOWN = 3;

type Severity = "warning" | "danger" | "ok";

type Alert = {
  severity: Severity;
  title: string;
  detail: string;
  action?: { label: string; href: string };
};

const SEVERITY_CLASSES: Record<Severity, { band: string; surface: string }> = {
  warning: { band: "bg-warning", surface: "border-warning/25 bg-warning/5" },
  danger: { band: "bg-loss", surface: "border-loss/25 bg-loss/5" },
  ok: { band: "bg-win", surface: "border-win/25 bg-win/5" },
};

const plural = (count: number, singular: string, pluralForm: string): string =>
  `${count} ${count > 1 ? pluralForm : singular}`;

const seasonOf = (startYear: number): string => `${startYear}-${String(startYear + 1).slice(2)}`;

function alertsOf(dashboard: Dashboard, lineup: ManagedLineup, squadHref: string, lineupHref: string): Alert[] {
  const { club } = dashboard;
  const alerts: Alert[] = [];

  const injuredStarters = lineup.injuredStarters;
  if (injuredStarters.length > 0) {
    alerts.push({
      severity: "danger",
      title: injuredStarters.length === 1 ? "Un titulaire est blessé" : `${injuredStarters.length} titulaires sont blessés`,
      detail: `${injuredStarters.map((player) => `${player.firstName.charAt(0)}. ${player.lastName}`).join(", ")} : remplacement automatique au prochain match.`,
      action: { label: "Composition", href: lineupHref },
    });
  }

  const expiring = dashboard.expiringContracts;
  if (expiring.length > 0) {
    const names = expiring.slice(0, EXPIRING_NAMES_SHOWN).join(", ");
    const others = expiring.length - EXPIRING_NAMES_SHOWN;
    alerts.push({
      severity: "warning",
      title: `${plural(expiring.length, "contrat expire", "contrats expirent")} le 30 juin`,
      detail: others > 0 ? `${names} et ${plural(others, "autre", "autres")}` : names,
      action: { label: "Prolonger", href: squadHref },
    });
  }
  if (club.goalkeepers < MIN_GOALKEEPERS) {
    alerts.push({
      severity: "danger",
      title: club.goalkeepers === 0 ? "Aucun gardien sous contrat" : "Un seul gardien sous contrat",
      detail: `${MIN_GOALKEEPERS} gardiens sont nécessaires pour faire tourner l'équipe.`,
      action: { label: "Gérer", href: squadHref },
    });
  }
  if (club.players < SQUAD_ALERT_SIZE) {
    alerts.push({
      severity: "warning",
      title: "Effectif réduit",
      detail: `${plural(club.players, "joueur", "joueurs")} sous contrat, ${SQUAD_ALERT_SIZE} au minimum.`,
      action: { label: "Gérer", href: squadHref },
    });
  }
  if (club.players >= SQUAD_ALERT_SIZE && club.goalkeepers >= MIN_GOALKEEPERS) {
    alerts.push({
      severity: "ok",
      title: "Effectif complet",
      detail: `${plural(club.players, "joueur", "joueurs")}, ${plural(club.goalkeepers, "gardien", "gardiens")} — rien à signaler`,
    });
  }
  return alerts;
}

function TeamBlock({ team, align }: { team: ClubPreview; align: "left" | "right" }) {
  return (
    <div className={cn("min-w-0 space-y-2", align === "right" ? "text-right" : "text-left")}>
      <p className="font-heading text-3xl leading-[0.95] font-bold text-balance xl:text-4xl">{team.name}</p>
      <div className={cn("flex gap-1", align === "right" && "justify-end")}>
        {team.form.length === 0 ? (
          <span className="text-xs text-muted-foreground">Pas encore de match</span>
        ) : (
          team.form.map((result, index) => <ResultPill key={index} result={result} />)
        )}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {team.rank === null ? "—" : `${team.rank}e`} · {plural(team.points, "pt", "pts")}
        {team.averageOverall !== null && ` · Note moy. ${formatDecimal(team.averageOverall)}`}
      </p>
    </div>
  );
}

function BigFigure({ value, unit }: { value: string; unit?: string }) {
  return (
    <p className="font-heading text-5xl leading-none font-bold tabular-nums">
      {value}
      {unit !== undefined && <span className="ml-1.5 text-2xl font-semibold text-muted-foreground">{unit}</span>}
    </p>
  );
}

export default async function DashboardPage({ params }: PageProps<"/saves/[id]">) {
  const tWorld = await getTranslations("world");
  const tPositions = await getTranslations("positions");
  const tStage = await getTranslations("stage");
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [dashboard, lineup, opponent, user, challenge] = await Promise.all([
    getDashboard(id),
    getManagedLineup(id),
    getOpponentPreview(id),
    getCurrentUser(),
    // Not simulation code: whether the challenge is over is real time.
    getChallengeBanner(id, new Date()),
  ]);
  // Only an anonymous player's save is at risk: it lives in this browser's cookie.
  const askToSignIn = user?.kind === "ANONYMOUS" && (await hasPlayedMatch(id));
  const { club, nextMatch, lastResult, position } = dashboard;
  const base = `/saves/${id}`;
  const alerts = alertsOf(dashboard, lineup, `${base}/squad`, `${base}/lineup`);

  const windowClose = transferWindowCloseDate(dashboard.currentDate);
  const payrollShare = club.wageBudget === 0 ? 0 : Math.min(1, club.payroll / club.wageBudget);
  const movement = position === null || position.previousRank === null ? null : position.previousRank - position.rank;

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Tableau de bord</h1>
      {challenge !== null && <ChallengeBanner view={challenge} />}
      <AccountBanner show={askToSignIn} />

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel className="flex flex-col lg:col-span-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <PanelTitle>Prochain match{nextMatch !== null && ` · ${stageLabel(nextMatch.fixture, tStage)}`}</PanelTitle>
            {nextMatch !== null && (
              <p className="text-xs text-muted-foreground first-letter:uppercase">
                {formatShortDate(nextMatch.fixture.scheduledAt)} · {nextMatch.fixture.home.isManaged ? "Domicile" : "Extérieur"}{" "}
                · {competitionName(nextMatch.fixture.competitionCode, tWorld)}
              </p>
            )}
          </div>
          {nextMatch === null ? (
            <p className="py-10 text-center text-muted-foreground">
              {dashboard.seasonFinished ? "La saison est terminée." : "Aucun match à venir."}
            </p>
          ) : (
            <>
              <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-4 py-6 sm:gap-8">
                <TeamBlock team={nextMatch.home} align="right" />
                <div className="text-center">
                  <p className="font-heading text-5xl font-bold text-muted-foreground/50">VS</p>
                  {nextMatch.stadium !== null && <p className="mt-1 text-xs text-muted-foreground">{nextMatch.stadium}</p>}
                </div>
                <TeamBlock team={nextMatch.away} align="left" />
              </div>
              <div className="space-y-1.5 border-t pt-4 text-xs text-muted-foreground">
                <div className="flex items-baseline justify-between gap-3">
                  <p>
                    Onze en <span className="font-heading text-sm font-bold text-foreground">{lineup.formation}</span>
                  </p>
                  <span className="flex items-center gap-3">
                    {opponent !== null && <OpponentSheet preview={opponent} />}
                    <Link href={`${base}/lineup`} className="font-medium text-info hover:underline">
                      Composition →
                    </Link>
                  </span>
                </div>
                <ol aria-label="Onze du prochain match" className="flex flex-wrap gap-x-3 gap-y-1 text-foreground">
                  {lineup.lineup.starters.map(({ player, slot, index }) => (
                    <li key={index}>
                      <span className={cn("font-heading font-bold", positionTextClass(slot))}>{tPositions(`short.${slot}`)}</span>{" "}
                      {player.lastName}
                    </li>
                  ))}
                </ol>
                <p>
                  {dashboard.injured.length === 0
                    ? "Aucun blessé"
                    : `${plural(dashboard.injured.length, "blessé", "blessés")} (${dashboard.injured
                        .map((player) => `${player.name}, retour ${formatDayMonth(player.until)}`)
                        .join(" ; ")})`}
                </p>
              </div>
            </>
          )}
        </Panel>

        <Panel className="flex flex-col lg:col-span-5">
          <PanelTitle>Dernier résultat{lastResult !== null && ` · ${stageLabel(lastResult.fixture, tStage)}`}</PanelTitle>
          {lastResult === null ? (
            <p className="py-10 text-center text-muted-foreground">Aucun match joué cette saison.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 pt-5">
                <p className="truncate font-heading text-2xl font-bold">{lastResult.fixture.home.name}</p>
                <p
                  className={cn(
                    "rounded-md px-4 py-1 font-heading text-5xl leading-tight font-bold tabular-nums",
                    RESULT_CLASSES[
                      matchResultFor(
                        { ...lastResult.fixture, homeGoals: lastResult.fixture.homeGoals ?? 0, awayGoals: lastResult.fixture.awayGoals ?? 0 },
                        lastResult.fixture.home.isManaged,
                      )
                    ],
                  )}
                >
                  {lastResult.fixture.homeGoals} – {lastResult.fixture.awayGoals}
                </p>
                <p className="truncate text-right font-heading text-2xl font-bold">{lastResult.fixture.away.name}</p>
              </div>
              <ScoreNotes match={lastResult.fixture} className="mt-1 block text-center" />
              <div className="grid flex-1 grid-cols-2 gap-4 pt-4 text-sm tabular-nums">
                <ul className="space-y-1">
                  {lastResult.homeScorers.map((scorer, index) => (
                    <li key={index}>
                      {scorer.name} {scorer.minute}&apos;
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1 text-right">
                  {lastResult.awayScorers.map((scorer, index) => (
                    <li key={index}>
                      {scorer.name} {scorer.minute}&apos;
                    </li>
                  ))}
                </ul>
              </div>
              <Link href={`${base}/fixtures`} className="mt-4 text-sm text-info hover:underline">
                Voir la feuille de match →
              </Link>
            </>
          )}
        </Panel>

        <Panel className="space-y-3 lg:col-span-3">
          <PanelTitle>Classement</PanelTitle>
          {position === null ? (
            <BigFigure value="—" />
          ) : (
            <>
              <p className="font-heading text-5xl leading-none font-bold tabular-nums">
                {position.rank}
                <span className="text-2xl">{position.rank === 1 ? "er" : "e"}</span>
                <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
                  {plural(position.points, "pt", "pts")} · {position.goalDifference > 0 ? "+" : ""}
                  {position.goalDifference}
                </span>
              </p>
              {movement !== null && position.previousRound !== null && (
                <p
                  className={cn(
                    "text-xs tabular-nums",
                    movement > 0 ? "text-win" : movement < 0 ? "text-loss" : "text-muted-foreground",
                  )}
                >
                  {movement > 0 ? "▲" : movement < 0 ? "▼" : "="}{" "}
                  {movement === 0 ? "Stable" : plural(Math.abs(movement), "place", "places")} depuis la J{position.previousRound}
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel className="space-y-3 lg:col-span-3">
          <PanelTitle>Budget transferts</PanelTitle>
          <BigFigure value={formatMillions(club.budget)} unit="M€" />
          <p className="text-xs text-muted-foreground">
            {windowClose === null
              ? `Fenêtre fermée jusqu'au ${formatDayMonth(nextTransferWindowOpening(dashboard.currentDate))}`
              : `Mercato ouvert jusqu'au ${formatDayMonth(windowClose)}`}
          </p>
        </Panel>

        <Panel className="space-y-3 lg:col-span-3">
          <PanelTitle>Masse salariale</PanelTitle>
          <p
            data-summary="payroll"
            data-value={club.payroll}
            className="font-heading text-5xl leading-none font-bold tabular-nums"
          >
            {formatMillions(club.payroll)}
            <span className="ml-1.5 text-2xl font-semibold text-muted-foreground">/ {formatMillions(club.wageBudget)} M€</span>
          </p>
          <div className="h-1.5 rounded-full bg-border" aria-hidden>
            <div
              className={cn("h-1.5 rounded-full", payrollShare >= PAYROLL_WARNING_SHARE ? "bg-warning" : "bg-foreground/70")}
              style={{ width: `${payrollShare * 100}%` }}
            />
          </div>
        </Panel>

        <Panel className="space-y-3 lg:col-span-3">
          <PanelTitle>Effectif</PanelTitle>
          <BigFigure value={String(club.players)} unit="joueurs" />
          <p className="text-xs text-muted-foreground tabular-nums">
            {plural(club.goalkeepers, "gardien", "gardiens")}
            {club.averageAge !== null && ` · Âge moyen ${formatDecimal(club.averageAge)}`}
          </p>
        </Panel>

        <Panel className="space-y-3 lg:col-span-5">
          <PanelTitle>À traiter</PanelTitle>
          <ul className="space-y-3">
            {alerts.map((alert) => (
              <li
                key={alert.title}
                className={cn("flex items-center gap-3 rounded-md border p-3", SEVERITY_CLASSES[alert.severity].surface)}
              >
                <span aria-hidden className={cn("w-1 self-stretch rounded-full", SEVERITY_CLASSES[alert.severity].band)} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{alert.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{alert.detail}</p>
                </div>
                {alert.action !== undefined && (
                  <Link href={alert.action.href} className="shrink-0 text-sm text-info hover:underline">
                    {alert.action.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="space-y-2 lg:col-span-7">
          <div className="flex items-baseline justify-between gap-2">
            <PanelTitle>
              {dashboard.competitionCode === null ? "Classement" : competitionName(dashboard.competitionCode, tWorld)}
              {dashboard.startYear !== null && ` · ${seasonOf(dashboard.startYear)}`}
            </PanelTitle>
            <Link href={`${base}/standings`} className="text-xs text-info hover:underline">
              Tableau complet →
            </Link>
          </div>
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className={cn(TABLE_HEAD, "w-10")}>#</TableHead>
                <TableHead className={TABLE_HEAD}>Club</TableHead>
                {["J", "G", "N", "P", "Diff", "Pts"].map((label) => (
                  <TableHead key={label} className={cn(TABLE_HEAD, "text-right")}>
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.table.map((row) => (
                <TableRow key={row.club} className={cn(TABLE_ROW, row.isManaged && MANAGED_ROW)}>
                  <TableCell className={cn(TABLE_CELL, "text-muted-foreground")}>{row.rank}</TableCell>
                  <TableCell className={TABLE_CELL}>{row.clubName}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{row.played}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{row.won}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{row.drawn}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{row.lost}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right font-heading text-base font-bold")}>{row.points}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}
