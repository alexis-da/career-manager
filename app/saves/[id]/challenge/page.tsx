import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChallengeScreen } from "@/app/challenge/_components/challenge-screen";
import { getCurrentUser, requireOwnedSave } from "@/src/auth/current-user";
import { ensureCurrentChallenge } from "@/src/db/challenge";
import { getChallengePage } from "@/src/db/challenge-view";

export const dynamic = "force-dynamic";

// No club name in the title (CLAUDE.md, « Communication sortante »).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("challenge"))("title") };
}

/** The weekly challenge inside a save, under Club: the public page's screen, whichever save is open. */
export default async function SaveChallengePage({ params }: PageProps<"/saves/[id]/challenge">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const user = await getCurrentUser();
  // Not simulation code: the real week.
  const challenge = await ensureCurrentChallenge(new Date());
  const view = await getChallengePage(challenge, user === null ? null : { id: user.id, kind: user.kind });

  return <ChallengeScreen view={view} />;
}
