import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import type { ScoreTimeline, TeamView } from "@/src/db/calendar";
import { getNationalLive } from "@/src/db/national-live";
import { isNationCode } from "@/src/engine/nations";
import { FRIENDLY } from "@/src/engine/tournaments";
import { formatDayDate } from "@/src/lib/format";
import { internationalRoundName, internationalTournamentName } from "../../_lib/stage";
import { LiveMatch } from "../_components/live-match";
import { startMinute } from "../_lib/live-pause";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nationalLive"))("title") };
}

/** A match's address on this page, which names it (?m=), from kick-off with ?rejouer=1. */
const livePath = (saveId: string, matchId: string, replay: boolean): string =>
  `/saves/${saveId}/live/nation?m=${encodeURIComponent(matchId)}${replay ? "&rejouer=1" : ""}`;

/**
 * The national coach's match live (docs/design/selections.md § 9.8, N4b): his club's live screen on his nation's match,
 * which the server plays a segment of 15 minutes at a time as his club's, with its choice events, substitutions and
 * instructions. Its nations by their names and their codes, its competition and round, « Terrain neutre » in a
 * tournament; the way out leads to his national team's tab, and there is no « À demain » card at its end. The game opens
 * it on ?m=<match>, with ?rejouer=1 at kick-off, without it for a match simulated, replayed whole; without ?m=, the save's
 * match waiting live, whose address then names it: read again once over, when the save waits for no match any more, the
 * page is still that match's. A match that is not one of his nation's sends him back to his national team's tab.
 */
export default async function NationalLivePage({ params, searchParams }: PageProps<"/saves/[id]/live/nation">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const query = await searchParams;
  const matchId = typeof query.m === "string" && query.m !== "" ? query.m : null;
  const replay = query.rejouer === "1";
  const live = await getNationalLive(id, matchId);
  if (live === null) {
    redirect(`/saves/${id}/nation`);
  }
  if (matchId === null) {
    redirect(livePath(id, live.match.id, replay));
  }
  const t = await getTranslations("nationalLive");
  const tWorld = await getTranslations("world");
  const tNations = await getTranslations("nations");
  const tStage = await getTranslations("stage");
  const locale = await getLocale();

  // The data names each nation by its code: the screens by its name in the player's language.
  const nationName = (code: string): string => (isNationCode(code) ? tWorld(`nationalities.${code}`) : code);
  const named = <M extends { home: TeamView; away: TeamView }>(fixture: M): M => ({
    ...fixture,
    home: { ...fixture.home, name: nationName(fixture.home.name) },
    away: { ...fixture.away, name: nationName(fixture.away.name) },
  });

  const { match, stage } = live;
  // « Coupe des Hémisphères — Demi-finale · mer. 21 juin 2030 · Terrain neutre », « Éliminatoires, 3e journée · ven. 9 oct.
  // 2026 », « Match amical · mar. 13 oct. 2026 ».
  const round =
    internationalRoundName({ competitionCode: stage.competition, round: stage.round, pool: stage.pool }, tNations) ??
    t("groupRound", { round: stage.round });
  const tournament = internationalTournamentName(stage.competition, tNations);
  const caption = [
    tournament === null ? round : t("tournamentStage", { tournament, stage: round }),
    formatDayDate(match.scheduledAt, locale),
    ...(stage.neutral ? [tStage("neutral")] : []),
  ].join(" · ");

  // The other matches of its date, of every national teams' competition: his nation's competition's first, then each
  // other one's together, the friendlies last; within each, as they come.
  const order = (other: ScoreTimeline): number =>
    other.competitionCode === stage.competition ? 0 : other.competitionCode === FRIENDLY ? 2 : 1;
  const others = [...live.others]
    .sort((a, b) => order(a) - order(b) || a.competitionCode.localeCompare(b.competitionCode))
    .map((other) => named(other));

  return (
    <LiveMatch
      saveId={id}
      dashboardHref={`/saves/${id}/nation`}
      caption={caption}
      match={named(match)}
      others={others}
      pause={live.pause}
      // The pause's own: a team read at another pause would not be the one the match waits with.
      team={live.team !== null && live.team.phase === live.pause?.phase && live.team.minute === live.pause.minute ? live.team : null}
      // None once the match is over: its state is gone, and they with it.
      instructions={live.instructions}
      startMinute={startMinute(live.pause, replay)}
      sessionEnd={null}
      // Their codes, before the names replace them: the marks of the score card.
      nations={{ home: match.home.name, away: match.away.name }}
    />
  );
}
