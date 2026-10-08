import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireOwnedSave } from "@/src/auth/current-user";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { getManagedClubCalendar, type FixtureWithEvents } from "@/src/db/calendar";
import { getSaveSummary } from "@/src/db/saves";
import { seasonEndDate, seasonLabel, seasonStartYear, transferWindowBounds } from "@/src/engine/world";
import { formatMonth, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "../_components/panel";
import { ResultPill } from "../_components/result-pill";
import { RESULT_CLASSES, resultFor } from "../_lib/results";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { CalendarDay, PickBanner } from "./_components/calendar-day";
import { MatchSheetDialog } from "./_components/match-sheet-dialog";
import { UpcomingMatchSheet } from "./_components/upcoming-match-sheet";
import { dayKey, firstDayOf, monthFromParam, monthOf, monthParam, monthWeeks, seasonMonths, type Month } from "./_lib/month-grid";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Calendrier" };

type View = "calendar" | "list";

const WEEKDAYS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

/** A day's landmarks besides the match: the transfer windows' bounds and the season's end. */
type Landmark = { label: string; tone: "window" | "season" };

const VIEW_TAB = cn(
  "relative rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
  "aria-[current=page]:bg-(--club)/18 aria-[current=page]:font-semibold aria-[current=page]:text-foreground",
);

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

function landmarksOf(startYear: number): Map<string, Landmark[]> {
  const landmarks = new Map<string, Landmark[]>();
  const add = (date: Date, landmark: Landmark) => landmarks.set(dayKey(date), [...(landmarks.get(dayKey(date)) ?? []), landmark]);
  for (const { date, bound } of transferWindowBounds(startYear)) {
    add(date, { label: bound === "open" ? "Ouverture du mercato" : "Fermeture du mercato", tone: "window" });
  }
  add(seasonEndDate(startYear), { label: "Fin de saison", tone: "season" });
  return landmarks;
}

function MatchCell({ saveId, fixture }: { saveId: string; fixture: FixtureWithEvents }) {
  const atHome = fixture.home.isManaged;
  const opponent = atHome ? fixture.away : fixture.home;
  const venue = (
    <span className="text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">
      {atHome ? "Dom." : "Ext."}
    </span>
  );
  const className =
    "flex w-full flex-col items-start gap-0.5 rounded-md border bg-background/60 px-1.5 py-1 text-left transition-colors hover:border-(--club)/60 focus-visible:ring-2 focus-visible:ring-(--club) focus-visible:outline-none";

  if (fixture.played && fixture.homeGoals !== null && fixture.awayGoals !== null) {
    const result = resultFor(fixture.homeGoals, fixture.awayGoals, atHome);
    return (
      <MatchSheetDialog fixture={fixture} triggerClassName={className}>
        <span className="flex w-full items-center gap-1">
          {venue}
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{opponent.name}</span>
        </span>
        <span
          data-result={result}
          className={cn("rounded-sm px-1.5 font-heading text-sm leading-snug font-bold tabular-nums", RESULT_CLASSES[result])}
        >
          {fixture.homeGoals} – {fixture.awayGoals}
        </span>
      </MatchSheetDialog>
    );
  }
  return (
    <UpcomingMatchSheet saveId={saveId} fixtureId={fixture.id} className={className}>
      <span className="flex w-full items-center gap-1">
        {venue}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{opponent.name}</span>
      </span>
      {/* Matchdays have a date but no kickoff time. */}
      <span className="text-xs text-muted-foreground">À venir</span>
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
  const index = months.findIndex((candidate) => monthParam(candidate) === monthParam(month));
  const previous = months[index - 1];
  const next = months[index + 1];
  const fixturesByDay = new Map(fixtures.map((fixture) => [dayKey(fixture.scheduledAt), fixture]));
  const landmarks = landmarksOf(startYear);
  const today = dayKey(currentDate);

  const navLink = (target: Month | undefined, label: string, icon: ReactNode) =>
    target === undefined ? (
      <span aria-hidden className="grid size-8 place-items-center rounded-md text-muted-foreground/40">
        {icon}
      </span>
    ) : (
      <Link
        href={fixturesHref(saveId, "calendar", target)}
        aria-label={label}
        scroll={false}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {icon}
      </Link>
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {navLink(previous, "Mois précédent", <ChevronLeftIcon className="size-4" />)}
        <h2 className="min-w-40 text-center font-heading text-2xl font-bold first-letter:uppercase" data-calendar="month">
          {formatMonth(firstDayOf(month))}
        </h2>
        {navLink(next, "Mois suivant", <ChevronRightIcon className="size-4" />)}
      </div>

      <PickBanner />

      <Panel className="overflow-x-auto p-2 sm:p-3">
        <div role="grid" aria-label={`Calendrier de ${formatMonth(firstDayOf(month))}`} className="min-w-[44rem]">
          <div role="row" className="grid grid-cols-7 gap-1.5 pb-1.5">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} role="columnheader" className="eyebrow px-1.5">
                {weekday}
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {monthWeeks(month).map((week) => (
              <div key={dayKey(week[0])} role="row" className="grid grid-cols-7 gap-1.5">
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
                        "flex min-h-24 flex-col gap-1 rounded-md border p-1.5",
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
                      {dayLandmarks.map((landmark) => (
                        <span
                          key={landmark.label}
                          className={cn(
                            "rounded-sm px-1.5 py-0.5 text-[0.625rem] leading-tight font-semibold",
                            landmark.tone === "window" ? "bg-info/15 text-info" : "bg-warning/15 text-warning",
                          )}
                        >
                          {landmark.label}
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
    </div>
  );
}

function FixtureList({ fixtures }: { fixtures: FixtureWithEvents[] }) {
  return (
    <Panel className="p-2 sm:p-3">
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className={cn(TABLE_HEAD, "w-14 text-right")}>J.</TableHead>
            <TableHead className={TABLE_HEAD}>Date</TableHead>
            <TableHead className={TABLE_HEAD}>Adversaire</TableHead>
            <TableHead className={TABLE_HEAD}>Lieu</TableHead>
            <TableHead className={cn(TABLE_HEAD, "text-center")}>Score</TableHead>
            <TableHead className={cn(TABLE_HEAD, "w-14 text-center")}>
              <span className="sr-only">Résultat</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fixtures.map((fixture) => {
            const opponent = fixture.home.isManaged ? fixture.away : fixture.home;
            const result =
              fixture.played && fixture.homeGoals !== null && fixture.awayGoals !== null
                ? resultFor(fixture.homeGoals, fixture.awayGoals, fixture.home.isManaged)
                : null;
            return (
              <TableRow key={fixture.id} className={TABLE_ROW}>
                <TableCell className={cn(TABLE_CELL, "text-right text-muted-foreground")}>{fixture.round}</TableCell>
                <TableCell className={cn(TABLE_CELL, "first-letter:uppercase")}>{formatShortDate(fixture.scheduledAt)}</TableCell>
                <TableCell className={cn(TABLE_CELL, "font-medium")}>{opponent.name}</TableCell>
                <TableCell className={cn(TABLE_CELL, "text-muted-foreground")}>
                  {fixture.home.isManaged ? "Domicile" : "Extérieur"}
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "text-center")}>
                  {fixture.played ? <MatchSheetDialog fixture={fixture} /> : <span className="text-muted-foreground">–</span>}
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "text-center")}>{result !== null && <ResultPill result={result} />}</TableCell>
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
          <h1 className="font-heading text-4xl font-bold">Calendrier</h1>
          {calendar.startYear !== null && (
            <p className="text-sm text-muted-foreground tabular-nums">
              Saison {seasonLabel(calendar.startYear)} · cliquez sur un match pour sa feuille ou son adversaire
            </p>
          )}
        </div>
        <nav aria-label="Vue du calendrier" className="ml-auto flex gap-1">
          <Link
            href={fixturesHref(id, "calendar", month)}
            aria-current={view === "calendar" ? "page" : undefined}
            className={VIEW_TAB}
          >
            Calendrier
          </Link>
          <Link href={fixturesHref(id, "list")} aria-current={view === "list" ? "page" : undefined} className={VIEW_TAB}>
            Liste
          </Link>
        </nav>
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
