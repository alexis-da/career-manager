import type { ReactNode } from "react";
import { Panel, PanelTitle } from "@/src/components/panel";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { UNKNOWN_SOURCE, type AdminDashboard, type AdminDay, type Journey, type Share } from "@/src/db/admin-dashboard";
import { OTHER_SOURCES } from "@/src/db/visits";
import type { Translator } from "@/src/i18n/translator";
import { isoWeekNumber } from "@/src/lib/iso-week";
import { cn } from "@/src/lib/utils";

// The sections of /admin: plain components, given the figures, the page's translator and its formats. Readable on a
// phone: four columns a table at most there, tight gutters, a figure and its share on two lines; days newest first.

export type AdminFormats = {
  integer: (value: number) => string;
  megabytes: (bytes: number) => string;
  growth: (bytes: number) => string; // signed
  percent: (part: number, whole: number) => string | null; // null when the whole is 0
  day: (day: string) => string; // « 07/11 »
  date: (day: string) => string; // « 7 novembre 2026 »
  duration: (minutes: number) => string;
};

type SectionProps = { dashboard: AdminDashboard; t: Translator<"admin">; format: AdminFormats };

/** On a phone, narrower gutters: the tables hold in their frame at 360 px. */
const TIGHT = "max-sm:px-1.5";
const NUMBER = cn(TABLE_CELL, TIGHT, "text-right tabular-nums");
const HEAD = cn(TABLE_HEAD, TIGHT, "max-sm:leading-tight max-sm:whitespace-normal");
const HEAD_NUMBER = cn(HEAD, "text-right");

function Section({ id, title, note, children }: { id: string; title: string; note: string; children: ReactNode }) {
  return (
    <Panel className="min-w-0 space-y-4 max-sm:px-3" data-testid={`admin-${id}`} aria-labelledby={`admin-${id}-title`}>
      <div className="space-y-1">
        <PanelTitle id={`admin-${id}-title`}>{title}</PanelTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
      </div>
      {children}
    </Panel>
  );
}

/** Two a row; four from 1024 px in a section as wide as the page, two in a half one. */
function Tiles({ children, half = false }: { children: ReactNode; half?: boolean }) {
  return <div className={cn("grid grid-cols-2 gap-2", !half && "lg:grid-cols-4")}>{children}</div>;
}

function Tile({ label, value, detail, testId }: { label: string; value: string; detail?: string | null; testId?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-background/60 p-3" data-testid={testId}>
      <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
      <p className="font-heading text-2xl normal-case tabular-nums">{value}</p>
      {detail !== undefined && detail !== null && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

/** A figure, and under it its share of a whole when there is one. */
function Figure({ value, share }: { value: string; share?: string | null }) {
  return (
    <>
      <span className="block">{value}</span>
      {share !== undefined && share !== null && <span className="block text-[0.6875rem] text-muted-foreground">{share}</span>}
    </>
  );
}

/** A source as the tables name it: the made-up ones in words, the others as they came (a link's ref, a domain). */
function sourceName(source: string, t: Translator<"admin">): string {
  if (source === UNKNOWN_SOURCE) {
    return t("sources.unknown");
  }
  return source === OTHER_SOURCES ? t("sources.other") : source;
}

/** A rate of a part of a whole: « 12/40 » and « 30 % » under it, « — » without a whole. */
function ShareCell({ share, format }: { share: Share; format: AdminFormats }) {
  const percent = format.percent(share.part, share.whole);
  return percent === null ? "—" : <Figure value={percent} share={`${format.integer(share.part)}/${format.integer(share.whole)}`} />;
}

const newestFirst = (days: AdminDay[]): AdminDay[] => days.toReversed();

export function AcquisitionSection({ dashboard, t, format }: SectionProps) {
  const { total, players, sources } = dashboard;
  const devices = players.phone + players.computer;
  return (
    <Section id="acquisition" title={t("sections.acquisition")} note={t("sections.acquisitionNote")}>
      <Tiles>
        <Tile label={t("figures.visits")} value={format.integer(total.visits)} testId="admin-total-visits" />
        <Tile
          label={t("figures.players")}
          value={format.integer(total.players)}
          detail={total.visits === 0 ? null : t("details.conversion", { percent: Math.round((total.players / total.visits) * 100) })}
          testId="admin-total-players"
        />
        <Tile
          label={t("figures.registered")}
          value={format.integer(players.registered)}
          detail={total.players === 0 ? null : t("details.ofPlayers", { percent: Math.round((players.registered / total.players) * 100) })}
        />
        <Tile label={t("figures.phones")} value={format.percent(players.phone, devices) ?? "—"} />
      </Tiles>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li>{t("breakdown.languages", { fr: format.integer(players.fr), en: format.integer(players.en) })}</li>
        <li>{t("breakdown.devices", { phone: format.integer(players.phone), computer: format.integer(players.computer) })}</li>
        <li>{t("breakdown.kinds", { anonymous: format.integer(players.anonymous), registered: format.integer(players.registered) })}</li>
      </ul>
      <div className="grid gap-4 lg:grid-cols-2">
        <Table data-testid="admin-acquisition-days">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className={HEAD}>{t("columns.day")}</TableHead>
              <TableHead className={HEAD_NUMBER}>{t("columns.visits")}</TableHead>
              <TableHead className={HEAD_NUMBER}>{t("columns.players")}</TableHead>
              <TableHead className={HEAD_NUMBER}>{t("columns.registered")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {newestFirst(dashboard.days).map((day) => (
              <TableRow key={day.day} data-day={day.day} className={TABLE_ROW}>
                <TableCell className={cn(TABLE_CELL, TIGHT, "tabular-nums")}>{format.day(day.day)}</TableCell>
                <TableCell className={NUMBER}>{day.visits === null ? "—" : format.integer(day.visits)}</TableCell>
                <TableCell className={NUMBER}>{format.integer(day.players)}</TableCell>
                <TableCell className={NUMBER}>{format.integer(day.registered)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Table data-testid="admin-acquisition-sources">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className={HEAD}>{t("columns.source")}</TableHead>
              <TableHead className={HEAD_NUMBER}>{t("columns.visits")}</TableHead>
              <TableHead className={HEAD_NUMBER}>{t("columns.players")}</TableHead>
              <TableHead className={HEAD_NUMBER}>{t("columns.conversion")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((journey) => (
              <TableRow key={journey.source} data-source={journey.source} className={TABLE_ROW}>
                <TableCell className={cn(TABLE_CELL, TIGHT, "py-2 break-words whitespace-normal")}>{sourceName(journey.source, t)}</TableCell>
                <TableCell className={NUMBER}>{format.integer(journey.visits)}</TableCell>
                <TableCell className={NUMBER}>{format.integer(journey.players)}</TableCell>
                <TableCell className={NUMBER}>{format.percent(journey.players, journey.visits) ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}

/** A step of a source's journey: its players, and their share of the source's visits. */
function StepCell({ count, journey, format }: { count: number; journey: Journey; format: AdminFormats }) {
  return <Figure value={format.integer(count)} share={format.percent(count, journey.visits)} />;
}

export function JourneySection({ dashboard, t, format }: SectionProps) {
  const { total, sources } = dashboard;
  // Every source first, then each: the source's own name as the row's mark, the total's empty.
  const rows = [
    { ...total, key: "", name: t("sources.all") },
    ...sources.map((journey) => ({ ...journey, key: journey.source, name: sourceName(journey.source, t) })),
  ];
  return (
    <Section id="journey" title={t("sections.journey")} note={t("sections.journeyNote")}>
      <Tiles>
        <Tile
          label={t("figures.medianToFirstMatch")}
          value={total.medianMinutesToFirstMatch === null ? "—" : format.duration(total.medianMinutesToFirstMatch)}
          detail={t("details.medianNote")}
          testId="admin-median-first-match"
        />
      </Tiles>
      <Table data-testid="admin-journey-sources">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className={HEAD}>{t("columns.source")}</TableHead>
            {/* On a phone, the visits are in Acquisition, just above: the steps say their share of them. */}
            <TableHead className={cn(HEAD_NUMBER, "max-sm:hidden")}>{t("columns.visits")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.careers")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.firstMatch")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.seasonEnd")}</TableHead>
            <TableHead className={cn(HEAD_NUMBER, "max-sm:hidden")}>{t("columns.median")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((journey) => (
            <TableRow key={journey.key} data-source={journey.key} className={cn(TABLE_ROW, journey.key === "" && "font-semibold")}>
              <TableCell className={cn(TABLE_CELL, TIGHT, "py-2 break-words whitespace-normal")}>{journey.name}</TableCell>
              <TableCell className={cn(NUMBER, "max-sm:hidden")}>{format.integer(journey.visits)}</TableCell>
              <TableCell className={cn(NUMBER, "py-1.5")}>
                <StepCell count={journey.careers} journey={journey} format={format} />
              </TableCell>
              <TableCell className={cn(NUMBER, "py-1.5")}>
                <StepCell count={journey.firstMatches} journey={journey} format={format} />
              </TableCell>
              <TableCell className={cn(NUMBER, "py-1.5")}>
                <StepCell count={journey.seasonEnds} journey={journey} format={format} />
              </TableCell>
              <TableCell className={cn(NUMBER, "max-sm:hidden")}>
                {journey.medianMinutesToFirstMatch === null ? "—" : format.duration(journey.medianMinutesToFirstMatch)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

export function RetentionSection({ dashboard, t, format }: SectionProps) {
  const { total, sources } = dashboard;
  return (
    <Section id="retention" title={t("sections.retention")} note={t("sections.retentionNote")}>
      <Tiles half>
        <Tile label={t("figures.day1")} value={format.percent(total.day1.part, total.day1.whole) ?? "—"} testId="admin-day1" />
        <Tile label={t("figures.day7")} value={format.percent(total.day7.part, total.day7.whole) ?? "—"} testId="admin-day7" />
      </Tiles>
      <Table data-testid="admin-retention-sources">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className={HEAD}>{t("columns.source")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.newPlayers")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.day1")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.day7")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources
            .filter((journey) => journey.players > 0)
            .map((journey) => (
              <TableRow key={journey.source} data-source={journey.source} className={TABLE_ROW}>
                <TableCell className={cn(TABLE_CELL, TIGHT, "py-2 break-words whitespace-normal")}>{sourceName(journey.source, t)}</TableCell>
                <TableCell className={NUMBER}>{format.integer(journey.players)}</TableCell>
                <TableCell className={cn(NUMBER, "py-1.5")}>
                  <ShareCell share={journey.day1} format={format} />
                </TableCell>
                <TableCell className={cn(NUMBER, "py-1.5")}>
                  <ShareCell share={journey.day7} format={format} />
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <Table data-testid="admin-retention-days">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className={HEAD}>{t("columns.day")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.newPlayers")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.day1")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.day7")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {newestFirst(dashboard.days).map((day) => (
            <TableRow key={day.day} data-day={day.day} className={TABLE_ROW}>
              <TableCell className={cn(TABLE_CELL, TIGHT, "tabular-nums")}>{format.day(day.day)}</TableCell>
              <TableCell className={NUMBER}>{format.integer(day.players)}</TableCell>
              <TableCell className={cn(NUMBER, "py-1.5")}>
                {day.day1 === null ? "—" : <ShareCell share={{ part: day.day1, whole: day.players }} format={format} />}
              </TableCell>
              <TableCell className={cn(NUMBER, "py-1.5")}>
                {day.day7 === null ? "—" : <ShareCell share={{ part: day.day7, whole: day.players }} format={format} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

export function ActivitySection({ dashboard, t, format }: SectionProps) {
  const { days, challenge } = dashboard;
  const live = days.reduce((sum, day) => sum + day.liveMatches, 0);
  const simulated = days.reduce((sum, day) => sum + day.simulatedMatches, 0);
  const active = days.map((day) => day.active);
  return (
    <Section id="activity" title={t("sections.activity")} note={t("sections.activityNote")}>
      <Tiles half>
        <Tile
          label={t("figures.active")}
          value={format.integer(Math.round(active.reduce((sum, count) => sum + count, 0) / days.length))}
          detail={t("details.activeAverage", { max: format.integer(Math.max(0, ...active)) })}
        />
        <Tile
          label={t("figures.matches")}
          value={format.integer(live + simulated)}
          detail={t("details.matches", { live: format.integer(live), simulated: format.integer(simulated) })}
          testId="admin-matches"
        />
      </Tiles>
      <p className="text-sm" data-testid="admin-challenge">
        {challenge === null ? (
          t("challenge.none")
        ) : (
          <>
            <span className="font-semibold">{t("challenge.title", { week: isoWeekNumber(challenge.weekKey) })}</span>
            {" · "}
            {t("challenge.figures", {
              saves: challenge.saves,
              max: challenge.maxSaves,
              entries: challenge.entries,
              submitted: challenge.submitted,
            })}
          </>
        )}
      </p>
      <Table data-testid="admin-activity-days">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className={HEAD}>{t("columns.day")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.active")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.live")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.simulated")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {newestFirst(days).map((day) => (
            <TableRow key={day.day} data-day={day.day} className={TABLE_ROW}>
              <TableCell className={cn(TABLE_CELL, TIGHT, "tabular-nums")}>{format.day(day.day)}</TableCell>
              <TableCell className={NUMBER}>{format.integer(day.active)}</TableCell>
              <TableCell className={NUMBER}>{format.integer(day.liveMatches)}</TableCell>
              <TableCell className={NUMBER}>{format.integer(day.simulatedMatches)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

export function HealthSection({ dashboard, t, format, statsLink }: SectionProps & { statsLink: ReactNode }) {
  const { health, days } = dashboard;
  const purged = days.reduce(
    (sum, day) => ({
      users: sum.users + day.purgedUsers,
      saves: sum.saves + day.purgedSaves,
      challenge: sum.challenge + day.purgedChallengeSaves,
    }),
    { users: 0, saves: 0, challenge: 0 },
  );
  const fullOn = health.fullOn === null ? null : format.date(health.fullOn);
  return (
    <Section id="health" title={t("sections.health")} note={t("sections.healthNote")}>
      <Tiles>
        <Tile
          label={t("figures.databaseSize")}
          value={format.megabytes(health.databaseBytes)}
          detail={t("details.ofLimit", { percent: Math.round((health.databaseBytes / health.limitBytes) * 1000) / 10 })}
          testId="admin-database-size"
        />
        <Tile
          label={t("figures.growth")}
          value={health.dailyGrowth === null ? "—" : format.growth(health.dailyGrowth)}
          detail={health.dailyGrowth === null ? t("details.noGrowth") : t("details.perDay")}
        />
        <Tile
          label={t("figures.fullOn")}
          value={fullOn ?? "—"}
          detail={health.dailyGrowth === null ? null : fullOn === null ? t("details.notBefore") : null}
          testId="admin-full-on"
        />
        <Tile
          label={t("figures.purged")}
          value={t("values.purged", { users: format.integer(purged.users), saves: format.integer(purged.saves) })}
          detail={t("details.purged", { users: purged.users, saves: purged.saves, challenge: purged.challenge })}
        />
      </Tiles>
      <Table data-testid="admin-health-days">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className={HEAD}>{t("columns.day")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.size")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.growth")}</TableHead>
            <TableHead className={HEAD_NUMBER}>{t("columns.purged")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {newestFirst(days).map((day) => (
            <TableRow key={day.day} data-day={day.day} className={TABLE_ROW}>
              <TableCell className={cn(TABLE_CELL, TIGHT, "tabular-nums")}>{format.day(day.day)}</TableCell>
              <TableCell className={NUMBER}>{day.databaseBytes === null ? "—" : format.megabytes(day.databaseBytes)}</TableCell>
              <TableCell className={NUMBER}>{day.growth === null ? "—" : format.growth(day.growth)}</TableCell>
              <TableCell className={NUMBER}>
                {t("values.purged", { users: format.integer(day.purgedUsers), saves: format.integer(day.purgedSaves) })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {statsLink}
    </Section>
  );
}
