import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/src/components/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireOwnedSave } from "@/src/auth/current-user";
import { SegmentedLinks } from "@/src/components/segmented";
import { getManagedClubCalendar, type FixtureWithEvents } from "@/src/db/calendar";
import { getSeasonBreaks, type SeasonBreak } from "@/src/db/nations-view";
import { getSaveSummary } from "@/src/db/saves";
import { seasonEndDate, seasonLabel, seasonStartYear, transferWindowBounds } from "@/src/engine/world";
import type { Translator } from "@/src/i18n/translator";
import { formatDayMonth, formatMonth, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { FixtureRow } from "../_components/fixture-row";
import { Panel } from "@/src/components/panel";
import { PointerText } from "../_components/pointer-text";
import { ScoreNotes } from "../_components/score-notes";
import { nextFixture } from "../_lib/fixture-window";
import { RESULT_CLASSES } from "../_lib/results";
import { matchResultFor, stageLabel } from "../_lib/stage";
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
  sameMonth,
  seasonMonths,
  weekdayNames,
  type Month,
} from "./_lib/month-grid";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("fixtures"))("title") };
}

/** The month's matches as a list, the default, or as a grid: `?vue=grille`. */
type View = "list" | "grid";

/** A day's landmarks besides the match: the transfer windows' bounds and the season's end. */
type Landmark = { label: string; tone: "window" | "season" };

const LANDMARK_CLASSES: Record<Landmark["tone"], string> = { window: "bg-info/15 text-info", season: "bg-warning/15 text-warning" };
const LANDMARK_DOTS: Record<Landmark["tone"], string> = { window: "bg-info", season: "bg-warning" };

const MONTH_ARROW = "grid size-11 place-items-center rounded-lg bg-card";

const fixturesHref = (saveId: string, view: View, month?: Month): string => {
  const params = new URLSearchParams();
  if (view === "grid") {
    params.set("vue", "grille");
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

/** The month shown, in both views, and the arrows to its neighbours in the season: they stay in the view. */
function MonthHeader({ saveId, view, month, months }: { saveId: string; view: View; month: Month; months: Month[] }) {
  const t = useTranslations("fixtures");
  const locale = useLocale();
  const index = months.findIndex((candidate) => sameMonth(candidate, month));

  const navLink = (target: Month | undefined, label: string, icon: ReactNode, testId: string) =>
    target === undefined ? (
      <span aria-hidden className={cn(MONTH_ARROW, "text-muted-foreground/40")}>
        {icon}
      </span>
    ) : (
      <Link
        href={fixturesHref(saveId, view, target)}
        aria-label={label}
        data-testid={testId}
        scroll={false}
        className={cn(MONTH_ARROW, "transition-colors hover:bg-secondary")}
      >
        {icon}
      </Link>
    );

  return (
    <div className="flex items-center gap-2 max-sm:justify-between">
      {navLink(months[index - 1], t("previousMonth"), <ChevronLeftIcon className="size-5" />, "fixtures-previous-month")}
      <h2 className="min-w-40 text-center font-heading text-2xl font-bold" data-calendar="month" data-testid="fixtures-month">
        {formatMonth(firstDayOf(month), locale)}
      </h2>
      {navLink(months[index + 1], t("nextMonth"), <ChevronRightIcon className="size-5" />, "fixtures-next-month")}
    </div>
  );
}

/** The month's landmarks in order: under the list, and under the grid on a phone, where a day only has room for a dot. */
function MonthLandmarks({
  month,
  landmarks,
  underGrid = false,
}: {
  month: Month;
  landmarks: Map<string, Landmark[]>;
  underGrid?: boolean;
}) {
  const locale = useLocale();
  const monthLandmarks = [...landmarks]
    .filter(([day]) => day.startsWith(`${monthParam(month)}-`))
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([day, list]) => list.map((landmark) => ({ day, landmark })));
  if (monthLandmarks.length === 0) {
    return null;
  }
  return (
    // The grid's days say them to a screen reader already.
    <ul aria-hidden={underGrid || undefined} className={cn("space-y-1 text-xs", underGrid && "sm:hidden")} data-testid="fixtures-landmarks">
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
  );
}

/**
 * An international break among the month's matches (docs/design/selections.md § 9.4): its dates, then the club's players
 * its nations called and those injured, or that the call-ups come the week of the break; it leads to the nations' tab.
 */
function BreakRow({ saveId, entry }: { saveId: string; entry: SeasonBreak }) {
  const t = useTranslations("fixtures");
  const locale = useLocale();
  const details =
    entry.called === null
      ? [t("break.pending")]
      : [t("break.called", { count: entry.called }), ...(entry.injured > 0 ? [t("break.injured", { count: entry.injured })] : [])];
  return (
    <li>
      <Link
        href={`/saves/${saveId}/internationals`}
        data-testid="fixtures-break"
        data-played={entry.played}
        className="block rounded-lg border border-dashed border-info/50 px-3.5 py-2.5 transition-colors hover:bg-muted max-sm:min-h-11"
      >
        <span className="block text-xs font-bold tracking-wider text-info uppercase">
          {t("break.title", { from: formatDayMonth(entry.from, locale), to: formatDayMonth(entry.to, locale) })}
        </span>
        <span className="block text-[0.8125rem] text-muted-foreground">{details.join(" · ")}</span>
      </Link>
    </li>
  );
}

/** The month's matches, one row each, with its international breaks among them, then its landmarks. */
function MonthList({
  saveId,
  month,
  fixtures,
  breaks,
  next,
  startYear,
}: {
  saveId: string;
  month: Month;
  fixtures: FixtureWithEvents[];
  breaks: SeasonBreak[];
  next: FixtureWithEvents | undefined;
  startYear: number;
}) {
  const t = useTranslations("fixtures");
  const monthFixtures = fixtures.filter((fixture) => sameMonth(monthOf(fixture.scheduledAt), month));
  const monthBreaks = breaks.filter((entry) => sameMonth(monthOf(entry.from), month));
  const rows = [
    ...monthFixtures.map((fixture) => ({ date: fixture.scheduledAt, fixture, entry: null })),
    ...monthBreaks.map((entry) => ({ date: entry.from, fixture: null, entry })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  return (
    <>
      <div data-testid="fixtures-list">
        {rows.length === 0 ? (
          <Panel className="text-center text-muted-foreground">{t("noMatches")}</Panel>
        ) : (
          <ol className="space-y-2">
            {rows.map(({ fixture, entry }) =>
              fixture !== null ? (
                <FixtureRow key={fixture.id} saveId={saveId} fixture={fixture} next={fixture.id === next?.id} />
              ) : entry !== null ? (
                <BreakRow key={`break-${entry.from.toISOString()}`} saveId={saveId} entry={entry} />
              ) : null,
            )}
          </ol>
        )}
      </div>
      <MonthLandmarks month={month} landmarks={landmarksOf(startYear, t)} />
    </>
  );
}

function MonthCalendar({
  saveId,
  month,
  fixtures,
  currentDate,
  startYear,
  pickableUntil,
}: {
  saveId: string;
  month: Month;
  fixtures: FixtureWithEvents[];
  currentDate: Date;
  startYear: number;
  pickableUntil: Date | null; // last day a simulation may stop at; null when nothing is left to play
}) {
  const t = useTranslations("fixtures");
  const locale = useLocale();
  const fixturesByDay = new Map(fixtures.map((fixture) => [dayKey(fixture.scheduledAt), fixture]));
  const landmarks = landmarksOf(startYear, t);
  const today = dayKey(currentDate);

  return (
    <>
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

      <MonthLandmarks month={month} landmarks={landmarks} underGrid />
    </>
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
  // The season's international breaks: none in a save without nations.
  const breaks = await getSeasonBreaks(id, calendar.startYear ?? seasonStartYear(save.currentDate));

  const view: View = single(query.vue) === "grille" ? "grid" : "list";
  const startYear = calendar.startYear ?? seasonStartYear(save.currentDate);
  const months = seasonMonths(startYear);
  const next = nextFixture(calendar.fixtures);
  // The list opens on the next match (a new save is in July, its first match in August), the grid on the save's date.
  const opening = view === "list" && next !== undefined ? next.scheduledAt : save.currentDate;
  const requested = single(query.mois);
  const month = monthFromParam(requested, months, monthOf(opening));
  // The switch keeps a month the player went to; otherwise each view opens on its own.
  const chosenMonth = requested === monthParam(month) ? month : undefined;
  const lastUnplayed = calendar.fixtures.findLast((fixture) => !fixture.played);
  const pickableUntil = lastUnplayed === undefined ? null : seasonEndDate(startYear);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-heading text-4xl font-bold" data-testid="fixtures-title">{t("title")}</h1>
          {calendar.startYear !== null && (
            <p className="text-sm text-muted-foreground tabular-nums">
              <PointerText
                touch={t("subtitle.touch", { season: seasonLabel(calendar.startYear) })}
                click={t("subtitle.click", { season: seasonLabel(calendar.startYear) })}
              />
            </p>
          )}
        </div>
        <SegmentedLinks
          label={t("views.label")}
          className="ml-auto"
          links={[
            {
              href: fixturesHref(id, "list", chosenMonth),
              label: t("views.list"),
              active: view === "list",
              testId: "fixtures-view-list",
            },
            {
              href: fixturesHref(id, "grid", chosenMonth),
              label: t("views.grid"),
              active: view === "grid",
              testId: "fixtures-view-calendar",
            },
          ]}
        />
      </div>

      <div className="space-y-3">
        <MonthHeader saveId={id} view={view} month={month} months={months} />
        {view === "list" ? (
          <MonthList saveId={id} month={month} fixtures={calendar.fixtures} breaks={breaks} next={next} startYear={startYear} />
        ) : (
          <MonthCalendar
            saveId={id}
            month={month}
            fixtures={calendar.fixtures}
            currentDate={save.currentDate}
            startYear={startYear}
            pickableUntil={pickableUntil}
          />
        )}
      </div>
    </div>
  );
}
