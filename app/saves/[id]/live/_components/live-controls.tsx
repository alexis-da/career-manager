import { useTranslations } from "next-intl";
import { SkipForwardIcon } from "lucide-react";
import Link from "@/src/components/link";
import type { Ref } from "react";
import { Button, buttonVariants } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { CoachingTarget, SkipTarget } from "../_lib/live-pause";

/** The replay's speeds, as factors of its normal pace. */
const SPEEDS = [1, 2, 4] as const;

export type Speed = (typeof SPEEDS)[number];

/** A secondary action outlined on the card's blue; under lg, in the bar, it needs nothing. */
const ON_BLUE = "lg:dark:border-on-blue/60 lg:dark:bg-transparent lg:dark:hover:bg-on-blue/10";

/** The way on: under lg, what the bar leaves, on two even lines if need be; in the card, its own width. */
const ACTION = "h-auto min-h-12 px-5 py-1 text-balance whitespace-normal max-lg:flex-1 max-sm:px-3";
const MAIN_ACTION = cn(ACTION, "font-heading text-xl leading-none font-semibold");
const SECONDARY_ACTION = cn(ACTION, "text-[0.9375rem] leading-tight font-bold");

type LiveControlsProps = {
  dashboardHref: string;
  finished: boolean; // the replay has reached what it stops at: a pause where its manager acts, or the end of the match
  atStop: boolean; // what it stops at is a pause where its manager acts
  skipTo: SkipTarget; // where live-skip leads while the match runs: half-time before it, the result after
  coaching: { target: CoachingTarget; asked: boolean; busy: boolean; onToggle: () => void }; // the stop asked for while it runs
  speed: Speed;
  onSpeedChange: (speed: Speed) => void;
  onSkip: () => void;
  overlaid: boolean; // a card or the Coaching panel is open over the page, with the pause's own orange action
  onOpenPanel: () => void;
  // At a break whose panel has not been opened, nothing to lose: the way on without a change, as its card has it.
  resume: { label: string; pending: boolean; onResume: () => void } | null;
  coachingRef: Ref<HTMLButtonElement>;
  resumeRef: Ref<HTMLButtonElement>;
  continueRef: Ref<HTMLAnchorElement>;
};

/**
 * The screen's controls, one element: in the card from lg, fixed to the foot of the screen under it. While the match runs,
 * its speed, « Pause à la 30e », the screen's main action, which stops the match at the next boundary for the Coaching
 * panel, and the way to what comes next, which says where it leads: half-time before it, the result after, the
 * assistant deciding on the way; on a phone, an icon. At a pause, the way to the panel, and at a break whose panel has not been
 * opened the way on without a change, its card's two ways; at the end, the way on.
 */
export function LiveControls({
  dashboardHref,
  finished,
  atStop,
  skipTo,
  coaching,
  speed,
  onSpeedChange,
  onSkip,
  overlaid,
  onOpenPanel,
  resume,
  coachingRef,
  resumeRef,
  continueRef,
}: LiveControlsProps) {
  const t = useTranslations("live");
  const { target } = coaching;
  const minute = target === null || target === "halfTime" ? null : target.minute;
  return (
    <div
      data-testid="live-controls"
      className="flex items-center gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:border-t max-lg:border-sidebar-border max-lg:bg-sidebar max-lg:px-4 max-lg:pt-2 max-lg:pb-[max(1.125rem,env(safe-area-inset-bottom))] lg:flex-wrap lg:justify-center lg:gap-2.5"
    >
      {!finished ? (
        <>
          <div role="group" aria-label={t("speed")} className="flex shrink-0 gap-1 rounded-lg bg-background p-1">
            {SPEEDS.map((value) => (
              <Button
                key={value}
                variant={value === speed ? "default" : "ghost"}
                aria-pressed={value === speed}
                onClick={() => onSpeedChange(value)}
                data-testid={`live-speed-${value}`}
                className="h-11 min-w-11 rounded-[0.625rem] px-2 font-bold lg:min-w-13"
              >
                {t("speedFactor", { factor: value })}
              </Button>
            ))}
          </div>
          {/* Half-time stops by itself, and the last segment stops nowhere: the button says so, disabled. */}
          <Button
            variant={minute === null ? "outline" : "club"}
            className={cn(MAIN_ACTION, minute === null && ON_BLUE)}
            disabled={minute === null || coaching.busy}
            aria-pressed={minute === null ? undefined : coaching.asked}
            title={minute === null ? (target === "halfTime" ? undefined : t("request.noneHint")) : coaching.asked ? t("request.askedHint", { minute }) : undefined}
            onClick={coaching.onToggle}
            data-coaching-at={minute ?? target ?? "none"}
            data-testid="live-coaching-request"
          >
            {minute === null
              ? target === "halfTime"
                ? t("request.halfTime")
                : t("request.none")
              : coaching.asked
                ? t("request.asked", { minute })
                : t("request.at", { minute })}
          </Button>
          <Button
            variant="outline"
            className={cn(SECONDARY_ACTION, ON_BLUE, "max-sm:w-12 max-sm:flex-none max-sm:px-0")}
            onClick={onSkip}
            data-skip-to={skipTo}
            data-testid="live-skip"
          >
            <SkipForwardIcon aria-hidden className="sm:hidden" />
            <span className="max-sm:sr-only">{skipTo === "halfTime" ? t("skip.halfTime") : t("skip.result")}</span>
          </Button>
        </>
      ) : atStop ? (
        // One full orange action a screen: an open card or panel has its own; else the way on, or the panel's.
        <>
          <Button
            ref={coachingRef}
            variant={overlaid || resume !== null ? "outline" : "club"}
            className={cn(resume === null ? MAIN_ACTION : SECONDARY_ACTION, (overlaid || resume !== null) && ON_BLUE)}
            onClick={onOpenPanel}
            data-testid="live-coaching"
          >
            {t("coaching")}
          </Button>
          {resume !== null && (
            <Button
              ref={resumeRef}
              variant={overlaid ? "outline" : "club"}
              className={cn(MAIN_ACTION, overlaid && ON_BLUE)}
              disabled={resume.pending}
              onClick={resume.onResume}
              data-testid="live-resume"
            >
              {resume.label}
            </Button>
          )}
        </>
      ) : (
        <Link ref={continueRef} href={dashboardHref} data-testid="live-continue" className={buttonVariants({ variant: "club", className: MAIN_ACTION })}>
          {t("continue")}
        </Link>
      )}
    </div>
  );
}
