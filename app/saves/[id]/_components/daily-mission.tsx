import {
  ArrowLeftRightIcon,
  CalendarDaysIcon,
  CircleCheckIcon,
  FlameIcon,
  MedalIcon,
  MegaphoneIcon,
  RadioIcon,
  ShieldCheckIcon,
  SproutIcon,
  TrophyIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "@/src/components/link";
import { Panel } from "@/src/components/panel";
import type { DailyMissionView } from "@/src/db/missions";
import type { Translator } from "@/src/i18n/translator";
import type { MissionKind, StreakView } from "@/src/lib/missions";
import { cn } from "@/src/lib/utils";

// The mission of the day (CLAUDE.md « Mission du jour »): its card under the dashboard's hero, its line in the « À demain »
// card, and the streak's chip. Never an action of the game: what to do, how far it is, the days in a row; the hero keeps
// the screen's orange, and a mission done says the next one comes tomorrow.

/** Each mission's sign, in SVG. */
const ICONS: Readonly<Record<MissionKind, LucideIcon>> = {
  PLAY_LIVE: RadioIcon,
  LIVE_SUBSTITUTION: ArrowLeftRightIcon,
  LIVE_INSTRUCTION: MegaphoneIcon,
  LIVE_WIN: MedalIcon,
  WIN: TrophyIcon,
  CLEAN_SHEET: ShieldCheckIcon,
  PLAY_MATCHES: CalendarDaysIcon,
  START_YOUTH: SproutIcon,
};

/** A way on from the card: 44 px high on a phone, never a full orange. */
const CARD_LINK = "text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";

/** A mission in words: « Joue 3 matchs », « Gagne un match ». */
export function missionTitle(mission: Pick<DailyMissionView, "kind" | "target">, t: Translator<"missions">): string {
  return t(`kinds.${mission.kind}`, { target: mission.target });
}

/** The streak's chip: its days in a row, by the flame. */
export function StreakChip({ count, className }: { count: number; className?: string }) {
  const t = useTranslations("missions");
  return (
    <span
      data-testid="mission-streak"
      data-streak={count}
      className={cn("inline-flex min-h-6 items-center gap-1 rounded-full bg-secondary px-2.5 text-xs font-semibold whitespace-nowrap", className)}
    >
      <FlameIcon aria-hidden className="size-3.5 shrink-0 text-(--club)" />
      {t("streak", { count })}
    </span>
  );
}

/** Under a mission still to do, what its streak becomes: one day more, a new one after the last, or the first. */
function streakLine(streak: StreakView, t: Translator<"missions">): string {
  if (streak.current > 0) {
    return t("keepGoing", { next: streak.current + 1 });
  }
  return streak.last !== null && streak.last >= 2 ? t("restart", { count: streak.last }) : t("start");
}

/** How far the mission is: a bar, full once done, and its count. */
function MissionProgress({ mission }: { mission: DailyMissionView }) {
  const t = useTranslations("missions");
  const { progress, target, completed } = mission;
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={progress}
        aria-label={t("progressLabel", { progress, target })}
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary"
      >
        <div className={cn("h-full rounded-full", completed ? "bg-win" : "bg-highlight")} style={{ width: `${(100 * progress) / target}%` }} />
      </div>
      <span data-testid="mission-progress" className="text-sm font-semibold tabular-nums">
        {t("progress", { progress, target })}
      </span>
    </div>
  );
}

type DailyMissionCardProps = {
  saveId: string;
  mission: DailyMissionView;
  className?: string;
};

/**
 * The dashboard's card of the day's mission: its sign, what it asks and how, how far it is, and the streak, in days in a
 * row. Done: « Mission accomplie », the next one tomorrow, the record when it is one. To start a youngster, the way to the
 * line-up.
 */
export function DailyMissionCard({ saveId, mission, className }: DailyMissionCardProps) {
  const t = useTranslations("missions");
  const { kind, completed, streak } = mission;
  const Icon = completed ? CircleCheckIcon : ICONS[kind];
  const record = completed && streak.current >= 2 && streak.current === streak.best;
  return (
    <Panel
      aria-labelledby="daily-mission-title"
      data-testid="daily-mission"
      data-kind={kind}
      data-completed={String(completed)}
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id="daily-mission-title" className="font-heading text-xl leading-tight">
          {t("title")}
        </h2>
        {streak.current > 0 && <StreakChip count={streak.current} />}
      </div>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn("grid size-11 shrink-0 place-items-center rounded-xl", completed ? "bg-win/15 text-win" : "bg-secondary text-highlight")}
        >
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p data-testid="mission-title" className="text-[0.9375rem] leading-snug font-bold wrap-break-word">
            {missionTitle(mission, t)}
          </p>
          <p className="text-[0.8125rem] leading-snug text-muted-foreground">{completed ? t("tomorrow") : t(`how.${kind}`)}</p>
        </div>
      </div>
      <MissionProgress mission={mission} />
      {completed ? (
        <p data-testid="mission-done" className="text-sm font-semibold text-win">
          {t("done")}
          {record && <span className="font-normal text-muted-foreground"> · {t("isRecord")}</span>}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p data-testid="mission-streak-line" className="text-[0.8125rem] leading-snug text-muted-foreground">
            {streakLine(streak, t)}
          </p>
          {kind === "START_YOUTH" && (
            <Link href={`/saves/${saveId}/lineup`} data-testid="mission-lineup" className={CARD_LINK}>
              {t("lineup")}
            </Link>
          )}
        </div>
      )}
    </Panel>
  );
}

/** The day's mission in the « À demain » card: still to do, with how far it is, or done, its streak and tomorrow's. */
export function DailyMissionLine({ mission }: { mission: DailyMissionView }) {
  const t = useTranslations("missions");
  if (mission.completed) {
    return (
      <div data-testid="session-end-mission" data-completed="true" className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CircleCheckIcon aria-hidden className="size-4 shrink-0 text-win" />
          <p className="text-sm font-semibold">{t("sessionEnd.done")}</p>
          {mission.streak.current > 0 && <StreakChip count={mission.streak.current} />}
        </div>
        <p className="text-sm text-muted-foreground">{t("sessionEnd.tomorrow")}</p>
      </div>
    );
  }
  const Icon = ICONS[mission.kind];
  return (
    <div data-testid="session-end-mission" data-completed="false" className="flex items-start gap-2">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-highlight" />
      <p className="text-sm leading-snug">
        <span className="font-semibold">{t("sessionEnd.todo", { mission: missionTitle(mission, t) })}</span>
        <span className="text-muted-foreground tabular-nums"> · {t("progress", { progress: mission.progress, target: mission.target })}</span>
      </p>
    </div>
  );
}
