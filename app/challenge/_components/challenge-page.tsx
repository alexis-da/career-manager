import { getCurrentUser, type CurrentUser } from "@/src/auth/current-user";
import { ensureCurrentChallenge } from "@/src/db/challenge";
import { getChallengePage } from "@/src/db/challenge-view";
import { PublicPage } from "../../_components/public-page";
import { ChallengeClubName } from "./challenge-club-name";
import { ChallengeScreen } from "./challenge-screen";

/**
 * The weekly challenge, open to everyone, in the language of its address, /challenge or /fr/defi (app/challenge/page.tsx,
 * app/fr/defi/page.tsx): the screen of its tab in a save. The week's challenge is created here when the Monday workflow
 * has not (ensureCurrentChallenge). Nothing about the player is created before « Jouer le défi ».
 */
export async function ChallengePage() {
  const user: CurrentUser | null = await getCurrentUser();
  // Not simulation code: the real week.
  const challenge = await ensureCurrentChallenge(new Date());
  const view = await getChallengePage(challenge, user === null ? null : { id: user.id, kind: user.kind });

  return (
    <PublicPage page="challenge" className="max-w-6xl">
      {/* The week's club by name comes in the browser: no club's name in a public page's HTML. */}
      <ChallengeScreen view={view} clubName={<ChallengeClubName weekKey={view.weekKey} />} />
    </PublicPage>
  );
}
