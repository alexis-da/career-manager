import { competitionName } from "@/src/i18n/countries";
import { useLocale, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
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
import type { Translator } from "@/src/i18n/translator";
import { formatDayMonth, formatDecimal, formatMillionsAmount, formatShortDate, millionsFigure } from "@/src/lib/format";
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

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

/** Below this many players under contract, the dashboard warns. */
const SQUAD_ALERT_SIZE = 18;
const MIN_GOALKEEPERS = 2;
/** From this share of the wage budget, the payroll gauge turns to warning. */
const PAYROLL_WARNING_SHARE = 0.9;
const EXPIRING_NAMES_SHOWN = 3;

type Severity = "warning" | "danger" | "ok";

type Alert = {
  id: "injured-starters" | "expiring-contracts" | "goalkeepers" | "small-squad" | "full-squad";
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

/** The small table's columns after the club's name. */
const TABLE_COLUMNS = ["played", "won", "drawn", "lost", "goalDifference", "points"] as const;

/** Its columns a phone leaves out: the full table has them. */
const PHONE_HIDDEN_COLUMNS: ReadonlySet<(typeof TABLE_COLUMNS)[number]> = new Set(["won", "drawn", "lost"]);

const seasonOf = (startYear: number): string => `${startYear}-${String(startYear + 1).slice(2)}`;

function alertsOf(
  dashboard: Dashboard,
  lineup: ManagedLineup,
  squadHref: string,
  lineupHref: string,
  t: Translator<"dashboard">,
): Alert[] {
  const { club } = dashboard;
  const alerts: Alert[] = [];

  const injuredStarters = lineup.injuredStarters;
  if (injuredStarters.length > 0) {
    alerts.push({
      id: "injured-starters",
      severity: "danger",
      title: t("alerts.injuredStarters", { count: injuredStarters.length }),
      detail: t("alerts.injuredStartersDetail", {
        players: injuredStarters.map((player) => `${player.firstName.charAt(0)}. ${player.lastName}`).join(", "),
      }),
      action: { label: t("alerts.lineup"), href: lineupHref },
    });
  }

  const expiring = dashboard.expiringContracts;
  if (expiring.length > 0) {
    const names = expiring.slice(0, EXPIRING_NAMES_SHOWN).join(", ");
    const others = expiring.length - EXPIRING_NAMES_SHOWN;
    alerts.push({
      id: "expiring-contracts",
      severity: "warning",
      title: t("alerts.expiringContracts", { count: expiring.length }),
      detail: others > 0 ? t("alerts.expiringOthers", { players: names, count: others }) : names,
      action: { label: t("alerts.extend"), href: squadHref },
    });
  }
  if (club.goalkeepers < MIN_GOALKEEPERS) {
    alerts.push({
      id: "goalkeepers",
      severity: "danger",
      title: club.goalkeepers === 0 ? t("alerts.noGoalkeeper") : t("alerts.oneGoalkeeper"),
      detail: t("alerts.goalkeepersNeeded", { count: MIN_GOALKEEPERS }),
      action: { label: t("alerts.manage"), href: squadHref },
    });
  }
  if (club.players < SQUAD_ALERT_SIZE) {
    alerts.push({
      id: "small-squad",
      severity: "warning",
      title: t("alerts.smallSquad"),
      detail: t("alerts.smallSquadDetail", { count: club.players, minimum: SQUAD_ALERT_SIZE }),
      action: { label: t("alerts.manage"), href: squadHref },
    });
  }
  if (club.players >= SQUAD_ALERT_SIZE && club.goalkeepers >= MIN_GOALKEEPERS) {
    alerts.push({
      id: "full-squad",
      severity: "ok",
      title: t("alerts.fullSquad"),
      detail: t("alerts.fullSquadDetail", { players: club.players, goalkeepers: club.goalkeepers }),
    });
  }
  return alerts;
}

function TeamBlock({ team, align }: { team: ClubPreview; align: "left" | "right" }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  return (
    <div className={cn("min-w-0 space-y-2", align === "right" ? "text-right" : "text-left")}>
      {/* Smaller on a phone, where two names share 120 to 135 px each: the longest word holds on one line from 360 px.
          Two ranges that do not overlap: a width in px and one in rem do not sort reliably. A word too long still wraps,
          hyphenated on a phone only: on a wider screen a long name just goes to the next line. */}
      <p className="font-heading text-3xl leading-[0.95] font-bold text-balance wrap-break-word max-[380px]:text-lg min-[380px]:max-sm:text-xl max-sm:hyphens-auto xl:text-4xl">
        {team.name}
      </p>
      <div className={cn("flex gap-1", align === "right" && "justify-end")}>
        {team.form.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("noMatchYet")}</span>
        ) : (
          team.form.map((result, index) => <ResultPill key={index} result={result} />)
        )}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {team.rank === null ? "—" : t("teamRank", { rank: team.rank })} · {t("points", { count: team.points })}
        {team.averageOverall !== null && ` · ${t("averageRating", { rating: formatDecimal(team.averageOverall, locale) })}`}
      </p>
    </div>
  );
}

function BigFigure({ value, unit = null }: { value: string; unit?: string | null }) {
  return (
    <p className="font-heading text-5xl leading-none font-bold tabular-nums">
      {value}
      {unit !== null && <span className="ml-1.5 text-2xl font-semibold text-muted-foreground">{unit}</span>}
    </p>
  );
}

export default async function DashboardPage({ params }: PageProps<"/saves/[id]">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const t = await getTranslations("dashboard");
  const tWorld = await getTranslations("world");
  const tPositions = await getTranslations("positions");
  const tStage = await getTranslations("stage");
  const locale = await getLocale();
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
  const alerts = alertsOf(dashboard, lineup, `${base}/squad`, `${base}/lineup`, t);

  const windowClose = transferWindowCloseDate(dashboard.currentDate);
  const payrollShare = club.wageBudget === 0 ? 0 : Math.min(1, club.payroll / club.wageBudget);
  const movement = position === null || position.previousRank === null ? null : position.previousRank - position.rank;

  return (
    <div className="space-y-5">
      <h1 className="sr-only" data-testid="dashboard-title">
        {t("title")}
      </h1>
      {challenge !== null && <ChallengeBanner view={challenge} />}
      <AccountBanner show={askToSignIn} />

      {/* One column the screen's width under lg (minmax(0, 1fr)): never as wide as its widest content. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Panel className="flex flex-col lg:col-span-7" data-testid="dashboard-next-match">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <PanelTitle>
              {t("nextMatch")}
              {nextMatch !== null && ` · ${stageLabel(nextMatch.fixture, tStage)}`}
            </PanelTitle>
            {nextMatch !== null && (
              <p className="text-xs text-muted-foreground first-letter:uppercase">
                {formatShortDate(nextMatch.fixture.scheduledAt, locale)} ·{" "}
                {nextMatch.fixture.home.isManaged ? t("home") : t("away")} · {competitionName(nextMatch.fixture.competitionCode, tWorld)}
              </p>
            )}
          </div>
          {nextMatch === null ? (
            <p className="py-10 text-center text-muted-foreground">
              {dashboard.seasonFinished ? t("seasonOver") : t("noUpcomingMatch")}
            </p>
          ) : (
            <>
              <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-6 min-[400px]:gap-4 sm:gap-8">
                <TeamBlock team={nextMatch.home} align="right" />
                <div className="text-center">
                  <p className="font-heading text-5xl font-bold text-muted-foreground/50 max-sm:text-3xl">VS</p>
                  {nextMatch.stadium !== null && <p className="mt-1 text-xs text-muted-foreground">{nextMatch.stadium}</p>}
                </div>
                <TeamBlock team={nextMatch.away} align="left" />
              </div>
              <div className="space-y-1.5 border-t pt-4 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p>
                    {t("formation")} <span className="font-heading text-sm font-bold text-foreground">{lineup.formation}</span>
                  </p>
                  <span className="flex items-center gap-3">
                    {opponent !== null && <OpponentSheet preview={opponent} />}
                    <Link
                      href={`${base}/lineup`}
                      className="font-medium text-info hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
                      data-testid="dashboard-lineup"
                    >
                      {t("lineupLink")}
                    </Link>
                  </span>
                </div>
                <ol aria-label={t("startersLabel")} className="flex flex-wrap gap-x-3 gap-y-1 text-foreground">
                  {lineup.lineup.starters.map(({ player, slot, index }) => (
                    <li key={index}>
                      <span className={cn("font-heading font-bold", positionTextClass(slot))}>{tPositions(`short.${slot}`)}</span>{" "}
                      {player.lastName}
                    </li>
                  ))}
                </ol>
                <p>
                  {dashboard.injured.length === 0
                    ? t("noInjured")
                    : t("injured", {
                        count: dashboard.injured.length,
                        players: dashboard.injured
                          .map((player) => t("injuredPlayer", { name: player.name, date: formatDayMonth(player.until, locale) }))
                          .join(t("injuredSeparator")),
                      })}
                </p>
              </div>
            </>
          )}
        </Panel>

        <Panel className="flex flex-col lg:col-span-5" data-testid="dashboard-last-result">
          <PanelTitle>
            {t("lastResult")}
            {lastResult !== null && ` · ${stageLabel(lastResult.fixture, tStage)}`}
          </PanelTitle>
          {lastResult === null ? (
            <p className="py-10 text-center text-muted-foreground">{t("noMatchPlayed")}</p>
          ) : (
            <>
              {/* On a phone, home, score and away one above the other, each name whole on the panel's width. */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 pt-5 max-sm:grid-cols-1 max-sm:justify-items-center max-sm:gap-1 max-sm:text-center">
                <p className="truncate font-heading text-2xl font-bold max-sm:w-full max-sm:leading-tight max-sm:whitespace-normal">
                  {lastResult.fixture.home.name}
                </p>
                <p
                  className={cn(
                    "rounded-md px-4 py-1 font-heading text-5xl leading-tight font-bold tabular-nums max-sm:text-4xl",
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
                <p className="truncate text-right font-heading text-2xl font-bold max-sm:w-full max-sm:text-center max-sm:leading-tight max-sm:whitespace-normal">
                  {lastResult.fixture.away.name}
                </p>
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
              <Link
                href={`${base}/fixtures`}
                className="mt-4 text-sm text-info hover:underline max-sm:flex max-sm:min-h-11 max-sm:items-center"
                data-testid="dashboard-match-report"
              >
                {t("matchReport")}
              </Link>
            </>
          )}
        </Panel>

        <Panel className="space-y-3 lg:col-span-3" data-testid="dashboard-position">
          <PanelTitle>{t("position")}</PanelTitle>
          {position === null ? (
            <BigFigure value="—" />
          ) : (
            <>
              <p className="font-heading text-5xl leading-none font-bold tabular-nums">
                {position.rank}
                <span className="text-2xl">{t("rankSuffix", { rank: position.rank })}</span>
                <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
                  {t("points", { count: position.points })} · {position.goalDifference > 0 ? "+" : ""}
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
                  {t("movement", {
                    count: Math.abs(movement),
                    matchday: tStage("matchdayShort", { round: position.previousRound }),
                  })}
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel className="space-y-3 lg:col-span-3" data-testid="dashboard-budget">
          <PanelTitle>{t("transferBudget")}</PanelTitle>
          <BigFigure {...millionsFigure(club.budget, locale)} />
          <p className="text-xs text-muted-foreground">
            {windowClose === null
              ? t("windowClosedUntil", { date: formatDayMonth(nextTransferWindowOpening(dashboard.currentDate), locale) })
              : t("windowOpenUntil", { date: formatDayMonth(windowClose, locale) })}
          </p>
        </Panel>

        <Panel className="space-y-3 lg:col-span-3" data-testid="dashboard-payroll">
          <PanelTitle>{t("payroll")}</PanelTitle>
          <p
            data-summary="payroll"
            data-value={club.payroll}
            className="font-heading text-5xl leading-none font-bold tabular-nums"
          >
            {millionsFigure(club.payroll, locale).value}
            <span className="ml-1.5 text-2xl font-semibold text-muted-foreground">
              / {formatMillionsAmount(club.wageBudget, locale)}
            </span>
          </p>
          <div className="h-1.5 rounded-full bg-border" aria-hidden>
            <div
              className={cn("h-1.5 rounded-full", payrollShare >= PAYROLL_WARNING_SHARE ? "bg-warning" : "bg-foreground/70")}
              style={{ width: `${payrollShare * 100}%` }}
            />
          </div>
        </Panel>

        <Panel className="space-y-3 lg:col-span-3" data-testid="dashboard-squad">
          <PanelTitle>{t("squad")}</PanelTitle>
          <BigFigure value={String(club.players)} unit={t("playersUnit")} />
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("goalkeepers", { count: club.goalkeepers })}
            {club.averageAge !== null && ` · ${t("averageAge", { age: formatDecimal(club.averageAge, locale) })}`}
          </p>
        </Panel>

        <Panel className="space-y-3 lg:col-span-5" data-testid="dashboard-alerts">
          <PanelTitle>{t("toDo")}</PanelTitle>
          <ul className="space-y-3">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                data-testid={`alert-${alert.id}`}
                className={cn("flex items-center gap-3 rounded-md border p-3", SEVERITY_CLASSES[alert.severity].surface)}
              >
                <span aria-hidden className={cn("w-1 self-stretch rounded-full", SEVERITY_CLASSES[alert.severity].band)} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{alert.title}</p>
                  <p className="truncate text-xs text-muted-foreground max-sm:whitespace-normal">{alert.detail}</p>
                </div>
                {alert.action !== undefined && (
                  <Link
                    href={alert.action.href}
                    className="shrink-0 text-sm text-info hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center max-sm:justify-center"
                    data-testid="alert-action"
                  >
                    {alert.action.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="space-y-2 lg:col-span-7" data-testid="dashboard-table">
          <div className="flex items-baseline justify-between gap-2">
            <PanelTitle>
              {dashboard.competitionCode === null ? t("table") : competitionName(dashboard.competitionCode, tWorld)}
              {dashboard.startYear !== null && ` · ${seasonOf(dashboard.startYear)}`}
            </PanelTitle>
            <Link
              href={`${base}/standings`}
              className="shrink-0 text-xs text-info hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
              data-testid="dashboard-full-table"
            >
              {t("fullTable")}
            </Link>
          </div>
          {/* On a phone, played, goal difference and points: wins, draws and losses are in the full table. */}
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className={cn(TABLE_HEAD, "w-10 max-sm:px-2")}>#</TableHead>
                <TableHead className={cn(TABLE_HEAD, "max-sm:px-2")}>{t("columns.club")}</TableHead>
                {TABLE_COLUMNS.map((column) => (
                  <TableHead key={column} className={cn(TABLE_HEAD, "text-right max-sm:px-2", PHONE_HIDDEN_COLUMNS.has(column) && "max-sm:hidden")}>
                    {t(`columns.${column}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.table.map((row) => (
                <TableRow key={row.club} className={cn(TABLE_ROW, row.isManaged && MANAGED_ROW)}>
                  {/* Before a club's first match, its place is only the alphabet's. */}
                  <TableCell className={cn(TABLE_CELL, "text-muted-foreground max-sm:px-2")}>{row.played === 0 ? "—" : row.rank}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "max-sm:px-2 max-sm:py-1.5 max-sm:whitespace-normal")}>{row.clubName}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right max-sm:px-2")}>{row.played}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right max-sm:hidden")}>{row.won}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right max-sm:hidden")}>{row.drawn}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right max-sm:hidden")}>{row.lost}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right max-sm:px-2")}>
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right font-heading text-base font-bold max-sm:px-2")}>{row.points}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}
