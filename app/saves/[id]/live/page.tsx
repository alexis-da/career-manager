import { competitionName } from "@/src/i18n/countries";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getLiveMatchday } from "@/src/db/calendar";
import { getHalfTimeTeam, getLivePause } from "@/src/db/live-match";
import { formatDate } from "@/src/lib/format";
import { stageLabel } from "../_lib/stage";
import { LiveMatch } from "./_components/live-match";
import { isMatchBreak, startMinute } from "./_lib/live-pause";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("live"))("title") };
}

/**
 * The managed club's match of the day, live. The server plays it one segment of 15 minutes at a time and the page only
 * ever has what is played: its clock runs up to where the match waits, then asks for the next segment, or for all that
 * comes before the next break once « live-skip » is pressed. « Jouer la journée » opens it with ?rejouer=1, from
 * kick-off; without it, a match waiting opens where it waits, on the Coaching panel at a break; a match over is replayed
 * whole, its shoot-out included.
 */
export default async function LivePage({ params, searchParams }: PageProps<"/saves/[id]/live">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const tWorld = await getTranslations("world");
  const tStage = await getTranslations("stage");
  const locale = await getLocale();
  const query = await searchParams;
  // Where the match waits, read first: a step played meanwhile (another tab) leaves the events ahead of it, never behind.
  const waiting = await getLivePause(id);
  const [matchday, team] = await Promise.all([
    getLiveMatchday(id),
    waiting !== null && isMatchBreak(waiting.phase) ? getHalfTimeTeam(id) : null,
  ]);
  if (matchday === null) {
    redirect(`/saves/${id}`);
  }
  const { match, stadium } = matchday;
  // The choice event open at a pause has no card yet: its assistant decides it (G5 shows it).
  const pause = waiting === null ? null : { phase: waiting.phase, minute: waiting.minute };
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
      pause={pause}
      // The break's own: none when the match went on between the two reads, the page then reads it again.
      breakTeam={team !== null && team.phase === pause?.phase ? team : null}
      startMinute={startMinute(pause, query.rejouer === "1")}
    />
  );
}
