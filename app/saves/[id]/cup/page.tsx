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
import { Panel, PanelTitle } from "../_components/panel";
import { ScoreNotes } from "../_components/score-notes";
import { cupRoundName, cupRoundReached } from "../_lib/stage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cup"))("title") };
}

/** The rounds a club can go out in, each with its sentence: « Éliminé en 8es de finale. ». */
const OUT_ROUNDS = [1, 2, 3, 4, 5, 6] as const;

type OutRound = (typeof OUT_ROUNDS)[number];

const isOutRound = (round: number): round is OutRound => (OUT_ROUNDS as readonly number[]).includes(round);

/** The managed club's cup in one sentence. */
function runSentence(bracket: CupBracket, t: Translator<"cup">, tStage: Translator<"stage">, locale: Locale): string {
  const run = bracket.managedRun;
  if (run === null) {
    return t("exempt");
  }
  if (run.status === "won") {
    return t("won");
  }
  if (run.status === "out") {
    return isOutRound(run.lastRound) ? t(`out.${run.lastRound}`) : t("outOther", { round: run.lastRound });
  }
  const next = bracket.rounds[run.lastRound - 1];
  const exempt = run.firstRound > 1 && run.firstRound === run.lastRound;
  const values = { round: cupRoundReached(run.lastRound, tStage), date: formatShortDate(next.date, locale) };
  return exempt ? t("inExempt", values) : t("in", values);
}

function TeamCell({ team, tie, align }: { team: TeamView; tie: CupTieView; align: "left" | "right" }) {
  const played = tie.played;
  const won = played && tie.winnerClubSaveId === team.clubSaveId;
  return (
    // On a phone, on two lines rather than cut.
    <span
      className={cn(
        "min-w-0 truncate max-sm:whitespace-normal",
        align === "right" && "text-right",
        team.isManaged && "text-(--club)",
        won ? "font-semibold" : played && "text-muted-foreground",
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
        <h2 className="font-heading text-xl font-bold">{cupRoundName(round.round, tStage)}</h2>
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
                  "grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-2 py-1.5 max-sm:gap-2 max-sm:px-1",
                  managed && "rounded-md bg-(--club)/12",
                )}
              >
                <TeamCell team={tie.home} tie={tie} align="right" />
                <span className="flex flex-col items-center">
                  <span className="font-heading text-base font-bold tabular-nums">
                    {tie.played ? `${tie.homeGoals} – ${tie.awayGoals}` : "–"}
                  </span>
                  <ScoreNotes match={tie} className="text-[0.625rem]" />
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
 * The cup of the managed club's country, round by round: its ties and results (the winners in bold), the dates of
 * the rounds still to draw, the managed club's run, and the winner on top once the final is played.
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

      {bracket.winner !== null && (
        <Panel data-cup-winner="" data-testid="cup-winner" className="flex items-center gap-4 border-(--club)/50 bg-(--club)/10">
          <TrophyIcon aria-hidden className="size-8 shrink-0 text-(--club)" />
          <div>
            <PanelTitle>{t("winner")}</PanelTitle>
            <p className="font-heading text-3xl font-bold">{bracket.winner.name}</p>
          </div>
        </Panel>
      )}

      <Panel data-cup-run="" data-testid="cup-run" className="py-3">
        <p className="text-sm">
          <span className="font-semibold">{t("run")} </span>
          {runSentence(bracket, t, tStage, locale)}
        </p>
      </Panel>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {bracket.rounds.map((round) => (
          <RoundPanel key={round.round} round={round} />
        ))}
      </div>
    </div>
  );
}
