import { competitionName } from "@/src/i18n/countries";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrophyIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import type { TeamView } from "@/src/db/calendar";
import { getCupBracket, type CupBracket, type CupRoundView, type CupTieView } from "@/src/db/cup-view";
import { seasonLabel } from "@/src/engine/world";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { CupCard } from "../_components/cup-card";
import { Panel, PanelTitle } from "@/src/components/panel";
import { ScoreNotes } from "../_components/score-notes";
import { cupProgress, isCupRoundNumber } from "../_lib/cup-progress";
import { cupRoundName, cupRoundReached } from "../_lib/stage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cup"))("title") };
}

/** The managed club's cup in one sentence. */
function runSentence(bracket: CupBracket, t: Translator<"cup">, tStage: Translator<"stage">, locale: Locale): string {
  const run = bracket.managedRun;
  if (run === null) {
    return t("exempt");
  }
  if (run.status === "won") {
    return t("won");
  }
  const { next } = cupProgress(bracket);
  if (next === null) {
    return isCupRoundNumber(run.lastRound) ? t(`out.${run.lastRound}`) : t("outOther", { round: run.lastRound });
  }
  const exempt = run.firstRound > 1 && run.firstRound === next.round;
  const values = { round: cupRoundReached(next.round, tStage), date: formatShortDate(next.date, locale) };
  return exempt ? t("inExempt", values) : t("in", values);
}

function TeamCell({ team, tie, align }: { team: TeamView; tie: CupTieView; align: "left" | "right" }) {
  const played = tie.played;
  const won = played && tie.winnerClubSaveId === team.clubSaveId;
  return (
    // On two lines rather than cut, a long word broken if it must. The managed club stays orange, beaten or not.
    <span
      className={cn(
        "min-w-0 wrap-break-word",
        align === "right" && "text-right",
        won && "font-semibold",
        team.isManaged ? "text-(--club)" : played && !won && "text-muted-foreground",
      )}
    >
      {team.name}
    </span>
  );
}

function RoundPanel({ round }: { round: CupRoundView }) {
  const t = useTranslations("cup");
  const tStage = useTranslations("stage");
  const locale = useLocale();
  return (
    <Panel data-cup-round={round.round} data-testid={`cup-round-${round.round}`} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-xl font-bold normal-case">{cupRoundName(round.round, tStage)}</h2>
        <p className="text-xs text-muted-foreground first-letter:uppercase">{formatShortDate(round.date, locale)}</p>
      </div>
      {round.ties.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("drawPending")}</p>
      ) : (
        <ul className="divide-y text-sm">
          {round.ties.map((tie) => {
            const managed = tie.home.isManaged || tie.away.isManaged;
            return (
              <li
                key={tie.id}
                data-cup-tie=""
                data-managed={managed || undefined}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-2 py-1.5 max-sm:gap-2 max-sm:px-1",
                  managed && "rounded-md bg-secondary",
                )}
              >
                <TeamCell team={tie.home} tie={tie} align="right" />
                <span className="flex flex-col items-center">
                  <span className="font-heading text-base font-bold tabular-nums">
                    {tie.played ? `${tie.homeGoals} – ${tie.awayGoals}` : "–"}
                  </span>
                  {/* On two lines rather than as wide as a name cut in half. */}
                  <ScoreNotes match={tie} className="text-center text-[0.625rem] leading-tight whitespace-normal" />
                </span>
                <TeamCell team={tie.away} tie={tie} align="left" />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/**
 * The cup of the managed club's country: the club's card on top, the winner once the final is played, the club's run,
 * then round by round its ties and results (the winners in bold) and the dates of the rounds still to draw.
 */
export default async function CupPage({ params }: PageProps<"/saves/[id]/cup">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, tWorld, tStage, locale] = await Promise.all([
    getTranslations("cup"),
    getTranslations("world"),
    getTranslations("stage"),
    getLocale(),
  ]);
  const bracket = await getCupBracket(id);
  if (bracket === null) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 data-testid="cup-title" className="font-heading text-4xl font-bold">
          {t("title")}
        </h1>
        <p data-testid="cup-subtitle" className="text-sm text-muted-foreground tabular-nums">
          {t("subtitle", {
            competition: competitionName(bracket.competitionCode, tWorld),
            season: seasonLabel(bracket.startYear),
          })}
        </p>
      </div>

      <CupCard saveId={id} bracket={bracket} />

      {bracket.winner !== null && (
        <Panel data-cup-winner="" data-testid="cup-winner" className="flex items-center gap-4">
          <TrophyIcon aria-hidden className="size-8 shrink-0 text-(--club)" />
          <div className="min-w-0">
            <PanelTitle>{t("winner")}</PanelTitle>
            <p className="font-heading text-3xl font-bold wrap-break-word">{bracket.winner.name}</p>
          </div>
        </Panel>
      )}

      <Panel data-cup-run="" data-testid="cup-run" className="py-3">
        <p className="text-sm">
          <span className="font-semibold">{t("run")} </span>
          {runSentence(bracket, t, tStage, locale)}
        </p>
      </Panel>

      {/* In columns rather than in a grid: a round drawn holds up to sixteen ties, one still to draw a line. */}
      <div className="gap-5 *:mb-5 *:break-inside-avoid md:columns-2 xl:columns-3">
        {bracket.rounds.map((round) => (
          <RoundPanel key={round.round} round={round} />
        ))}
      </div>
    </div>
  );
}
