"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import Link from "@/src/components/link";
import { Panel, PanelTitle } from "@/src/components/panel";
import type { DailyMissionsView } from "@/src/db/missions";
import type { NextAppointment } from "@/src/db/next-appointment";
import { competitionName } from "@/src/i18n/countries";
import type { Translator } from "@/src/i18n/translator";
import { formatDate } from "@/src/lib/format";
import type { AssistantWord, Stake } from "@/src/lib/session-end";
import { cn } from "@/src/lib/utils";
import { InstallAppLink } from "../club/_components/install-app";
import type { SessionEndTutorial } from "../_lib/session-end";
import { stageLabel, stageNamesCompetition } from "../_lib/stage";
import { AssistantWordLine } from "./assistant-word";
import { DailyMissionsLine } from "./daily-missions";
import { TutorialLine } from "./tutorial/tutorial-line";
import { useTutorialEvents } from "./tutorial/use-tutorial";

/** A way on from the card: 44 px high on a phone, never a full orange (the screen keeps its own). */
const CARD_LINK = "text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";

/** What the next match is worth, in a sentence. */
function stakeText(stake: Stake, t: Translator<"sessionEnd">): string {
  switch (stake.kind) {
    case "cup":
      return t("stake.cup");
    case "opening":
      return t("stake.opening");
    case "rival":
      return t("stake.rival", { gap: stake.gap });
    case "climb":
      return t("stake.climb", { places: stake.places });
    case "rank":
      return t("stake.rank", { rank: stake.rank });
    case "europeKnockout":
      return t("stake.europeKnockout");
    case "europeFinal":
      return t("stake.europeFinal");
    case "europeOpening":
      return t("stake.europeOpening");
    case "europeTopFour":
      return t("stake.europeTopFour");
    case "europeTopTwelve":
      return t("stake.europeTopTwelve");
    case "europeRank":
      return t("stake.europeRank", { rank: stake.rank });
  }
}

type SessionEndCardProps = {
  saveId: string;
  appointment: NextAppointment;
  word: AssistantWord | null; // after a defeat only
  mission?: DailyMissionsView | null; // the day's missions, none in a challenge save
  onNavigate?: () => void; // a link followed: the simulation's dialog closes
  // The tutorial's first day (step « full-time »): its line in place of the missions, none drawn that day, the card ringed.
  tutorial?: SessionEndTutorial | null;
  className?: string;
};

/**
 * « À demain », after a live match and at the end of a simulation: the assistant's word after a defeat, the next match
 * and what it is worth, the day's mission (done: tomorrow's), the week's challenge while it runs, and the installable game
 * (never in an app's browser, nor once installed). Reasons to come back, nothing to do now: links only, the screen's
 * orange stays its own.
 */
export function SessionEndCard({ saveId, appointment, word, mission = null, onNavigate, tutorial = null, className }: SessionEndCardProps) {
  const t = useTranslations("sessionEnd");
  const tTutorial = useTranslations("tutorial");
  const sendTutorial = useTutorialEvents(saveId);
  const shown = useRef(false);
  // Its first day's « À demain » seen: the first day is over (Tutorial.day1At).
  useEffect(() => {
    if (tutorial !== null && !shown.current) {
      shown.current = true;
      sendTutorial([{ step: "full-time", event: "show" }]);
    }
  }, [tutorial, sendTutorial]);
  // A link of the card followed: the first day's way on.
  const navigate =
    tutorial === null
      ? onNavigate
      : () => {
          sendTutorial([{ step: "full-time", event: "done" }]);
          onNavigate?.();
        };
  const tWorld = useTranslations("world");
  const tStage = useTranslations("stage");
  const locale = useLocale();
  const { match, challenge } = appointment;
  return (
    <Panel
      data-testid="session-end"
      // Ringed as the tutorial's bubbles ring what they speak of.
      data-tutorial-target={tutorial === null ? undefined : ""}
      className={cn("flex flex-col gap-3", className)}
    >
      <PanelTitle>{t("title")}</PanelTitle>
      {word !== null && <AssistantWordLine word={word} />}
      {match === null ? (
        <p className="text-sm text-muted-foreground">{t("seasonOver")}</p>
      ) : (
        <div data-testid="session-end-match" className="space-y-1">
          <p className="eyebrow">{t("next")}</p>
          <p className="text-[0.9375rem] leading-snug font-bold wrap-break-word">
            {match.home ? t("home", { opponent: match.opponent }) : t("away", { opponent: match.opponent })}
          </p>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {[
              formatDate(match.scheduledAt, locale),
              ...(stageNamesCompetition(match) ? [] : [competitionName(match.competitionCode, tWorld)]),
              stageLabel(match, tStage),
            ].join(" · ")}
          </p>
          <p data-testid="session-end-stake" data-stake={match.stake.kind} className="text-sm font-semibold text-highlight">
            {stakeText(match.stake, t)}
          </p>
          <Link href={`/saves/${saveId}/lineup`} onClick={navigate} data-testid="session-end-prepare" className={CARD_LINK}>
            {t("prepare")}
          </Link>
        </div>
      )}
      {tutorial !== null ? (
        <TutorialLine text={tTutorial("steps.fullTime")} place={tutorial.place} />
      ) : (
        mission !== null && <DailyMissionsLine missions={mission} />
      )}
      {challenge !== null && (
        <Link href={`/saves/${saveId}/challenge`} onClick={navigate} data-testid="session-end-challenge" className={CARD_LINK}>
          {challenge.own === null
            ? t("challenge", { days: challenge.daysLeft })
            : t("challengeOwn", { played: challenge.own.played, horizon: challenge.own.horizon, days: challenge.daysLeft })}
        </Link>
      )}
      <InstallAppLink />
    </Panel>
  );
}
