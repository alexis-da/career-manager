import {
  ArrowLeftRightIcon,
  BrickWallIcon,
  CalendarDaysIcon,
  CheckIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  GoalIcon,
  MedalIcon,
  MegaphoneIcon,
  PlayIcon,
  RadioIcon,
  ShieldCheckIcon,
  SplitIcon,
  SproutIcon,
  TargetIcon,
  TrophyIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "@/src/components/link";
import { Panel } from "@/src/components/panel";
import type { DailyMissionsView, MissionTaskView } from "@/src/db/missions";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { cosmeticOf, streakLotOf, type CosmeticId } from "@/src/lib/cosmetics";
import {
  ALL_THREE_TOKENS,
  STREAK_CYCLE_DAYS,
  STREAK_DAY3_TOKENS,
  STREAK_DAY7_TOKENS,
  missionTarget,
  type MissionKind,
  type StreakView,
} from "@/src/lib/missions";
import { cn } from "@/src/lib/utils";
import { ChangeMissionButton } from "./change-mission-button";
import { StreakChip, TokenChip } from "./mission-chips";

// The missions of the day, v2 (CLAUDE.md « Missions du jour »): their card under the dashboard's hero, their lines in the
// « À demain » card, and the chips of the streak and the tokens. Never an action of the game: what to do, how far each is,
// the tokens they earn, the streak and its cycle; the hero keeps the screen's orange.

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
  PLAY_MATCH: PlayIcon,
  SCORE: GoalIcon,
  SAVE_LINEUP: ClipboardCheckIcon,
  LIVE_DECISION: SplitIcon,
  LIVE_WIN_COACHED: ZapIcon,
  LIVE_SCORE_TWO: TargetIcon,
  LIVE_CLEAN_SHEET: BrickWallIcon,
};

/** The missions done on the line-up's screen: the card leads there. */
const LINEUP_MISSIONS: readonly MissionKind[] = ["START_YOUTH", "SAVE_LINEUP"];

/** A way on from the card: 44 px high on a phone, never a full orange. */
const CARD_LINK = "text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";

/** A mission in words: « Joue 3 matchs », « Gagne un match ». */
export function missionTitle(mission: Pick<MissionTaskView, "kind" | "target">, t: Translator<"missions">): string {
  return t(`kinds.${mission.kind}`, { target: mission.target });
}

/** Cosmetics in words, as a lot of the streak: « cadre Bronze et badge « Une semaine » ». */
export function lotWords(ids: readonly string[], t: Translator<"missions">, tRewards: Translator<"rewards">, locale: Locale): string {
  const words = ids.flatMap((id) => {
    const cosmetic = cosmeticOf(id);
    return cosmetic === undefined ? [] : [t(`lotItems.${cosmetic.kind}`, { name: tRewards(`cosmetics.${cosmetic.id as CosmeticId}.name`) })];
  });
  return new Intl.ListFormat(locale === "fr" ? "fr-FR" : "en-GB", { type: "conjunction" }).format(words);
}

/** The days of the streak's cycle done, today's included once it counts. */
function daysInCycle(streak: StreakView): number {
  if (streak.counted) {
    return streak.nextCycleDay;
  }
  return streak.current > 0 ? streak.nextCycleDay - 1 : 0;
}

/** Under the cycle's days, its bonuses: those to come, or the one today has just earned. */
function cycleLine(
  streak: StreakView,
  nextLot: DailyMissionsView["nextLot"],
  t: Translator<"missions">,
  tRewards: Translator<"rewards">,
  locale: Locale,
): string {
  if (streak.counted && streak.nextCycleDay === 3) {
    return t("cycle.earned", { day: 3, tokens: STREAK_DAY3_TOKENS });
  }
  if (streak.counted && streak.nextCycleDay === STREAK_CYCLE_DAYS) {
    const won = streakLotOf(streak.cycles).map(({ id }) => id);
    return won.length > 0
      ? t("cycle.lotEarned", { tokens: STREAK_DAY7_TOKENS, lot: lotWords(won, t, tRewards, locale) })
      : t("cycle.earned", { day: STREAK_CYCLE_DAYS, tokens: STREAK_DAY7_TOKENS });
  }
  const parts: string[] = [];
  if (daysInCycle(streak) < 3) {
    parts.push(t("cycle.bonus", { day: 3, tokens: STREAK_DAY3_TOKENS }));
  }
  parts.push(
    nextLot === null
      ? t("cycle.bonus", { day: STREAK_CYCLE_DAYS, tokens: STREAK_DAY7_TOKENS })
      : t("cycle.lot", { tokens: STREAK_DAY7_TOKENS, lot: lotWords(nextLot.cosmetics, t, tRewards, locale) }),
  );
  return parts.join(" · ");
}

/** What the streak says today: counted, kept by the shield, one day more to win, or a new one after the last. */
function streakLine(streak: StreakView, t: Translator<"missions">): string {
  if (streak.counted) {
    const record = streak.current >= 2 && streak.current === streak.best;
    return record ? `${t("streakLine.counted")} ${t("streakLine.isRecord")}` : t("streakLine.counted");
  }
  if (streak.shielded) {
    return t("streakLine.shielded");
  }
  if (streak.current > 0) {
    return t("streakLine.keepGoing", { next: streak.current + 1 });
  }
  return streak.last !== null && streak.last >= 2 ? t("streakLine.restart", { count: streak.last }) : t("streakLine.start");
}

/** The cycle's seven days, those done filled, the bonus days marked. */
export function CycleTrack({ streak }: { streak: StreakView }) {
  const t = useTranslations("missions");
  const done = daysInCycle(streak);
  return (
    <ol
      data-testid="mission-cycle"
      data-cycle-day={done}
      aria-label={t("cycle.label", { day: done })}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: STREAK_CYCLE_DAYS }, (_, index) => {
        const day = index + 1;
        const bonus = day === 3 || day === STREAK_CYCLE_DAYS;
        return (
          <li
            key={day}
            aria-hidden
            className={cn(
              "grid shrink-0 place-items-center rounded-full text-[0.625rem] leading-none font-bold tabular-nums",
              bonus ? "size-5" : "size-3.5",
              day <= done ? "bg-highlight text-background" : "bg-secondary text-muted-foreground",
            )}
          >
            {bonus ? day : null}
          </li>
        );
      })}
    </ol>
  );
}

/** A mission of the day: its sign, its tier and tokens, what it asks and how, how far it is; its change, its way on. */
function MissionRow({
  saveId,
  task,
  canChange,
}: {
  saveId: string;
  task: MissionTaskView;
  canChange: boolean;
}) {
  const t = useTranslations("missions");
  const Icon = task.completed ? CircleCheckIcon : ICONS[task.kind];
  const title = missionTitle(task, t);
  return (
    <li
      data-testid="mission-task"
      data-tier={task.tier}
      data-kind={task.kind}
      data-completed={String(task.completed)}
      className="flex items-start gap-3"
    >
      <span
        aria-hidden
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          task.completed ? "bg-win/15 text-win" : "bg-secondary text-highlight",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.6875rem] font-bold tracking-wide text-muted-foreground uppercase">
            {t("tierLabel", { tier: t(`tiers.${task.tier}`), tokens: task.tokens })}
          </p>
          {task.completed ? (
            <span data-testid="mission-progress" className="inline-flex items-center gap-1 text-xs font-semibold text-win">
              <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />
              {t("taskDone")}
            </span>
          ) : (
            <span
              data-testid="mission-progress"
              aria-label={t("progressLabel", { progress: task.progress, target: task.target })}
              className="text-sm font-semibold tabular-nums"
            >
              {t("progress", { progress: task.progress, target: task.target })}
            </span>
          )}
        </div>
        <p data-testid="mission-title" className={cn("text-[0.9375rem] leading-snug font-bold wrap-break-word", task.completed && "text-muted-foreground")}>
          {title}
        </p>
        {!task.completed && <p className="text-[0.8125rem] leading-snug text-muted-foreground">{t(`how.${task.kind}`)}</p>}
        {task.changedFrom !== null && (
          <p className="text-xs text-muted-foreground">{t("changedFrom", { mission: missionTitle({ kind: task.changedFrom, target: missionTarget(task.changedFrom) }, t) })}</p>
        )}
        {!task.completed && (canChange || LINEUP_MISSIONS.includes(task.kind)) && (
          <div className="flex flex-wrap items-center gap-x-4">
            {LINEUP_MISSIONS.includes(task.kind) && (
              <Link href={`/saves/${saveId}/lineup`} data-testid="mission-lineup" className={CARD_LINK}>
                {t("lineup")}
              </Link>
            )}
            {canChange && <ChangeMissionButton saveId={saveId} tier={task.tier} mission={title} />}
          </div>
        )}
      </div>
    </li>
  );
}

type DailyMissionsCardProps = {
  saveId: string;
  missions: DailyMissionsView;
  className?: string;
};

/**
 * The dashboard's card of the day's missions: the three, easy, medium and hard, each with its tokens and how far it is;
 * the three's bonus; the streak's cycle and its bonuses; the player's tokens, leading to the Rewards tab. « Changer de
 * mission » on a mission not started, once a day.
 */
export function DailyMissionsCard({ saveId, missions, className }: DailyMissionsCardProps) {
  const t = useTranslations("missions");
  const tRewards = useTranslations("rewards");
  const locale = useLocale();
  const { tasks, streak, done, balance, changeUsed, nextLot, welcome } = missions;
  const allDone = done === tasks.length;
  return (
    <Panel
      aria-labelledby="daily-missions-title"
      data-testid="daily-missions"
      data-done={done}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id="daily-missions-title" className="font-heading text-xl leading-tight">
          {t("title")}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {streak.current > 0 && <StreakChip count={streak.current} />}
          <TokenChip count={balance} />
        </div>
      </div>
      {welcome > 0 && (
        <p data-testid="mission-welcome" className="rounded-xl bg-secondary px-3 py-2 text-sm leading-snug">
          {t("welcome", { tokens: welcome })}
        </p>
      )}
      <ul className="space-y-4">
        {tasks.map((task) => (
          <MissionRow key={task.tier} saveId={saveId} task={task} canChange={!changeUsed && !task.completed && task.progress === 0} />
        ))}
      </ul>
      <div className="space-y-3 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-3">
          <p data-testid="mission-all-three" data-done={String(allDone)} className={cn("text-sm font-semibold", allDone && "text-win")}>
            {allDone ? t("allThreeDone", { tokens: ALL_THREE_TOKENS }) : t("allThree", { tokens: ALL_THREE_TOKENS })}
          </p>
          <span aria-hidden className="flex gap-1">
            {tasks.map((task) => (
              <span key={task.tier} className={cn("size-2.5 rounded-full", task.completed ? "bg-win" : "bg-secondary")} />
            ))}
          </span>
        </div>
        <div className="space-y-1.5">
          <CycleTrack streak={streak} />
          <p className="text-[0.8125rem] leading-snug text-muted-foreground">{cycleLine(streak, nextLot, t, tRewards, locale)}</p>
        </div>
        <p data-testid="mission-streak-line" className="text-[0.8125rem] leading-snug">
          {streakLine(streak, t)}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {allDone && (
            <p data-testid="mission-done" className="text-sm font-semibold text-win">
              {t("tomorrow")}
            </p>
          )}
          <Link href={`/saves/${saveId}/rewards`} data-testid="mission-rewards-link" className={cn(CARD_LINK, "ml-auto")}>
            {t("rewards")}
          </Link>
        </div>
      </div>
    </Panel>
  );
}

/** The day's missions in the « À demain » card: the tokens of the day, those left, and the streak. */
export function DailyMissionsLine({ missions }: { missions: DailyMissionsView }) {
  const t = useTranslations("missions");
  const locale = useLocale();
  const left = missions.tasks.filter(({ completed }) => !completed);
  const leftWords = new Intl.ListFormat(locale === "fr" ? "fr-FR" : "en-GB", { type: "conjunction" }).format(
    left.map((task) => `${missionTitle(task, t)} (+${task.tokens})`),
  );
  return (
    <div data-testid="session-end-mission" data-done={missions.done} className="space-y-1.5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CoinsIcon aria-hidden className="size-4 shrink-0 text-warning" />
        <span data-testid="session-end-tokens" className="tabular-nums">
          {t("sessionEnd.earned", { tokens: missions.earnedToday, balance: missions.balance })}
        </span>
      </p>
      <p className="text-sm leading-snug">
        {left.length === 0 ? (
          <span className="font-semibold text-win">{t("sessionEnd.allDone")}</span>
        ) : (
          <>
            <span className="font-semibold">{t("sessionEnd.count", { done: missions.done })}</span>
            <span className="text-muted-foreground"> · {t("sessionEnd.left", { missions: leftWords })}</span>
          </>
        )}
      </p>
      {missions.streak.current > 0 && <StreakChip count={missions.streak.current} />}
    </div>
  );
}
