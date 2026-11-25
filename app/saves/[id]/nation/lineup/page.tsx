import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import Link from "@/src/components/link";
import { Panel } from "@/src/components/panel";
import { liveMatchesOf } from "@/src/db/lineup";
import { coachesNation, getCoachLineupEditor } from "@/src/db/national-view";
import { formatShortDate } from "@/src/lib/format";
import { LineupScreen } from "../../lineup/_components/lineup-editor";
import { saveCoachLineupAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nationalLineup"))("title") };
}

/**
 * The national coach's lineup (docs/design/selections.md § 5.2): the club's editor with his 23 for squad, at their
 * fitness on his nation's next match (formation, eleven, bench, starting instruction), the formations ranked as an AI
 * club of the first divisions ranks them, no player's sheet; without a change, his assistant's eleven, the one his match
 * then plays. Under Équipe, from his tab Sélection. A save whose player coaches no nation has none: 404; without a break
 * or a tournament ahead, nothing to prepare yet.
 */
export default async function NationalLineupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  if ((await coachesNation(id)) === null) {
    notFound();
  }
  const [t, tWorld, locale, editor, live] = await Promise.all([
    getTranslations("nationalLineup"),
    getTranslations("world"),
    getLocale(),
    getCoachLineupEditor(id),
    liveMatchesOf(id),
  ]);

  return (
    <div data-testid="nation-lineup" className="space-y-5">
      <div className="space-y-1">
        <Link
          href={`/saves/${id}/nation`}
          data-testid="nation-lineup-back"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground max-sm:min-h-11"
        >
          <ChevronLeftIcon className="size-4" />
          {t("back")}
        </Link>
        {/* The club's title size, on two tight lines on a phone. */}
        <h1 data-testid="nation-lineup-title" className="font-heading text-4xl leading-[0.95] font-bold">
          {t("title")}
        </h1>
        {editor !== null && (
          <p data-testid="nation-lineup-match" className="pt-1 text-sm text-muted-foreground">
            {t("nextMatch", { nation: tWorld(`nationalities.${editor.code}`), date: formatShortDate(editor.matchDate, locale) })}
          </p>
        )}
      </div>

      {editor === null ? (
        <Panel data-testid="nation-lineup-empty" className="p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </Panel>
      ) : (
        // Every gesture saved at once, no button (docs/design/effectif-adjoint.md § 1, point 1.F); read only while his
        // match waits live.
        <LineupScreen
          saveId={id}
          editor={editor}
          opponent={null}
          saveAction={saveCoachLineupAction}
          unsaved="assistant"
          liveHref={live.internationalId === null ? null : `/saves/${id}/live/nation?m=${live.internationalId}`}
          texts={{
            selectHint: { touch: t("selectHint.touch"), click: t("selectHint.click") },
            pickerAbout: t("pickerAbout"),
          }}
        />
      )}
    </div>
  );
}
