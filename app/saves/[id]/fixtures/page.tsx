import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireOwnedSave } from "@/src/auth/current-user";
import { SegmentedLinks } from "@/src/components/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { getManagedClubCalendar, type FixtureWithEvents } from "@/src/db/calendar";
import { getSaveSummary } from "@/src/db/saves";
import { seasonEndDate, seasonLabel, seasonStartYear, transferWindowBounds } from "@/src/engine/world";
import type { Translator } from "@/src/i18n/translator";
import { formatMonth, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "../_components/panel";
import { ResultPill } from "../_components/result-pill";
import { ScoreNotes } from "../_components/score-notes";
import { RESULT_CLASSES } from "../_lib/results";
import { matchResultFor, stageLabel, stageShortLabel } from "../_lib/stage";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { CalendarDay, PickBanner } from "./_components/calendar-day";
import { MatchSheetDialog } from "./_components/match-sheet-dialog";
import { UpcomingMatchSheet } from "./_components/upcoming-match-sheet";
import {
  dayKey,
  firstDayOf,
  monthFromParam,
  monthOf,
  monthParam,
  monthWeeks,
  seasonMonths,
  weekdayNames,
  type Month,
} from "./_lib/month-grid";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("fixtures"))("title") };
}

type View = "calendar" | "list";

/** A day's landmarks besides the match: the transfer windows' bounds and the season's end. */
type Landmark = { label: string; tone: "window" | "season" };

const LANDMARK_CLASSES: Record<Landmark["tone"], string> = { window: "bg-info/15 text-info", season: "bg-warning/15 text-warning" };
const LANDMARK_DOTS: Record<Landmark["tone"], string> = { window: "bg-info", season: "bg-warning" };

const fixturesHref = (saveId: string, view: View, month?: Month): string => {
  const params = new URLSearchParams();
  if (view === "list") {
    params.set("vue", "liste");
  }
  if (month !== undefined) {
    params.set("mois", monthParam(month));
  }
  const query = params.toString();
  return `/saves/${saveId}/fixtures${query === "" ? "" : `?${query}`}`;
};

const single = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

function landmarksOf(startYear: number, t: Translator<"fixtures">): Map<string, Landmark[]> {
  const landmarks = new Map<string, Landmark[]>();
  const add = (date: Date, landmark: Landmark) => landmarks.set(dayKey(date), [...(landmarks.get(dayKey(date)) ?? []), landmark]);
  for (const { date, bound } of transferWindowBounds(startYear)) {
    add(date, { label: t(bound === "open" ? "landmarks.windowOpens" : "landmarks.windowCloses"), tone: "window" });
  }
  add(seasonEndDate(startYear), { label: t("landmarks.seasonEnd"), tone: "season" });
  return landmarks;
}

function MatchCell({ saveId, fixture }: { saveId: string; fixture: FixtureWithEvents }) {
  const t = useTranslations("fixtures");
  const tStage = useTranslations("stage");
  const atHome = fixture.home.isManaged;
  const opponent = atHome ? fixture.away : fixture.home;
  const venue = (
    <span className="text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase max-sm:tracking-normal">
      {atHome ? t("venueShort.home") : t("venueShort.away")}
    </span>
  );
  // A cup tie says so: its round instead of a matchday. On a phone, where a cell is a thumb wide, the round, the
  // opponent and « À venir » are read but not shown (the sheet has them), and a cup tie has the club's border.
  const stage = fixture.cup && (
    <span data-cup-stage="" className="w-full truncate text-[0.625rem] leading-tight font-semibold text-(--club) max-sm:sr-only">
      {stageLabel(fixture, tStage)}
    </span>
  );
  const opponentName = <span className="min-w-0 flex-1 truncate text-xs font-medium max-sm:sr-only">{opponent.name}</span>;
  const className = cn(
    "flex w-full flex-col items-start gap-0.5 rounded-md border bg-background/60 px-1.5 py-1 text-left transition-colors hover:border-(--club)/60 focus-visible:ring-2 focus-visible:ring-(--club) focus-visible:outline-none",
    "max-sm:min-h-11 max-sm:items-center max-sm:justify-center max-sm:px-0.5 max-sm:py-0.5",
    fixture.cup && "max-sm:border-(--club)/70",
  );

  if (fixture.played && fixture.homeGoals !== null && fixture.awayGoals !== null) {
    const result = matchResultFor({ ...fixture, homeGoals: fixture.homeGoals, awayGoals: fixture.awayGoals }, atHome);
    return (
      <MatchSheetDialog fixture={fixture} triggerClassName={className}>
        {stage}
        <span className="flex w-full items-center gap-1 max-sm:justify-center">
          {venue}
          {opponentName}
        </span>
        <span className="flex flex-wrap items-baseline gap-x-1 max-sm:justify-center">
          <span
            data-result={result}
            className={cn("rounded-sm px-1.5 font-heading text-sm leading-snug font-bold tabular-nums max-sm:px-1", RESULT_CLASSES[result])}
          >
            {fixture.homeGoals} – {fixture.awayGoals}
          </span>
          <ScoreNotes match={fixture} className="text-[0.625rem] max-sm:text-center max-sm:leading-tight" />
        </span>
      </MatchSheetDialog>
    );
  }
  return (
    <UpcomingMatchSheet saveId={saveId} fixtureId={fixture.id} className={className}>
      {stage}
      <span className="flex w-full items-center gap-1 max-sm:justify-center">
        {venue}
        {opponentName}
      </span>
      {/* Matchdays have a date but no kickoff time. */}
      <span className="text-xs text-muted-foreground max-sm:sr-only">{t("upcoming")}</span>
    </UpcomingMatchSheet>
  );
}

function MonthCalendar({
  saveId,
  month,
  months,
  fixtures,
  currentDate,
  startYear,
  pickableUntil,
}: {
  saveId: string;
  month: Month;
  months: Month[];
  fixtures: FixtureWithEvents[];
  currentDate: Date;
  startYear: number;
  pickableUntil: Date | null; // last day a simulation may stop at; null when nothing is left to play
}) {
  const t = useTranslations("fixtures");
  const locale = useLocale();
  const index = months.findIndex((candidate) => monthParam(candidate) === monthParam(month));
  const previous = months[index - 1];
  const next = months[index + 1];
  const fixturesByDay = new Map(fixtures.map((fixture) => [dayKey(fixture.scheduledAt), fixture]));
  const landmarks = landmarksOf(startYear, t);
  // The month's landmarks in order, listed under the grid on a phone.
  const monthLandmarks = [...landmarks]
    .filter(([day]) => day.startsWith(`${monthParam(month)}-`))
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([day, list]) => list.map((landmark) => ({ day, landmark })));
  const today = dayKey(currentDate);

  const navLink = (target: Month | undefined, label: string, icon: ReactNode, testId: string) =>
    target === undefined ? (
      <span aria-hidden className="grid size-8 place-items-center rounded-md text-muted-foreground/40 max-sm:size-11">
        {icon}
      </span>
    ) : (
      <Link
        href={fixturesHref(saveId, "calendar", target)}
        aria-label={label}
        data-testid={testId}
        scroll={false}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-sm:size-11"
      >
        {icon}
      </Link>
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {navLink(previous, t("previousMonth"), <ChevronLeftIcon className="size-4" />, "fixtures-previous-month")}
        <h2
          className="min-w-40 text-center font-heading text-2xl font-bold first-letter:uppercase"
          data-calendar="month"
          data-testid="fixtures-month"
        >
          {formatMonth(firstDayOf(month), locale)}
        </h2>
        {navLink(next, t("nextMonth"), <ChevronRightIcon className="size-4" />, "fixtures-next-month")}
      </div>

      <PickBanner />

      {/* On a phone, the week holds in the screen: seven columns a thumb wide, side by side, no scrolling sideways. */}
      <Panel className="overflow-x-auto p-2 sm:p-3 max-sm:p-0.5">
        <div
          role="grid"
          aria-label={t("monthGrid", { month: formatMonth(firstDayOf(month), locale) })}
          data-testid="fixtures-calendar"
          className="min-w-[44rem] max-sm:min-w-0"
        >
          <div role="row" className="grid grid-cols-7 gap-1.5 pb-1.5 max-sm:gap-0">
            {weekdayNames(locale).map((weekday) => (
              <div key={weekday} role="columnheader" className="eyebrow px-1.5 max-sm:px-0 max-sm:text-center max-sm:tracking-normal">
                {weekday}
              </div>
            ))}
          </div>
          <div className="space-y-1.5 max-sm:space-y-0">
            {monthWeeks(month).map((week) => (
              <div key={dayKey(week[0])} role="row" className="grid grid-cols-7 gap-1.5 max-sm:gap-0">
                {week.map((day) => {
                  const key = dayKey(day);
                  const inMonth = day.getUTCMonth() === month.month;
                  const isToday = key === today;
                  const fixture = inMonth ? fixturesByDay.get(key) : undefined;
                  const dayLandmarks = inMonth ? (landmarks.get(key) ?? []) : [];
                  const pickable = inMonth && pickableUntil !== null && day > currentDate && day <= pickableUntil;
                  return (
                    <CalendarDay
                      key={key}
                      day={key}
                      pickable={pickable}
                      today={isToday}
                      className={cn(
                        "flex min-h-24 flex-col gap-1 rounded-md border p-1.5 max-sm:min-h-16 max-sm:gap-0.5 max-sm:rounded-none max-sm:p-0",
                        inMonth ? "bg-card" : "border-transparent bg-transparent",
                        isToday && "border-(--club) ring-1 ring-(--club)",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-6 place-items-center rounded-full text-xs tabular-nums",
                          inMonth ? "text-foreground" : "text-muted-foreground/40",
                          isToday && "bg-(--club) font-semibold text-(--club-fg)",
                        )}
                      >
                        {day.getUTCDate()}
                      </span>
                      {fixture !== undefined && <MatchCell saveId={saveId} fixture={fixture} />}
                      {/* On a phone, a dot of the landmark's colour, its words listed under the grid. */}
                      {dayLandmarks.map((landmark) => (
                        <span key={landmark.label} className="contents">
                          <span
                            className={cn(
                              "rounded-sm px-1.5 py-0.5 text-[0.625rem] leading-tight font-semibold max-sm:sr-only",
                              LANDMARK_CLASSES[landmark.tone],
                            )}
                          >
                            {landmark.label}
                          </span>
                          <span aria-hidden className={cn("mx-auto size-2 rounded-full sm:hidden", LANDMARK_DOTS[landmark.tone])} />
                        </span>
                      ))}
                    </CalendarDay>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {monthLandmarks.length > 0 && (
        <ul aria-hidden className="space-y-1 text-xs sm:hidden" data-testid="fixtures-landmarks">
          {monthLandmarks.map(({ day, landmark }) => (
            <li key={`${day}-${landmark.label}`} className="flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", LANDMARK_DOTS[landmark.tone])} />
              <span className="text-muted-foreground tabular-nums first-letter:uppercase">
                {formatShortDate(new Date(`${day}T00:00:00.000Z`), locale)}
              </span>
              <span className="font-semibold">{landmark.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FixtureList({ fixtures }: { fixtures: FixtureWithEvents[] }) {
  const t = useTranslations("fixtures");
  const tStage = useTranslations("stage");
  const locale = useLocale();
  return (
    // On a phone, each match is a two-line card: its matchday or round over its venue, its date over its opponent, then
    // the score and the result. Same rows, laid out by CSS.
    <Panel className="p-2 sm:p-3" data-testid="fixtures-list">
      <Table className="tabular-nums max-sm:block">
        <TableHeader className="max-sm:hidden">
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className={cn(TABLE_HEAD, "w-36")}>{t("columns.match")}</TableHead>
            <TableHead className={TABLE_HEAD}>{t("columns.date")}</TableHead>
            <TableHead className={TABLE_HEAD}>{t("columns.opponent")}</TableHead>
            <TableHead className={TABLE_HEAD}>{t("columns.venue")}</TableHead>
            <TableHead className={cn(TABLE_HEAD, "text-center")}>{t("columns.score")}</TableHead>
            <TableHead className={cn(TABLE_HEAD, "w-14 text-center")}>
              <span className="sr-only">{t("columns.result")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="max-sm:block">
          {fixtures.map((fixture) => {
            const opponent = fixture.home.isManaged ? fixture.away : fixture.home;
            const result =
              fixture.played && fixture.homeGoals !== null && fixture.awayGoals !== null
                ? matchResultFor({ ...fixture, homeGoals: fixture.homeGoals, awayGoals: fixture.awayGoals }, fixture.home.isManaged)
                : null;
            return (
              <TableRow
                key={fixture.id}
                className={cn(
                  TABLE_ROW,
                  "max-sm:grid max-sm:h-auto max-sm:grid-cols-[4rem_minmax(0,1fr)_auto_2rem] max-sm:items-center max-sm:gap-x-2 max-sm:py-1",
                )}
              >
                <TableCell
                  className={cn(
                    TABLE_CELL,
                    "max-sm:col-start-1 max-sm:row-start-1 max-sm:px-0 max-sm:text-xs max-sm:whitespace-normal",
                    fixture.cup ? "font-medium text-(--club)" : "text-muted-foreground",
                  )}
                >
                  {stageShortLabel(fixture, tStage)}
                </TableCell>
                <TableCell
                  className={cn(TABLE_CELL, "first-letter:uppercase max-sm:col-start-2 max-sm:row-start-1 max-sm:px-0 max-sm:text-xs max-sm:text-muted-foreground")}
                >
                  {formatShortDate(fixture.scheduledAt, locale)}
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "font-medium max-sm:col-start-2 max-sm:row-start-2 max-sm:px-0 max-sm:whitespace-normal")}>
                  {opponent.name}
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "text-muted-foreground max-sm:col-start-1 max-sm:row-start-2 max-sm:px-0 max-sm:text-xs")}>
                  {fixture.home.isManaged ? t("venue.home") : t("venue.away")}
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "text-center max-sm:col-start-3 max-sm:row-span-2 max-sm:row-start-1 max-sm:px-0")}>
                  {fixture.played ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      <MatchSheetDialog fixture={fixture} />
                      <ScoreNotes match={fixture} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "text-center max-sm:col-start-4 max-sm:row-span-2 max-sm:row-start-1 max-sm:px-0")}>
                  {result !== null && <ResultPill result={result} />}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}

export default async function FixturesPage({ params, searchParams }: PageProps<"/saves/[id]/fixtures">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const t = await getTranslations("fixtures");
  const query = await searchParams;
  const [save, calendar] = await Promise.all([getSaveSummary(id), getManagedClubCalendar(id)]);
  if (save === null) {
    notFound();
  }

  const view: View = single(query.vue) === "liste" ? "list" : "calendar";
  const startYear = calendar.startYear ?? seasonStartYear(save.currentDate);
  const months = seasonMonths(startYear);
  const month = monthFromParam(single(query.mois), months, monthOf(save.currentDate));
  const lastUnplayed = calendar.fixtures.findLast((fixture) => !fixture.played);
  const pickableUntil = lastUnplayed === undefined ? null : seasonEndDate(startYear);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-heading text-4xl font-bold" data-testid="fixtures-title">{t("title")}</h1>
          {calendar.startYear !== null && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {t("subtitle", { season: seasonLabel(calendar.startYear) })}
            </p>
          )}
        </div>
        <SegmentedLinks
          label={t("views.label")}
          className="ml-auto"
          links={[
            {
              href: fixturesHref(id, "calendar", month),
              label: t("views.calendar"),
              active: view === "calendar",
              testId: "fixtures-view-calendar",
            },
            { href: fixturesHref(id, "list"), label: t("views.list"), active: view === "list", testId: "fixtures-view-list" },
          ]}
        />
      </div>

      {view === "list" ? (
        <FixtureList fixtures={calendar.fixtures} />
      ) : (
        <MonthCalendar
          saveId={id}
          month={month}
          months={months}
          fixtures={calendar.fixtures}
          currentDate={save.currentDate}
          startYear={startYear}
          pickableUntil={pickableUntil}
        />
      )}
    </div>
  );
}
