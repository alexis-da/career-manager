"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "@/src/components/link";
import { Panel, PanelTitle } from "@/src/components/panel";
import type { NextAppointment } from "@/src/db/next-appointment";
import { competitionName } from "@/src/i18n/countries";
import type { Translator } from "@/src/i18n/translator";
import { formatDate } from "@/src/lib/format";
import type { AssistantWord, Stake } from "@/src/lib/session-end";
import { cn } from "@/src/lib/utils";
import { InstallAppLink } from "../club/_components/install-app";
import { stageLabel } from "../_lib/stage";
import { AssistantWordLine } from "./assistant-word";

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
  }
}

type SessionEndCardProps = {
  saveId: string;
  appointment: NextAppointment;
  word: AssistantWord | null; // after a defeat only
  onNavigate?: () => void; // a link followed: the simulation's dialog closes
  className?: string;
};

/**
 * « À demain », after a live match and at the end of a simulation: the assistant's word after a defeat, the next match
 * and what it is worth, the week's challenge while it runs, and the installable game (never in an app's browser, nor once
 * installed). Reasons to come back, nothing to do now: links only, the screen's orange stays its own.
 */
export function SessionEndCard({ saveId, appointment, word, onNavigate, className }: SessionEndCardProps) {
  const t = useTranslations("sessionEnd");
  const tWorld = useTranslations("world");
  const tStage = useTranslations("stage");
  const locale = useLocale();
  const { match, challenge } = appointment;
  return (
    <Panel data-testid="session-end" className={cn("flex flex-col gap-3", className)}>
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
            {[formatDate(match.scheduledAt, locale), ...(match.cup ? [] : [competitionName(match.competitionCode, tWorld)]), stageLabel(match, tStage)].join(" · ")}
          </p>
          <p data-testid="session-end-stake" data-stake={match.stake.kind} className="text-sm font-semibold text-highlight">
            {stakeText(match.stake, t)}
          </p>
          <Link href={`/saves/${saveId}/lineup`} onClick={onNavigate} data-testid="session-end-prepare" className={CARD_LINK}>
            {t("prepare")}
          </Link>
        </div>
      )}
      {challenge !== null && (
        <Link href={`/saves/${saveId}/challenge`} onClick={onNavigate} data-testid="session-end-challenge" className={CARD_LINK}>
          {challenge.own === null
            ? t("challenge", { days: challenge.daysLeft })
            : t("challengeOwn", { played: challenge.own.played, horizon: challenge.own.horizon, days: challenge.daysLeft })}
        </Link>
      )}
      <InstallAppLink />
    </Panel>
  );
}
