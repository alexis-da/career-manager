import { ChevronLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "@/src/components/link";
import type { ReactNode } from "react";
import { ClubInitials } from "@/src/components/club-initials";
import type { FixtureWithEvents, TeamView } from "@/src/db/calendar";
import { cn } from "@/src/lib/utils";
import { ScoreNotes } from "../../_components/score-notes";
import { RESULT_CLASSES, type ResultKind } from "../../_lib/results";
import type { ShownInstruction } from "../_lib/live-instruction";

/** The size of a side's mark on the card, a club's initials or a nation's code. */
const MARK = "size-14 rounded-[1rem] text-2xl";

/**
 * A nation's mark, where a club has its initials: its code, « POR », never a federation's crest; on the orange for the
 * coach's nation, on white for the other, as a club's. Its name is next to it, read by screen readers.
 */
function NationMark({ code, managed }: { code: string; managed: boolean }) {
  return (
    <span
      aria-hidden
      data-nation={code}
      className={cn("grid shrink-0 place-items-center font-heading", MARK, managed ? "bg-(--club) text-(--club-fg)" : "bg-foreground text-background")}
    >
      {code}
    </span>
  );
}

function Team({ team, away, nation }: { team: TeamView; away: boolean; nation: string | null }) {
  return (
    // A column on a phone, the name under the initials; on a computer, side by side, the initials next to the score.
    <div className={cn("flex min-w-0 flex-col items-center gap-1.5 text-center lg:gap-3.5", away ? "lg:flex-row lg:text-left" : "lg:flex-row-reverse lg:text-right")}>
      {nation === null ? <ClubInitials name={team.name} managed={team.isManaged} className={MARK} /> : <NationMark code={nation} managed={team.isManaged} />}
      {/* On a phone, the score leaves each name about 100 px at 360 px, 115 px at 390 px: enough for the longest word in
          each of these two ranges, which do not overlap (a width in px and one in rem do not sort reliably). From lg, it
          leaves 155 px, then 280 px from xl. A word longer than the column wraps rather than run out of it. */}
      <p className="w-full min-w-0 leading-tight font-semibold wrap-break-word max-[390px]:text-xs min-[390px]:max-sm:text-[0.8125rem] max-sm:hyphens-auto sm:text-lg lg:font-bold xl:text-[1.625rem]">
        {team.name}
      </p>
    </div>
  );
}

/** A side's goals; a new key at each goal replays the entrance. */
function Goals({ value }: { value: number }) {
  return (
    <span key={value} className="inline-block motion-safe:animate-in motion-safe:zoom-in-150 motion-safe:duration-500">
      {value}
    </span>
  );
}

/**
 * The instruction the managed club plays with, and who set it: « Consigne : Fermer · de départ ». Outlined on the blue,
 * never orange: the screen's orange is its controls'. A status: a screen reader hears it change, and its name says it
 * in a sentence. On two lines rather than wider than the card.
 */
function InstructionLine({ instruction, source }: ShownInstruction) {
  const t = useTranslations("live");
  const tHalfTime = useTranslations("halfTime");
  const name = tHalfTime(`instruction.${instruction}`);
  return (
    <p
      role="status"
      aria-label={t("instruction.label", { instruction: name, source })}
      data-instruction={instruction}
      data-instruction-source={source}
      data-testid="live-instruction"
      className="max-w-full self-center rounded-full border border-on-blue/40 px-3 py-1 text-center text-xs leading-tight text-balance wrap-break-word text-on-blue lg:text-[0.8125rem]"
    >
      {t("instruction.title")} <span className="font-bold text-primary-foreground">{name}</span> · {t(`instruction.source.${source}`)}
    </p>
  );
}

type LiveScoreCardProps = {
  caption: string;
  dashboardHref: string;
  exitLabel?: string; // the way out's name, when it does not lead home: « Retour à la sélection »
  nations?: { home: string; away: string }; // a national team's match: its nations' codes, their marks
  match: FixtureWithEvents;
  homeGoals: number;
  awayGoals: number;
  minute: number;
  progress: number; // how much of the match has run, in percent
  status: { label: string; value: string; running: boolean }; // `value` for data-live-status
  result: ResultKind | null; // the managed club's, once the match is over
  instruction: ShownInstruction | null; // the managed club's at the clock's minute, while the match is on and it is known
  children: ReactNode; // the controls: under the bar on a computer, out of the card below lg
};

/**
 * The head of the screen, in the bright blue: what is played, the score, the minute, the managed club's instruction and
 * how far the match has run; for a national team's match, its nations by their codes. Below lg, it reaches the screen's
 * top and sides; the page cancels <main>'s margins for it.
 */
export function LiveScoreCard({
  caption,
  dashboardHref,
  exitLabel,
  nations,
  match,
  homeGoals,
  awayGoals,
  minute,
  progress,
  status,
  result,
  instruction,
  children,
}: LiveScoreCardProps) {
  const t = useTranslations("live");
  const tResults = useTranslations("results");
  return (
    <section
      aria-label={t("scoreboard")}
      className="flex flex-col gap-3.5 rounded-card bg-primary px-5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-5 text-primary-foreground max-lg:rounded-t-none max-sm:px-4 lg:gap-4 lg:px-7 lg:py-6"
    >
      {/* The caption wraps beside the way out; a status too long to stand next to it goes on a line of its own. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          href={dashboardHref}
          data-testid="live-exit"
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-lg outline-none transition-colors hover:bg-on-blue/10 focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
        >
          <ChevronLeftIcon aria-hidden className="size-6" />
          <span className="sr-only">{exitLabel ?? t("exit")}</span>
        </Link>
        <p data-testid="live-caption" className="min-w-0 flex-1 basis-40 text-xs font-bold tracking-wider wrap-break-word text-on-blue uppercase lg:text-[0.8125rem]">
          {caption}
        </p>
        <span
          data-live-status={status.value}
          data-testid="live-status"
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs font-bold tracking-wide uppercase lg:text-[0.8125rem]"
        >
          {status.running && <span aria-hidden className="size-2 shrink-0 rounded-full bg-(--club) motion-safe:animate-pulse" />}
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 lg:items-center lg:gap-7">
        <Team team={match.home} away={false} nation={nations?.home ?? null} />
        <div className="flex flex-col items-center">
          <p data-testid="live-score" className="font-heading text-[4rem] leading-none whitespace-nowrap tabular-nums lg:text-[5.25rem] lg:leading-[0.9]">
            <Goals value={homeGoals} /> – <Goals value={awayGoals} />
          </p>
          <p className="font-heading text-2xl leading-tight text-(--club) tabular-nums">{minute}&apos;</p>
        </div>
        <Team team={match.away} away nation={nations?.away ?? null} />
      </div>

      {/* The result's colours do not read on the blue: on the dark, as a calendar's row has them. The notes keep their
          small letters out of the title's capitals. */}
      {result !== null && (
        <p
          data-result={result}
          data-testid="live-result"
          className={cn(RESULT_CLASSES[result], "inline-flex items-center gap-2 self-center rounded-full bg-background px-3.5 py-1")}
        >
          <span className="font-heading text-lg leading-none">{tResults(`label.${result}`)}</span>
          <ScoreNotes match={match} />
        </p>
      )}

      {instruction !== null && <InstructionLine {...instruction} />}

      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-background">
        <div className="h-full rounded-full bg-(--club)" style={{ width: `${progress}%` }} />
      </div>

      {children}
    </section>
  );
}
