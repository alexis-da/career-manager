import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLiveMatchday } from "@/src/db/calendar";
import { getHalfTimeTeam } from "@/src/db/live-match";
import { HALF_TIME_MINUTE } from "@/src/engine/balance";
import { formatDate } from "@/src/lib/format";
import { LiveMatch } from "./_components/live-match";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Match en direct" };

/**
 * Replay of the managed club's match of the day; the matchday itself is already simulated and saved. « Jouer la
 * journée » opens it with ?rejouer=1: the first half from kick-off, up to the half-time screen. Without it, a match
 * waiting at half-time opens on the half-time screen. Once the second half is played, ?reprise=1 replays it from 45'.
 */
export default async function LivePage({ params, searchParams }: PageProps<"/saves/[id]/live">) {
  const { id } = await params;
  const query = await searchParams;
  const [matchday, halfTime] = await Promise.all([getLiveMatchday(id), getHalfTimeTeam(id)]);
  if (matchday === null) {
    redirect(`/saves/${id}`);
  }
  const { match } = matchday;
  const paused = matchday.halfTime && halfTime !== null;
  const fromKickOff = paused ? query.rejouer === "1" : query.reprise !== "1";

  return (
    <LiveMatch
      // A new replay once the second half is played: its clock starts again from 45'.
      key={`${match.id}:${paused ? "h1" : "h2"}`}
      saveId={id}
      dashboardHref={`/saves/${id}`}
      caption={`${match.competitionName} · Journée ${match.round} · ${formatDate(match.scheduledAt)}`}
      match={match}
      others={matchday.others}
      halfTime={paused ? halfTime : null}
      startMinute={fromKickOff ? 0 : HALF_TIME_MINUTE}
    />
  );
}
