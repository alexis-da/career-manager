"use client";

import { CalendarDaysIcon, ChevronDownIcon, FastForwardIcon, LoaderCircleIcon, PlayIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import type { WorldVersion } from "@/src/engine/world-version";
import { cn } from "@/src/lib/utils";
import { isLivePath, sectionAt, tabAt, type Section } from "../_lib/sections";
import { advanceSeasonAction, playMatchdayAction, playUntilNextMatchAction, type GameActionResult } from "../actions";
import { useSimulation, type SimulationTarget } from "./simulation";
import { isNewVersionError } from "../../../_lib/new-version";

/** The menu's targets, each named in the messages by its kind; a day picked in the calendar is the last entry's. */
const SIMULATION_TARGETS: Exclude<SimulationTarget, { kind: "date" }>[] = [
  { kind: "next-match" },
  { kind: "month-end" },
  { kind: "window-close" },
  { kind: "season-end" },
];

/** One full orange action a screen: these entries have their own, « Recruter », « Enregistrer », « Jouer le défi », « Partager ». */
const OWN_ORANGE_ACTION: ReadonlySet<Section["key"]> = new Set(["team", "transfers", "club"]);

/** A secondary action on the blue of the sidebar's card: outlined there. */
const ON_BLUE = "lg:dark:border-on-blue/60 lg:dark:bg-transparent lg:dark:hover:bg-on-blue/10";

/** The dashboard's hero: the main action, full width on a phone, and the secondary ones beside each other, on its blue. */
const HERO_MAIN = "h-14 px-6 font-heading text-[1.375rem] font-semibold lg:px-8 lg:whitespace-normal";
const HERO_SECONDARY = "h-12 text-base font-bold dark:border-on-blue/60 dark:bg-transparent dark:hover:bg-on-blue/10 lg:h-14 lg:px-6";

/** « Simuler jusqu'à… » and its targets; the last one lets the manager pick a day in the calendar. */
function SimulateMenu({ disabled, hero }: { disabled: boolean; hero: boolean }) {
  const t = useTranslations("gameActions");
  const simulation = useSimulation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={hero ? HERO_SECONDARY : cn("h-11 px-2.5 font-heading text-base font-semibold sm:px-3 lg:w-full lg:text-sm", ON_BLUE)}
          />
        }
        disabled={disabled || simulation.busy}
        data-testid="simulate-menu"
      >
        <FastForwardIcon data-icon="inline-start" />
        {/* At the head of Match, its icons alone on a phone, its name still read: the main action needs the room. */}
        {hero ? t("simulateShort") : <span className="max-sm:sr-only">{t("simulate")}</span>}
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-60">
        {SIMULATION_TARGETS.map((target) => (
          <DropdownMenuItem key={target.kind} onClick={() => simulation.start(target)} data-testid={`simulate-${target.kind}`}>
            {t(`targets.${target.kind}`)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={simulation.beginPicking} data-testid="simulate-pick-date">
          <CalendarDaysIcon />
          {t("pickDate")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type GameActionsProps = {
  saveId: string;
  seasonFinished: boolean;
  liveMatch: boolean; // the managed club's match waits at half-time: nothing moves on before it ends
  worldVersion: WorldVersion; // 2: « Prochain match », which plays the other competitions' dates in between
  hero?: boolean; // in the dashboard's hero: larger, « Jouer le match », with `prepare` next to « Simuler »
  prepare?: ReactNode;
};

/** The game's main action, in orange, with the quick simulation menu during a season. */
export function GameActions({ saveId, seasonFinished, liveMatch, worldVersion, hero = false, prepare }: GameActionsProps) {
  const [pending, startTransition] = useTransition();
  const [intermediate, setIntermediate] = useState(0); // dates played so far by « Prochain match »
  const [kickOff, setKickOff] = useState(false); // « Prochain match » is playing the managed club's date
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("gameActions");
  const common = useTranslations("common");

  const show = (result: GameActionResult) => {
    if (result.redirectTo !== undefined) {
      if (result.announce === true) {
        toast.success(result.message);
      }
      router.push(result.redirectTo);
    } else if (result.ok) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const run = (action: (saveId: string) => Promise<GameActionResult>) =>
    startTransition(async () => {
      try {
        show(await action(saveId));
      } catch (error) {
        toast.error(isNewVersionError(error) ? common("newVersion") : t("failed"));
      }
    });

  // « Prochain match »: the dates before the managed club's match, a few per call to stay well within a request's
  // time limit, then its date as « Jouer la journée » plays it, on to the replay.
  const playToNextMatch = () =>
    startTransition(async () => {
      try {
        let played = 0;
        setIntermediate(0);
        setKickOff(false);
        for (;;) {
          const batch = await playUntilNextMatchAction(saveId);
          played += batch.played;
          setIntermediate(played);
          if (batch.done) {
            break;
          }
        }
        if (played > 0) {
          toast.info(t("intermediatePlayed", { count: played }));
        }
        setKickOff(true);
        show(await playMatchdayAction(saveId));
      } catch (error) {
        toast.error(isNewVersionError(error) ? common("newVersion") : t("failed"));
        router.refresh();
      }
    });

  const variant = OWN_ORANGE_ACTION.has(sectionAt(pathname.slice(`/saves/${saveId}`.length)).key) ? "outline" : "club";
  const className = hero
    ? HERO_MAIN
    : cn(
        // As wide as the head of Match allows; on a computer, as wide as the sidebar's card, on two lines if need be.
        "h-11 px-4 font-heading text-lg font-semibold max-lg:flex-1 lg:h-auto lg:min-h-11 lg:w-full lg:py-1.5 lg:whitespace-normal",
        variant === "outline" && ON_BLUE,
      );

  const main = liveMatch ? (
    <Link href={`/saves/${saveId}/live`} className={buttonVariants({ variant, className })} data-testid="resume-match">
      <PlayIcon data-icon="inline-start" className="fill-current" />
      {t("resumeMatch")}
    </Link>
  ) : seasonFinished ? (
    <Button variant={variant} className={className} disabled={pending} onClick={() => run(advanceSeasonAction)} data-testid="next-season">
      <FastForwardIcon data-icon="inline-start" className="fill-current" />
      {pending ? t("preparingSeason") : t("nextSeason")}
    </Button>
  ) : worldVersion === 2 ? (
    // Busy from the click: the dates in between first, counted as they are played, then the match's own.
    <Button
      variant={variant}
      className={className}
      disabled={pending}
      aria-busy={pending}
      onClick={playToNextMatch}
      data-testid="next-match"
    >
      {pending ? (
        <LoaderCircleIcon data-icon="inline-start" aria-hidden className="animate-spin" />
      ) : (
        <PlayIcon data-icon="inline-start" className="fill-current" />
      )}
      {pending ? (kickOff ? t("kickOff") : `${t("intermediate")}${intermediate > 0 ? ` ${intermediate}` : ""}`) : t(hero ? "playMatch" : "nextMatch")}
    </Button>
  ) : (
    <Button variant={variant} className={className} disabled={pending} onClick={() => run(playMatchdayAction)} data-testid="play-matchday">
      <PlayIcon data-icon="inline-start" className="fill-current" />
      {pending ? t("simulating") : t("playMatchday")}
    </Button>
  );
  const simulate = !liveMatch && !seasonFinished && <SimulateMenu disabled={pending} hero={hero} />;

  if (hero) {
    return (
      <div className="flex flex-wrap gap-2.5 *:flex-1 *:first:basis-full lg:*:flex-none lg:*:first:basis-auto">
        {main}
        {prepare}
        {simulate}
      </div>
    );
  }
  return simulate === false ? (
    main
  ) : (
    <div className="flex items-center gap-2 lg:flex-col-reverse lg:items-stretch">
      {simulate}
      {main}
    </div>
  );
}

/**
 * The game's actions outside the dashboard, whose hero has them, and the match live, whose own buttons are the way on: in
 * the sidebar's card on a computer; on a phone, at the head of the Match screens and nowhere else. One element for both,
 * so that their testids stay unique on a page.
 */
export function SaveBarActions(props: Omit<GameActionsProps, "hero" | "prepare">) {
  const path = usePathname().slice(`/saves/${props.saveId}`.length);
  const section = sectionAt(path);
  if (section.key === "dashboard" || isLivePath(path)) {
    return null;
  }
  return (
    <div className={cn("max-lg:order-last max-lg:basis-full", (section.key !== "match" || tabAt(path) === undefined) && "max-lg:hidden")}>
      <GameActions {...props} />
    </div>
  );
}
