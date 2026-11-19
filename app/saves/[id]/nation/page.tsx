import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getCallUpEditor, getNationalTeamView } from "@/src/db/national-view";
import { CallUpCard } from "./_components/call-up-card";
import type { CallUpSheetData } from "./_components/call-up-sheet";
import { NationLineupCard } from "./_components/lineup-card";
import { NationHead } from "./_components/nation-head";
import { NationResults } from "./_components/nation-results";
import { NationSession } from "./_components/nation-session";
import { NationZone } from "./_components/nation-zone";
import { ResignNation } from "./_components/resign-nation";
import { initialSelection, shownCandidates } from "./_lib/call-up";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nationalTeam"))("title") };
}

type NationPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * « Ma sélection », the national coach's own tab under Équipe (docs/design/selections.md § 5, 9.7): his nation and its
 * federation's objective on the bright blue; his next break or summer tournament and its matches; his list of 23, his
 * own club's players in it said plainly, the sheet to change it until it starts; his lineup and who plays the friendlies;
 * his zone's qualifiers and his results of the season; and the way out, which keeps his club. No full orange here: the
 * game's action stays in the column, the sheets have theirs. 404 for a player who coaches no nation.
 */
export default async function NationPage({ params }: NationPageProps) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, view] = await Promise.all([getTranslations("nationalTeam"), getNationalTeamView(id)]);
  if (view === null) {
    notFound();
  }
  // His list's candidates, only while it may still change: none to read once his break or tournament has started.
  const editor = view.callUp !== null && !view.callUp.locked ? await getCallUpEditor(id) : null;
  const candidates = editor === null ? [] : shownCandidates(editor);
  const sheet: CallUpSheetData | null =
    editor === null || !editor.open
      ? null
      : { candidates, assistant: editor.assistant, initial: initialSelection(editor), hidden: editor.candidates.length - candidates.length };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 data-testid="nation-title" className="font-heading text-4xl font-bold">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <NationHead view={view} />

      {/* From lg, what is ahead on the left, the zone and the results on the right. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <NationSession view={view} />
          <CallUpCard saveId={id} view={view} sheet={sheet} />
          <NationLineupCard saveId={id} view={view} />
        </div>
        <div className="min-w-0 space-y-5">
          {view.zone !== null && <NationZone code={view.code} zone={view.zone} tournament={view.tournament} year={view.tournamentYear} />}
          <NationResults view={view} />
        </div>
      </div>

      <ResignNation saveId={id} code={view.code} canLeave={view.canLeave} session={view.session?.kind ?? "break"} />
    </div>
  );
}
