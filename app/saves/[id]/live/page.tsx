import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getLiveMatchday } from "@/src/db/calendar";
import { getHalfTimeTeam } from "@/src/db/live-match";
import { HALF_TIME_MINUTE } from "@/src/engine/balance";
import { formatDate } from "@/src/lib/format";
import { stageLabel } from "../_lib/stage";
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
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
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
      caption={`${match.competitionName} · ${stageLabel(match)} · ${formatDate(match.scheduledAt)}`}
      match={match}
      others={matchday.others}
      halfTime={paused ? halfTime : null}
      startMinute={fromKickOff ? 0 : HALF_TIME_MINUTE}
    />
  );
}
