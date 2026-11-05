import { competitionName } from "@/src/i18n/countries";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getLiveMatchday } from "@/src/db/calendar";
import { getHalfTimeTeam, getLiveWaiting } from "@/src/db/live-match";
import { formatDate } from "@/src/lib/format";
import { stageLabel } from "../_lib/stage";
import { LiveMatch } from "./_components/live-match";
import { startMinute } from "./_lib/live-pause";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("live"))("title") };
}

/**
 * The managed club's match of the day, live. The server plays it one segment of 15 minutes at a time and the page only
 * ever has what is played: its clock runs up to where the match waits, then asks for the next segment, or for all that
 * comes before the next break once « live-skip » is pressed, each step in one call that brings what the page shows.
 * « Jouer la journée » opens it with ?rejouer=1, from kick-off; without it, a match waiting opens where it waits, on the
 * break's card at a break; a match over is replayed whole, its shoot-out included.
 */
export default async function LivePage({ params, searchParams }: PageProps<"/saves/[id]/live">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const tWorld = await getTranslations("world");
  const tStage = await getTranslations("stage");
  const locale = await getLocale();
  const query = await searchParams;
  // Where the match waits, read first with the instructions played up to there: a step played meanwhile (another tab)
  // leaves the events ahead of it, never behind.
  const live = await getLiveWaiting(id);
  const waiting = live?.pause ?? null;
  const [matchday, team] = await Promise.all([getLiveMatchday(id), waiting === null ? null : getHalfTimeTeam(id)]);
  if (matchday === null) {
    redirect(`/saves/${id}`);
  }
  const { match, stadium } = matchday;
  // A cup tie names its cup in its stage: « Coupe — Finale ».
  const caption = [
    ...(match.cup ? [] : [competitionName(match.competitionCode, tWorld)]),
    stageLabel(match, tStage),
    formatDate(match.scheduledAt, locale),
    ...(stadium === null ? [] : [stadium]),
  ].join(" · ");

  return (
    <LiveMatch
      saveId={id}
      dashboardHref={`/saves/${id}`}
      caption={caption}
      match={match}
      others={matchday.others}
      pause={waiting}
      // The pause's own: none when the match went on between the two reads.
      team={team !== null && team.phase === waiting?.phase && team.minute === waiting.minute ? team : null}
      // None once the match is over: its state is gone, and they with it.
      instructions={live?.instructions ?? null}
      startMinute={startMinute(waiting, query.rejouer === "1")}
    />
  );
}
