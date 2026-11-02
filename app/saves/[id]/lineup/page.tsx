import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getLineupEditor } from "@/src/db/lineup";
import { getOpponentPreview } from "@/src/db/opponent";
import { getSquadView } from "@/src/db/squad";
import { formatShortDate } from "@/src/lib/format";
import { FirstStepTip, getFirstSteps } from "../_components/first-steps";
import { MarkSeen } from "../_components/mark-seen";
import { OpponentSheet } from "../_components/opponent-sheet";
import { showsFirstActions, showsTip } from "../_lib/first-steps";
import { LineupScreen } from "./_components/lineup-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("lineup"))("title") };
}

export default async function LineupPage({ params }: PageProps<"/saves/[id]/lineup">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, locale] = await Promise.all([getTranslations("lineup"), getLocale()]);
  const [editor, squad, opponent, firstSteps] = await Promise.all([
    getLineupEditor(id),
    getSquadView(id),
    getOpponentPreview(id),
    getFirstSteps(id),
  ]);

  return (
    <div className="space-y-5">
      {showsFirstActions(firstSteps) && !firstSteps.seen.has("lineup") && <MarkSeen saveId={id} item="lineup" />}
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-heading text-4xl font-bold" data-testid="lineup-title">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase" data-testid="lineup-instructions">
          {t("instructions", { date: formatShortDate(editor.matchDate, locale) })}
        </p>
        {/* Next to my eleven: adjust it while looking at his. */}
        {opponent !== null && (
          <div className="ml-auto">
            <OpponentSheet preview={opponent} besidePage />
          </div>
        )}
      </div>
      {showsTip("secondary", firstSteps) && <FirstStepTip saveId={id} tip="secondary" />}
      <LineupScreen saveId={id} editor={editor} squad={squad} />
    </div>
  );
}
