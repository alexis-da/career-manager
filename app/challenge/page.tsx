import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, type CurrentUser } from "@/src/auth/current-user";
import { buttonVariants } from "@/src/components/ui/button";
import { ensureCurrentChallenge } from "@/src/db/challenge";
import { getChallengePage, type ChallengePageView } from "@/src/db/challenge-view";
import { WORLD_START_DATE } from "@/src/engine/world";
import { formatDate, formatParisDateTime, formatParisDay } from "@/src/lib/format";
import { GoogleSignInButton } from "../_components/account-panel";
import { BrandFooter } from "../_components/brand-footer";
import { CHALLENGE_FULL_MESSAGE, CHALLENGE_PLAYED_MESSAGE } from "./_lib/messages";
import { PlayChallengeForm } from "./_components/play-challenge-form";
import { RankingTable } from "./_components/ranking-table";

export const dynamic = "force-dynamic";

// « Jouer le défi » creates a worldVersion 2 save, several thousand rows in one transaction: up to 60 s, as the home page.
export const maxDuration = 60;

// No club name in the title, nor in the sharing image, the root layout's (CLAUDE.md, « Communication sortante »).
export const metadata: Metadata = { title: "Défi de la semaine" };

/** What the player can do this week: play, go back to their save, or why they cannot. */
function ChallengeAction({ view }: { view: ChallengePageView }) {
  const { own } = view;
  if (own !== null && own.saveId !== null) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/saves/${own.saveId}`} className={buttonVariants({ size: "lg" })}>
          Reprendre ma partie
        </Link>
        <p className="text-sm text-muted-foreground tabular-nums">
          {own.submitted ? "Score enregistré" : `Journée ${own.matchdaysPlayed} / ${view.horizon}`}
        </p>
      </div>
    );
  }
  if (own !== null) {
    return <p className="text-sm">{CHALLENGE_PLAYED_MESSAGE}</p>;
  }
  if (view.full) {
    return (
      <p data-testid="challenge-full" className="text-sm font-semibold">
        {CHALLENGE_FULL_MESSAGE}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <PlayChallengeForm weekKey={view.weekKey} />
      <p className="text-xs text-muted-foreground">Partie de défi supprimée le {formatParisDay(view.savesPurgedAt)}</p>
    </div>
  );
}

/**
 * The weekly challenge, open to everyone: the week's scenario (its club, its end in Paris time), « Jouer le défi » or
 * the player's save, this week's ranking and last week's. The week's challenge is created here when the Monday
 * workflow has not (ensureCurrentChallenge). Nothing about the player is created before « Jouer le défi ».
 */
export default async function ChallengePage() {
  const user: CurrentUser | null = await getCurrentUser();
  // Not simulation code: the real week.
  const challenge = await ensureCurrentChallenge(new Date());
  const view = await getChallengePage(challenge, user === null ? null : { id: user.id, kind: user.kind });
  const ownOutsideRanking = view.ranking.some((row) => row.rank === null);

  return (
    <main className="brand flex-1 bg-background text-foreground">
      <div lang="fr" className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
        <header className="space-y-2">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            ← Late Winner
          </Link>
          <h1 className="font-heading text-4xl font-bold">Défi de la semaine</h1>
          <p className="text-sm text-muted-foreground">
            Semaine {view.weekNumber} · fin le {formatParisDateTime(view.endsAt)} (heure de Paris)
          </p>
        </header>

        <section aria-labelledby="challenge-scenario" className="space-y-4 rounded-lg border bg-card p-5">
          <h2 id="challenge-scenario" className="eyebrow">
            Le scénario
          </h2>
          <div className="space-y-1">
            <p data-testid="challenge-club" className="flex items-center gap-3 font-heading text-3xl font-bold">
              <span aria-hidden className="h-7 w-1.5 shrink-0 rounded-full" style={{ background: view.club.primaryColor }} />
              {view.club.name}
            </p>
            <p className="text-sm text-muted-foreground">{view.club.competitionName}</p>
          </div>
          <p className="text-sm leading-relaxed">
            Tu prends le club le {formatDate(WORLD_START_DATE)}, comme tous les joueurs de la semaine : même club, même
            monde. Seules comptent ses {view.horizon} premières journées de championnat, aux points, puis à la différence
            de buts, puis aux buts marqués. Ensuite, la partie continue, sans compter.
          </p>
          <ChallengeAction view={view} />
        </section>

        <section aria-labelledby="challenge-ranking" className="space-y-3">
          <h2 id="challenge-ranking" className="eyebrow">
            Classement de la semaine {view.weekNumber}
          </h2>
          <RankingTable
            rows={view.ranking}
            label={`Classement de la semaine ${view.weekNumber}`}
            empty="Personne n'a encore terminé le défi cette semaine."
          />
          {ownOutsideRanking && <GoogleSignInButton />}
        </section>

        {view.previous !== null && (
          <section aria-labelledby="challenge-previous" className="space-y-3">
            <h2 id="challenge-previous" className="eyebrow">
              Semaine {view.previous.weekNumber}
            </h2>
            <RankingTable
              rows={view.previous.ranking}
              label={`Classement de la semaine ${view.previous.weekNumber}`}
              empty="Personne n'a terminé ce défi."
            />
          </section>
        )}

        <BrandFooter />
      </div>
    </main>
  );
}
