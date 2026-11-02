import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, type CurrentUser } from "@/src/auth/current-user";
import { ensureCurrentChallenge } from "@/src/db/challenge";
import { getChallengePage } from "@/src/db/challenge-view";
import { PublicPage } from "../_components/public-page";
import { ChallengeScreen } from "./_components/challenge-screen";

export const dynamic = "force-dynamic";

// « Jouer le défi » creates a worldVersion 2 save, several thousand rows in one transaction: up to 60 s, as the home page.
export const maxDuration = 60;

// No club name in the title, nor in the sharing image, the root layout's (CLAUDE.md, « Communication sortante »).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("challenge"))("title") };
}

/**
 * The weekly challenge, open to everyone: the screen of its tab in a save. The week's challenge is created here when the
 * Monday workflow has not (ensureCurrentChallenge). Nothing about the player is created before « Jouer le défi ».
 */
export default async function ChallengePage() {
  const user: CurrentUser | null = await getCurrentUser();
  // Not simulation code: the real week.
  const challenge = await ensureCurrentChallenge(new Date());
  const view = await getChallengePage(challenge, user === null ? null : { id: user.id, kind: user.kind });

  return (
    <PublicPage className="max-w-6xl">
      <ChallengeScreen view={view} />
    </PublicPage>
  );
}
