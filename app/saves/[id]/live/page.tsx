import { competitionName } from "@/src/i18n/countries";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getLiveMatchday } from "@/src/db/calendar";
import { getHalfTimeTeam } from "@/src/db/live-match";
import { HALF_TIME_MINUTE, REGULATION_MINUTES } from "@/src/engine/balance";
import { formatDate } from "@/src/lib/format";
import { stageLabel } from "../_lib/stage";
import { LiveMatch } from "./_components/live-match";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("live"))("title") };
}

/**
 * Replay of the managed club's match of the day; the matchday itself is already simulated and saved. « Jouer la
 * journée » opens it with ?rejouer=1: the first half from kick-off, up to the half-time screen. Without it, a match
 * waiting at a break opens on its break screen. Once the second half is played, ?reprise=1 replays it from 45' (up to
 * the end of regulation time of a level cup tie, which waits there); once extra time is played, ?reprise=2 replays it
 * from 90', the shoot-out included.
 */
export default async function LivePage({ params, searchParams }: PageProps<"/saves/[id]/live">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const tWorld = await getTranslations("world");
  const tStage = await getTranslations("stage");
  const locale = await getLocale();
  const query = await searchParams;
  const [matchday, breakTeam] = await Promise.all([getLiveMatchday(id), getHalfTimeTeam(id)]);
  if (matchday === null) {
    redirect(`/saves/${id}`);
  }
  const { match } = matchday;
  const pause = matchday.pause !== null && breakTeam !== null ? breakTeam : null;
  const startMinute =
    pause?.phase === "HALF_TIME"
      ? query.rejouer === "1"
        ? 0
        : HALF_TIME_MINUTE
      : pause?.phase === "REGULATION_END"
        ? query.reprise === "1"
          ? HALF_TIME_MINUTE
          : REGULATION_MINUTES
        : query.reprise === "1"
          ? HALF_TIME_MINUTE
          : query.reprise === "2"
            ? REGULATION_MINUTES
            : 0;

  return (
    <LiveMatch
      // A new replay at each step: its clock starts again from the break.
      key={`${match.id}:${pause?.phase ?? "end"}`}
      saveId={id}
      dashboardHref={`/saves/${id}`}
      // A cup tie names its cup in its stage: « Coupe — Finale ».
      caption={`${match.cup ? "" : `${competitionName(match.competitionCode, tWorld)} · `}${stageLabel(match, tStage)} · ${formatDate(match.scheduledAt, locale)}`}
      match={match}
      others={matchday.others}
      pause={pause}
      startMinute={startMinute}
    />
  );
}
