import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLiveMatchday } from "@/src/db/calendar";
import { formatDate } from "@/src/lib/format";
import { LiveMatch } from "./_components/live-match";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Match en direct" };

/** Replay of the managed club's match of the day just played; the matchday itself is already simulated and saved. */
export default async function LivePage({ params }: PageProps<"/saves/[id]/live">) {
  const { id } = await params;
  const matchday = await getLiveMatchday(id);
  if (matchday === null) {
    redirect(`/saves/${id}`);
  }
  const { match } = matchday;

  return (
    <LiveMatch
      dashboardHref={`/saves/${id}`}
      caption={`${match.competitionName} · Journée ${match.round} · ${formatDate(match.scheduledAt)}`}
      match={match}
      others={matchday.others}
    />
  );
}
